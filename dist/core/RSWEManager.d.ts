import * as vscode from 'vscode';
import { RSWEConfig, ChatMessage, ProjectAnalysis, MCPServer, ValidationResult } from '@/types';
/**
 * Core RSWE Manager - The Brain of RSWE-V1
 *
 * Orchestrates all RSWE functionality including:
 * - Claude Sonnet 4 integration
 * - Project analysis and context management
 * - MCP server coordination
 * - Code validation and error prevention
 */
export declare class RSWEManager {
    private config;
    private claudeClient?;
    private projectAnalysis;
    private mcpServers;
    private isInitialized;
    constructor(_context: vscode.ExtensionContext);
    /**
     * Initialize the RSWE Manager
     */
    initialize(): Promise<void>;
    /**
     * Update configuration from VS Code settings
     */
    updateConfiguration(): Promise<void>;
    /**
     * Get current configuration (alias for getConfiguration)
     */
    getConfig(): RSWEConfig | null;
    /**
     * Send a chat message to Claude and get response
     */
    sendChatMessage(message: string, _context?: ChatMessage[]): Promise<{
        content: string;
        metadata: {
            tokens: number;
        };
    }>;
    /**
     * Send streaming chat message with real-time updates
     */
    sendStreamingChatMessage(message: string, _context: ChatMessage[] | undefined, onProgress: (chunk: {
        content: string;
        done: boolean;
    }) => void): Promise<{
        content: string;
        metadata: {
            tokens: number;
        };
    }>;
    /**
     * Analyze the current project
     */
    analyzeProject(): Promise<ProjectAnalysis>;
    /**
     * Get current project analysis
     */
    getProjectAnalysis(): Promise<ProjectAnalysis | null>;
    /**
     * Validate code in a document
     */
    validateCode(document: vscode.TextDocument): Promise<ValidationResult>;
    /**
     * Get MCP servers
     */
    getMCPServers(): Promise<MCPServer[]>;
    /**
     * Refresh MCP servers
     */
    refreshMCPServers(): Promise<void>;
    /**
     * Initialize Claude client
     */
    private _initializeClaudeClient;
    /**
     * Initialize MCP servers
     */
    private _initializeMCPServers;
}
//# sourceMappingURL=RSWEManager.d.ts.map