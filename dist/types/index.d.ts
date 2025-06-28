import * as vscode from 'vscode';
import { z } from 'zod';
export declare const RSWEConfigSchema: z.ZodObject<{
    anthropic: z.ZodObject<{
        apiKey: z.ZodString;
        model: z.ZodEnum<["claude-3-5-sonnet-latest", "claude-sonnet-4-20250514", "claude-3-opus-latest"]>;
    }, "strip", z.ZodTypeAny, {
        apiKey: string;
        model: "claude-3-5-sonnet-latest" | "claude-sonnet-4-20250514" | "claude-3-opus-latest";
    }, {
        apiKey: string;
        model: "claude-3-5-sonnet-latest" | "claude-sonnet-4-20250514" | "claude-3-opus-latest";
    }>;
    context: z.ZodObject<{
        maxFiles: z.ZodNumber;
        enableSemanticSearch: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        maxFiles: number;
        enableSemanticSearch: boolean;
    }, {
        maxFiles: number;
        enableSemanticSearch: boolean;
    }>;
    validation: z.ZodObject<{
        enablePreExecution: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        enablePreExecution: boolean;
    }, {
        enablePreExecution: boolean;
    }>;
    mcp: z.ZodObject<{
        enabledServers: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        enabledServers: string[];
    }, {
        enabledServers: string[];
    }>;
}, "strip", z.ZodTypeAny, {
    validation: {
        enablePreExecution: boolean;
    };
    anthropic: {
        apiKey: string;
        model: "claude-3-5-sonnet-latest" | "claude-sonnet-4-20250514" | "claude-3-opus-latest";
    };
    context: {
        maxFiles: number;
        enableSemanticSearch: boolean;
    };
    mcp: {
        enabledServers: string[];
    };
}, {
    validation: {
        enablePreExecution: boolean;
    };
    anthropic: {
        apiKey: string;
        model: "claude-3-5-sonnet-latest" | "claude-sonnet-4-20250514" | "claude-3-opus-latest";
    };
    context: {
        maxFiles: number;
        enableSemanticSearch: boolean;
    };
    mcp: {
        enabledServers: string[];
    };
}>;
export type RSWEConfig = z.infer<typeof RSWEConfigSchema>;
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
export interface RSWEEvent<T = any> {
    type: string;
    payload: T;
    timestamp: Date;
}
export type RSWEEventHandler<T = any> = (event: RSWEEvent<T>) => void | Promise<void>;
export type Awaitable<T> = T | Promise<T>;
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
export declare class RSWEError extends Error {
    readonly code: string;
    readonly context?: Record<string, any> | undefined;
    constructor(message: string, code: string, context?: Record<string, any> | undefined);
}
export declare class ClaudeError extends RSWEError {
    constructor(message: string, context?: Record<string, any>);
}
export declare class MCPError extends RSWEError {
    constructor(message: string, context?: Record<string, any>);
}
export declare class ValidationError extends RSWEError {
    constructor(message: string, context?: Record<string, any>);
}
//# sourceMappingURL=index.d.ts.map