import { AgentPresetId } from './agent-presets';

// 環境變數定義
export interface EnvVariable {
  key: string;
  value: string;
  enabled: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  alias?: string;
  role?: string;
  folderPath: string;
  createdAt: number;
  defaultAgent?: AgentPresetId;  // Workspace 預設 Agent
  envVars?: EnvVariable[];       // Workspace 專屬環境變數
  linkedSkills?: string[];       // 關聯的技能 ID 列表（新技能系統）
  // 工作區獨立的面板狀態（當 sharedPanels 對應項為 false 時使用）
  panelStates?: {
    copilotMessages?: any[];      // Copilot 聊天記錄
    fileExplorerConnections?: any[]; // FILE 連線列表
    apiTesterHistory?: any[];     // API 測試器歷史
    oracleConnections?: any[];    // 資料庫連線
    snippets?: any[];             // 筆記內容
  };
  // 技能模式相關（舊版，保留兼容性）
  skillConfig?: {
    isSkill?: boolean;            // 是否為技能工作區
    initCommand?: string;         // 初始化命令
    shortcuts?: SkillShortcut[];  // 快捷操作按鈕
    workflow?: SkillWorkflowStep[]; // 工作流程步驟（從 skill.md 解析）
    description?: string;         // 技能簡短描述
    tags?: string[];              // 技能標籤
  };
}

// 技能快捷操作定義
export type SkillShortcutType = 'terminal' | 'api' | 'db' | 'web' | 'file' | 'wait';

// 工作流程步驟（從 skill.md 解析）
export interface SkillWorkflowStep {
  type: SkillShortcutType;
  label: string;
  
  // TERMINAL
  command?: string;
  
  // API
  apiMethod?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  apiUrl?: string;
  apiHeaders?: Record<string, string>;
  apiBody?: string;
  
  // DB
  dbQuery?: string;
  dbConnection?: string;
  
  // WEB
  webUrl?: string;
  
  // FILE
  fileAction?: 'download' | 'upload' | 'open';
  filePath?: string;
  
  // WAIT
  waitCondition?: 'log_contains' | 'api_status' | 'file_exists' | 'time';
  waitTarget?: string;
  waitTimeout?: number;
}

export interface SkillShortcut {
  id: string;
  label: string;
  type: SkillShortcutType;
  icon?: string;
  
  // TERMINAL 類型
  command?: string;
  
  // API 類型
  apiMethod?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  apiUrl?: string;
  apiHeaders?: Record<string, string>;
  apiBody?: string;
  
  // DB 類型
  dbQuery?: string;
  dbConnection?: string;  // 連線名稱或 ID
  
  // WEB 類型
  webUrl?: string;
  
  // FILE 類型
  fileAction?: 'download' | 'upload' | 'open';
  filePath?: string;
  
  // WAIT 類型
  waitCondition?: 'log_contains' | 'api_status' | 'file_exists' | 'time';
  waitTarget?: string;  // 要等待的內容（關鍵字、檔案路徑等）
  waitTimeout?: number;  // 超時時間（秒）
}

// Preset roles for quick selection
export const PRESET_ROLES = [
  { id: 'not-started', name: '尚未開始', color: '#550a0aff' },
  { id: 'in-progress', name: '進行中', color: '#1100ffff' },
  { id: 'completed', name: '已完成', color: '#074901ff' },
] as const;

export interface TerminalInstance {
  id: string;
  workspaceId: string;
  type: 'terminal' | 'oracle' | 'webview' | 'file' | 'api';  // terminal、oracle、webview、file explorer 或 api tester
  agentPreset?: AgentPresetId;   // 可選的 Agent 預設
  title: string;
  alias?: string;
  pid?: number;
  cwd: string;
  url?: string;  // WebView URL（僅用於 type='webview'）
  webviewContent?: string;  // WebView 頁面內容（用於 AI 分析）
  oracleQueryResult?: string;  // Oracle 查詢結果（用於 AI 分析）
  oracleConfig?: {  // Oracle 連接配置（僅用於 type='oracle'）
    host: string;
    port: string;
    service: string;
    username: string;
    password: string;
  };
  scrollbackBuffer: string[];
  chatMessages?: CopilotMessage[]; // Copilot chat 對話記錄（僅用於 type='copilot'）
  lastActivityTime?: number;
}

export interface AppState {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  terminals: TerminalInstance[];
  activeTerminalId: string | null;
  focusedTerminalId: string | null;
}

export interface CreatePtyOptions {
  id: string;
  cwd: string;
  type: 'terminal';  // terminal only
  agentPreset?: AgentPresetId;   // 可選的 Agent 預設
  shell?: string;
  customEnv?: Record<string, string>;  // 自定義環境變數
}

export interface PtyOutput {
  id: string;
  data: string;
}

export interface PtyExit {
  id: string;
  exitCode: number;
}

export type ShellType = 'auto' | 'pwsh' | 'powershell' | 'cmd' | 'custom';

export type FontType = 'system' | 'sf-mono' | 'menlo' | 'consolas' | 'monaco' | 'fira-code' | 'jetbrains-mono' | 'custom';

