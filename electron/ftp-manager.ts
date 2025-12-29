import SftpClient from 'ssh2-sftp-client'
import { Client as FtpClient } from 'basic-ftp'
import * as fs from 'fs'
import * as path from 'path'

interface ConnectionConfig {
  type: 'ftp' | 'sftp' | 'local'
  host: string
  port: number
  username: string
  password?: string
  basePath: string
  passive?: boolean
  transferMode?: 'binary' | 'ascii'
}

interface FileItem {
  name: string
  path: string
  isDirectory: boolean
  size?: number
  modifiedTime?: string
}

export class FtpManager {
  private sftpClient: SftpClient | null = null
  private ftpClient: FtpClient | null = null
  private currentType: 'ftp' | 'sftp' | 'local' | null = null

  async connect(config: ConnectionConfig): Promise<void> {
    // 关闭现有连接
    await this.disconnect()

    this.currentType = config.type

    if (config.type === 'sftp') {
      this.sftpClient = new SftpClient()
      await this.sftpClient.connect({
        host: config.host,
        port: config.port,
        username: config.username,
        password: config.password,
        readyTimeout: 10000
      })
    } else if (config.type === 'ftp') {
      this.ftpClient = new FtpClient()
      this.ftpClient.ftp.verbose = true // 啟用詳細日誌
      
      await this.ftpClient.access({
        host: config.host,
        port: config.port,
        user: config.username,
        password: config.password,
        secure: false
      })
      
      // 設置被動模式
      if (config.passive !== false) {
        await this.ftpClient.send('PASV')
      }
      
      // 設置傳輸模式
      if (config.transferMode === 'ascii') {
        await this.ftpClient.send('TYPE A')
      } else {
        await this.ftpClient.send('TYPE I') // Binary mode
      }
    } else if (config.type === 'local') {
      // 本地路径不需要连接
      if (!fs.existsSync(config.basePath)) {
        throw new Error(`路径不存在: ${config.basePath}`)
      }
    }
  }

  async disconnect(): Promise<void> {
    if (this.sftpClient) {
      await this.sftpClient.end()
      this.sftpClient = null
    }
    if (this.ftpClient) {
      this.ftpClient.close()
      this.ftpClient = null
    }
    this.currentType = null
  }

  async listFiles(remotePath: string): Promise<FileItem[]> {
    if (this.currentType === 'sftp' && this.sftpClient) {
      const list = await this.sftpClient.list(remotePath)
      return list.map(item => ({
        name: item.name,
        path: path.posix.join(remotePath, item.name),
        isDirectory: item.type === 'd',
        size: item.size,
        modifiedTime: new Date(item.modifyTime).toISOString()
      }))
    } else if (this.currentType === 'ftp' && this.ftpClient) {
      const list = await this.ftpClient.list(remotePath)
      return list.map(item => ({
        name: item.name,
        path: path.posix.join(remotePath, item.name),
        isDirectory: item.isDirectory,
        size: item.size,
        modifiedTime: item.modifiedAt?.toISOString()
      }))
    } else if (this.currentType === 'local') {
      const files = await fs.promises.readdir(remotePath, { withFileTypes: true })
      return await Promise.all(files.map(async file => {
        const fullPath = path.join(remotePath, file.name)
        const stats = await fs.promises.stat(fullPath)
        return {
          name: file.name,
          path: fullPath,
          isDirectory: file.isDirectory(),
          size: stats.size,
          modifiedTime: stats.mtime.toISOString()
        }
      }))
    }
    return []
  }

  async readFile(remotePath: string): Promise<string> {
    if (this.currentType === 'sftp' && this.sftpClient) {
      const buffer = await this.sftpClient.get(remotePath)
      return buffer.toString('utf-8')
    } else if (this.currentType === 'ftp' && this.ftpClient) {
      // FTP 需要下载到临时文件
      const tempPath = path.join(require('os').tmpdir(), `ftp_${Date.now()}.tmp`)
      await this.ftpClient.downloadTo(tempPath, remotePath)
      const content = await fs.promises.readFile(tempPath, 'utf-8')
      await fs.promises.unlink(tempPath)
      return content
    } else if (this.currentType === 'local') {
      return await fs.promises.readFile(remotePath, 'utf-8')
    }
    throw new Error('未连接')
  }

  async downloadFile(remotePath: string, localPath: string): Promise<void> {
    if (this.currentType === 'sftp' && this.sftpClient) {
      await this.sftpClient.get(remotePath, localPath)
    } else if (this.currentType === 'ftp' && this.ftpClient) {
      await this.ftpClient.downloadTo(localPath, remotePath)
    } else if (this.currentType === 'local') {
      await fs.promises.copyFile(remotePath, localPath)
    } else {
      throw new Error('未连接')
    }
  }

  isConnected(): boolean {
    return this.currentType !== null && 
           (this.currentType === 'local' || 
            (this.currentType === 'sftp' && this.sftpClient !== null) ||
            (this.currentType === 'ftp' && this.ftpClient !== null))
  }
}
