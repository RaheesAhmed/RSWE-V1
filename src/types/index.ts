import * as vscode from 'vscode';
import { z } from 'zod';

// Configuration schemas
export const RSWEConfigSchema = z.object({
  anthropic: z.object({
    apiKey: z.string().min(1),
    model: z.enum(['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-opus-latest'])
  }),
  context: z.object({
    maxFiles: z.number().min(1).max(100000),
    enableSemanticSearch: z.boolean()
  }),
  validation: z.object({
    enablePreExecution: z.boolean()
  }),
  mcp: z.object({
    enabledServers: z.array(z.string())
  })
});

export type RSWEConfig = z.infer<typeof RSWEConfigSchema>;

// Chat message types
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    tokens?: number;
    model?: string;
    error?: string;
  };
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

// Project analysis types
export interface ProjectFile {
  path: string;
  relativePath: string;
  name: string;
  extension: string;
  type: 'file' | 'directory';
  size: number;
  lines: number;
  language?: string;
  lastModified: Date;
  dependencies?: string[];
  exports?: string[];
}

export interface ProjectAnalysis {
  files: ProjectFile[];
  dependencies: Map<string, string[]>;
  structure: ProjectStructure;
  metrics: ProjectMetrics;
}

export interface ProjectStructure {
  root: string;
  src: string[];
  tests: string[];
  configs: string[];
  docs: string[];
}

export interface ProjectMetrics {
  totalFiles: number;
  totalLines: number;
  languages: Record<string, number>;
  complexity: number;
  coverage?: number;
}

// MCP types
export interface MCPServer {
  id: string;
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  url?: string;
  command?: string;
  transport: 'stdio' | 'http' | 'sse';
  tools: MCPTool[];
  lastPing?: Date;
}

export interface MCPTool {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

// Webview message types
export interface WebviewMessage {
  type: string;
  payload: any;
}

export interface ChatWebviewMessage extends WebviewMessage {
  type: 'chat.send' | 'chat.clear' | 'chat.export' | 'chat.import' | 'chat.new' | 'chat.settings' | 'chat.history' | 'chat.save' | 'project.analyze';
  payload: {
    message?: string;
    sessionId?: string;
    session?: ChatSession;
    data?: any;
  };
}

// Tree view types
export interface TreeViewItem {
  id: string;
  label: string;
  description?: string;
  tooltip?: string;
  iconPath?: vscode.ThemeIcon | string;
  collapsibleState?: vscode.TreeItemCollapsibleState;
  children?: TreeViewItem[];
  contextValue?: string;
  command?: vscode.Command;
}

// Validation types
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: ValidationSuggestion[];
}

export interface ValidationError {
  id: string;
  message: string;
  file: string;
  line: number;
  column: number;
  severity: 'error' | 'warning' | 'info';
}

export interface ValidationWarning {
  id: string;
  message: string;
  file: string;
  line: number;
  column: number;
}

export interface ValidationSuggestion {
  id: string;
  message: string;
  file: string;
  line: number;
  column: number;
  fix?: string;
}

// Event types
export interface RSWEEvent<T = any> {
  type: string;
  payload: T;
  timestamp: Date;
}

export type RSWEEventHandler<T = any> = (event: RSWEEvent<T>) => void | Promise<void>;

// Utility types
export type Awaitable<T> = T | Promise<T>;
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// Error types
export class RSWEError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, any>
  ) {
    super(message);
    this.name = 'RSWEError';
  }
}

export class ClaudeError extends RSWEError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'CLAUDE_ERROR', context);
    this.name = 'ClaudeError';
  }
}

export class MCPError extends RSWEError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'MCP_ERROR', context);
    this.name = 'MCPError';
  }
}

export class ValidationError extends RSWEError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'VALIDATION_ERROR', context);
    this.name = 'ValidationError';
  }
}