export const FONT_OPTIONS: { id: FontType; name: string; fontFamily: string }[] = [
  { id: 'system', name: 'System Default', fontFamily: 'monospace' },
  { id: 'sf-mono', name: 'SF Mono', fontFamily: '"SF Mono", monospace' },
  { id: 'menlo', name: 'Menlo', fontFamily: 'Menlo, monospace' },
  { id: 'consolas', name: 'Consolas', fontFamily: 'Consolas, monospace' },
  { id: 'monaco', name: 'Monaco', fontFamily: 'Monaco, monospace' },
  { id: 'fira-code', name: 'Fira Code', fontFamily: '"Fira Code", monospace' },
  { id: 'jetbrains-mono', name: 'JetBrains Mono', fontFamily: '"JetBrains Mono", monospace' },
  { id: 'custom', name: 'Custom', fontFamily: 'monospace' },
];

// Preset terminal color themes
export const COLOR_PRESETS = [
  {
    id: 'novel',
    name: 'Novel (Default)',
    background: '#1f1d1a',
    foreground: '#dfdbc3',
    cursor: '#dfdbc3'
  },
  {
    id: 'dracula',
    name: 'Dracula',
    background: '#282a36',
    foreground: '#f8f8f2',
    cursor: '#f8f8f2'
  },
  {
    id: 'monokai',
    name: 'Monokai',
    background: '#272822',
    foreground: '#f8f8f2',
    cursor: '#f8f8f2'
  },
  {
    id: 'solarized-dark',
    name: 'Solarized Dark',
    background: '#002b36',
    foreground: '#839496',
    cursor: '#839496'
  },
  {
    id: 'nord',
    name: 'Nord',
    background: '#2e3440',
    foreground: '#d8dee9',
    cursor: '#d8dee9'
  },
  {
    id: 'one-dark',
    name: 'One Dark',
    background: '#282c34',
    foreground: '#abb2bf',
    cursor: '#abb2bf'
  },
  {
    id: 'custom',
    name: 'Custom',
    background: '#1f1d1a',
    foreground: '#dfdbc3',
    cursor: '#dfdbc3'
  },
] as const;

export type ColorPresetId = typeof COLOR_PRESETS[number]['id'];

// Agent command type for auto-start
export type AgentCommandType = 'claude' | 'gemini' | 'codex' | 'custom';

export const AGENT_COMMAND_OPTIONS: { id: AgentCommandType; name: string; command: string }[] = [
  { id: 'claude', name: 'Claude Code', command: 'claude' },
  { id: 'gemini', name: 'Gemini CLI', command: 'gemini' },
  { id: 'codex', name: 'Codex CLI', command: 'codex' },
  { id: 'custom', name: 'Custom', command: '' },
];

export interface AppSettings {
  shell: ShellType;
  customShellPath: string;
  fontSize: number;
  fontFamily: FontType;
  customFontFamily: string;
  theme: 'dark' | 'light';
  colorPreset: ColorPresetId;
  customBackgroundColor: string;
  customForegroundColor: string;
  customCursorColor: string;
  globalEnvVars?: EnvVariable[];  // 全域環境變數
  defaultAgent?: AgentPresetId;   // 全域預設 Agent
  agentAutoCommand: boolean;      // 是否自動啟動 Agent
  agentCommandType: AgentCommandType;  // Agent 命令類型
  agentCustomCommand: string;     // 自定義 Agent 命令
  defaultTerminalCount: number;   // 每個 workspace 預設的 terminal 數量
  createDefaultAgentTerminal: boolean;  // 是否預設建立 Agent Terminal
  webViewUrl?: string;            // 嵌入網頁的 URL
  // 面板共用設定 - true 表示所有工作區共用，false 表示每個工作區獨立
  sharedPanels?: {
    copilot?: boolean;      // Copilot 面板是否共用（預設 true）
    fileExplorer?: boolean; // FILE 面板是否共用（預設 true）
    apiTester?: boolean;    // API 面板是否共用（預設 true）
    oracle?: boolean;       // 資料庫連線是否共用（預設 true）
    webView?: boolean;      // 網頁視窗是否共用（預設 true）
    snippets?: boolean;     // 筆記面板是否共用（預設 true）
    skills?: boolean;       // 技能面板是否共用（預設 true）
  };
}

// GitHub Copilot Integration
export type CopilotProvider = 'github' | 'm365'

export interface CopilotConfig {
  enabled: boolean;
  provider: CopilotProvider; // 選擇使用哪個 Copilot
  
  // GitHub Copilot
  apiKey: string; // GitHub PAT with 'copilot' scope
  organizationSlug?: string; // For organization-based Copilot access
  model?: string; // Model to use: gpt-4, gpt-4o, claude-3.5-sonnet, etc.
  
  // M365 Copilot
  m365Config?: {
    tenantId: string; // Azure AD Tenant ID
    clientId: string; // Azure AD App Client ID
    accessToken?: string; // OAuth access token
    refreshToken?: string; // OAuth refresh token
    tokenExpiry?: number; // Token 過期時間
    endpoint?: string; // M365 Copilot API endpoint
  };
  
  // 知識庫選擇策略
  knowledgeSelectionMode?: 'keyword' | 'ai'; // keyword: 關鍵詞匹配, ai: 用AI模型選擇
}

export interface CopilotMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface CopilotChatOptions {
  messages: CopilotMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface CopilotChatResponse {
  content: string;
  finishReason: 'stop' | 'length' | 'error';
  model?: string; // 實際使用的模型名稱
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

