/**
 * PDF 帳單生成服務
 * 使用 Electron 內建的 printToPDF 功能
 */
import { BrowserWindow, app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'

// 帳單資料結構
export interface InvoiceData {
  invoiceNumber: string
  issueDate: string
  dueDate?: string
  customer: {
    name: string
    taxId: string
    contact?: string
    phone?: string
    address?: string
  }
  items: Array<{
    name: string
    description?: string
    quantity?: number
    unitPrice?: number
    amount: number
  }>
  discounts?: Array<{
    name: string
    amount: number
  }>
  subtotal: number
  totalDiscount?: number
  afterDiscount?: number
  taxRate: number
  tax: number
  total: number
  notes?: string
  paymentMethod?: string
}

/**
 * 渲染帳單 HTML 模板
 */
function renderInvoiceTemplate(data: InvoiceData): string {
  const formatCurrency = (amount: number) => {
    return `NT$ ${amount.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const itemsHtml = data.items.map(item => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e0e0e0;">${item.name}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e0e0e0; text-align: center;">${item.quantity || 1}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e0e0e0; text-align: right;">${formatCurrency(item.unitPrice || item.amount)}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e0e0e0; text-align: right; font-weight: 500;">${formatCurrency(item.amount)}</td>
    </tr>
  `).join('')

  const discountsHtml = data.discounts && data.discounts.length > 0
    ? data.discounts.map(d => `
      <tr style="color: #e53935;">
        <td colspan="3" style="padding: 8px 12px; text-align: right;">折扣: ${d.name}</td>
        <td style="padding: 8px 12px; text-align: right;">- ${formatCurrency(d.amount)}</td>
      </tr>
    `).join('')
    : ''

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>帳單 ${data.invoiceNumber}</title>
  <style>
    @page {
      size: A4;
      margin: 0;
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: "Microsoft JhengHei", "微軟正黑體", "Noto Sans TC", sans-serif;
      font-size: 14px;
      color: #333;
      background: white;
      padding: 40px;
      line-height: 1.6;
    }
    .invoice-container {
      max-width: 210mm;
      margin: 0 auto;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 3px solid #1976d2;
    }
    .company-info {
      flex: 1;
    }
    .company-name {
      font-size: 28px;
      font-weight: bold;
      color: #1976d2;
      margin-bottom: 8px;
    }
    .company-details {
      font-size: 12px;
      color: #666;
    }
    .invoice-title {
      text-align: right;
    }
    .invoice-label {
      font-size: 32px;
      font-weight: bold;
      color: #333;
      letter-spacing: 4px;
    }
    .invoice-number {
      font-size: 16px;
      color: #1976d2;
      margin-top: 8px;
    }
    .invoice-date {
      font-size: 13px;
      color: #666;
      margin-top: 4px;
    }
    .customer-section {
      background: #f8f9fa;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 30px;
    }
    .section-title {
      font-size: 14px;
      font-weight: bold;
      color: #1976d2;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .customer-info {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
    }
    .info-row {
      display: flex;
    }
    .info-label {
      width: 80px;
      color: #666;
      font-size: 13px;
    }
    .info-value {
      flex: 1;
      font-weight: 500;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    .items-table th {
      background: #1976d2;
      color: white;
      padding: 14px 12px;
      text-align: left;
      font-weight: 600;
      font-size: 13px;
    }
    .items-table th:nth-child(2),
    .items-table th:nth-child(3),
    .items-table th:nth-child(4) {
      text-align: center;
    }
    .items-table th:last-child {
      text-align: right;
    }
    .summary-section {
      display: flex;
      justify-content: flex-end;
      margin-top: 20px;
    }
    .summary-table {
      width: 300px;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #e0e0e0;
    }
    .summary-row.total {
      border-bottom: none;
      border-top: 2px solid #1976d2;
      margin-top: 8px;
      padding-top: 12px;
      font-size: 18px;
      font-weight: bold;
      color: #1976d2;
    }
    .summary-label {
      color: #666;
    }
    .summary-value {
      font-weight: 500;
    }
    .footer {
      margin-top: 60px;
      padding-top: 20px;
      border-top: 1px solid #e0e0e0;
    }
    .footer-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
      margin-bottom: 20px;
    }
    .footer-section h4 {
      font-size: 12px;
      color: #1976d2;
      margin-bottom: 8px;
      text-transform: uppercase;
    }
    .footer-section p {
      font-size: 12px;
      color: #666;
    }
    .thank-you {
      text-align: center;
      font-size: 16px;
      color: #1976d2;
      margin-top: 30px;
      font-weight: 500;
    }
    .stamp-area {
      display: flex;
      justify-content: flex-end;
      margin-top: 40px;
    }
    .stamp-box {
      width: 120px;
      height: 120px;
      border: 2px dashed #ccc;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #999;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="invoice-container">
    <!-- 頁首 -->
    <div class="header">
      <div class="company-info">
        <div class="company-name">UBL 電信</div>
        <div class="company-details">
          統一編號：88888888<br>
          地址：台北市信義區信義路五段 7 號<br>
          電話：02-8888-8888<br>
          電子郵件：service@ubl-telecom.com.tw
        </div>
      </div>
      <div class="invoice-title">
        <div class="invoice-label">帳 單</div>
        <div class="invoice-number">${data.invoiceNumber}</div>
        <div class="invoice-date">開立日期: ${data.issueDate}</div>
        ${data.dueDate ? `<div class="invoice-date">繳款期限: ${data.dueDate}</div>` : ''}
      </div>
    </div>

    <!-- 客戶資訊 -->
    <div class="customer-section">
      <div class="section-title">客戶資訊</div>
      <div class="customer-info">
        <div class="info-row">
          <span class="info-label">公司名稱：</span>
          <span class="info-value">${data.customer.name}</span>
        </div>
        <div class="info-row">
          <span class="info-label">統一編號：</span>
          <span class="info-value">${data.customer.taxId}</span>
        </div>
        ${data.customer.contact ? `
        <div class="info-row">
          <span class="info-label">聯絡人：</span>
          <span class="info-value">${data.customer.contact}</span>
        </div>
        ` : ''}
        ${data.customer.phone ? `
        <div class="info-row">
          <span class="info-label">電話：</span>
          <span class="info-value">${data.customer.phone}</span>
        </div>
        ` : ''}
      </div>
    </div>

    <!-- 費用明細 -->
    <div class="section-title">費用明細</div>
    <table class="items-table">
      <thead>
        <tr>
          <th style="width: 50%;">項目名稱</th>
          <th style="width: 15%;">數量</th>
          <th style="width: 17%;">單價</th>
          <th style="width: 18%;">金額</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
        ${discountsHtml}
      </tbody>
    </table>

    <!-- 金額摘要 -->
    <div class="summary-section">
      <div class="summary-table">
        <div class="summary-row">
          <span class="summary-label">小計</span>
          <span class="summary-value">${formatCurrency(data.subtotal)}</span>
        </div>
        ${data.totalDiscount ? `
        <div class="summary-row" style="color: #e53935;">
          <span class="summary-label">折扣合計</span>
          <span class="summary-value">- ${formatCurrency(data.totalDiscount)}</span>
        </div>
        ` : ''}
        ${data.afterDiscount ? `
        <div class="summary-row">
          <span class="summary-label">折扣後金額</span>
          <span class="summary-value">${formatCurrency(data.afterDiscount)}</span>
        </div>
        ` : ''}
        <div class="summary-row">
          <span class="summary-label">營業稅 (${(data.taxRate * 100).toFixed(0)}%)</span>
          <span class="summary-value">${formatCurrency(data.tax)}</span>
        </div>
        <div class="summary-row total">
          <span>應付總額</span>
          <span>${formatCurrency(data.total)}</span>
        </div>
      </div>
    </div>

    <!-- 頁尾 -->
    <div class="footer">
      <div class="footer-grid">
        <div class="footer-section">
          <h4>付款方式</h4>
          <p>${data.paymentMethod || '月結付款'}</p>
        </div>
        <div class="footer-section">
          <h4>發票類型</h4>
          <p>三聯式發票</p>
        </div>
        <div class="footer-section">
          <h4>備註</h4>
          <p>${data.notes || '如有疑問請聯絡客服專線'}</p>
        </div>
      </div>
      
      <div class="stamp-area">
        <div class="stamp-box">公司章</div>
      </div>
      
      <div class="thank-you">
        感謝您選擇 UBL 電信！
      </div>
    </div>
  </div>
</body>
</html>`
}

/**
 * 生成 PDF 帳單
 */
export async function generateInvoicePDF(invoiceData: InvoiceData): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    let win: BrowserWindow | null = null
    
    try {
      // 創建隱藏視窗
      win = new BrowserWindow({
        show: false,
        width: 794,  // A4 寬度 (210mm at 96dpi)
        height: 1123, // A4 高度 (297mm at 96dpi)
        webPreferences: {
          offscreen: true,
          nodeIntegration: false,
          contextIsolation: true
        }
      })

      // 渲染 HTML 模板
      const html = renderInvoiceTemplate(invoiceData)
      
      // 載入 HTML
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
      
      // 等待頁面完全渲染
      await new Promise(r => setTimeout(r, 500))
      
      // 生成 PDF
      const pdfBuffer = await win.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        margins: {
          top: 0,
          bottom: 0,
          left: 0,
          right: 0
        }
      })
      
      console.log('[PDF Generator] PDF generated, size:', pdfBuffer.length, 'bytes')
      resolve(pdfBuffer)
      
    } catch (error) {
      console.error('[PDF Generator] Error:', error)
      reject(error)
    } finally {
      if (win) {
        win.close()
      }
    }
  })
}

/**
 * 生成並儲存 PDF 檔案
 */
export async function generateAndSaveInvoicePDF(
  invoiceData: InvoiceData,
  outputPath?: string
): Promise<string> {
  const pdfBuffer = await generateInvoicePDF(invoiceData)
  
  // 如果沒有指定路徑，使用預設路徑
  const finalPath = outputPath || path.join(
    app.getPath('documents'),
    `invoice-${invoiceData.invoiceNumber}.pdf`
  )
  
  // 確保目錄存在
  const dir = path.dirname(finalPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  
  // 寫入檔案
  fs.writeFileSync(finalPath, pdfBuffer)
  console.log('[PDF Generator] PDF saved to:', finalPath)
  
  return finalPath
}

/**
 * 從 AI 生成的文字解析帳單資料
 */
export function parseInvoiceFromText(text: string): InvoiceData | null {
  try {
    // 嘗試找到 JSON 格式的資料
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1])
    }
    
    // 嘗試直接解析 JSON
    if (text.trim().startsWith('{')) {
      return JSON.parse(text)
    }
    
    // 如果是純文字格式，嘗試解析
    console.log('[PDF Generator] Attempting to parse text format invoice')
    
    // 提取帳單編號
    const invoiceNumberMatch = text.match(/帳單編號[：:]\s*(\S+)/)
    const invoiceNumber = invoiceNumberMatch ? invoiceNumberMatch[1] : `INV-${Date.now()}`
    
    // 提取日期
    const dateMatch = text.match(/(?:帳單日期|開立日期)[：:]\s*([\d\/\-\.]+)/)
    const issueDate = dateMatch ? dateMatch[1] : new Date().toISOString().split('T')[0]
    
    // 提取客戶資訊
    const companyMatch = text.match(/(?:公司名稱|企業名稱)[：:]\s*(.+)/)
    const taxIdMatch = text.match(/統一編號[：:]\s*(\d+)/)
    const contactMatch = text.match(/聯絡人[：:姓名]*\s*(.+)/)
    const phoneMatch = text.match(/(?:聯絡電話|電話)[：:]\s*(\S+)/)
    
    // 提取費用項目
    const items: InvoiceData['items'] = []
    const itemPatterns = [
      /(\d+)\.\s*([^：:]+)[：:]\s*(?:NT\$?\s*)?([\d,]+)/g,
      /([^：:\n]+)費用[：:]\s*(?:NT\$?\s*)?([\d,]+)/g
    ]
    
    for (const pattern of itemPatterns) {
      let match
      while ((match = pattern.exec(text)) !== null) {
        const name = match[2] || match[1]
        const amount = parseFloat(match[3] || match[2].replace(/,/g, ''))
        if (name && !isNaN(amount)) {
          items.push({ name: name.trim(), amount })
        }
      }
    }
    
    // 如果沒找到項目，使用預設
    if (items.length === 0) {
      items.push({ name: '服務費用', amount: 0 })
    }
    
    // 提取金額
    const totalMatch = text.match(/(?:應付總[額金]|總計)[：:（(]?含稅[)）]?\s*(?:NT\$?\s*)?([\d,\.]+)/)
    const taxMatch = text.match(/營業稅[^：:]*[：:]\s*(?:NT\$?\s*)?([\d,\.]+)/)
    
    const total = totalMatch ? parseFloat(totalMatch[1].replace(/,/g, '')) : 0
    const tax = taxMatch ? parseFloat(taxMatch[1].replace(/,/g, '')) : total * 0.05 / 1.05
    const subtotal = total - tax
    
    return {
      invoiceNumber,
      issueDate,
      customer: {
        name: companyMatch ? companyMatch[1].trim() : '未知客戶',
        taxId: taxIdMatch ? taxIdMatch[1] : '00000000',
        contact: contactMatch ? contactMatch[1].trim() : undefined,
        phone: phoneMatch ? phoneMatch[1] : undefined
      },
      items,
      subtotal: Math.round(subtotal * 100) / 100,
      taxRate: 0.05,
      tax: Math.round(tax * 100) / 100,
      total
    }
  } catch (error) {
    console.error('[PDF Generator] Failed to parse invoice:', error)
    return null
  }
}
