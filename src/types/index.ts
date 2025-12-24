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
  type: 'terminal' | 'copilot';  // terminal 或 copilot chat
  agentPreset?: AgentPresetId;   // 可選的 Agent 預設
  title: string;
  alias?: string;
  pid?: number;
  cwd: string;
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
  type: 'terminal' | 'copilot';  // terminal 或 copilot chat
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
}

// GitHub Copilot Integration
export interface CopilotConfig {
  enabled: boolean;
  apiKey: string; // GitHub PAT with 'copilot' scope
  organizationSlug?: string; // For organization-based Copilot access
  model?: string; // Model to use: gpt-4, gpt-4o, claude-3.5-sonnet, etc.
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

