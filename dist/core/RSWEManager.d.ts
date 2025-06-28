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
    sendStreamingChatMessage(message: string, onProgress: (chunk: {
        content: string;
        done: boolean;
    }) => void): Promise<{
        content: string;
        metadata: {
            tokens: number;
        };
    }>;
    /**
     * Analyze the current project with comprehensive codebase intelligence
     */
    analyzeProject(): Promise<ProjectAnalysis>;
    /**
     * Step 1: Discover all files in the project
     */
    private _discoverProjectFiles;
    /**
     * Step 2: Classify files by type and purpose
     */
    private _classifyFiles;
    /**
     * Step 3: Deep analyze code files with AST parsing
     */
    private _analyzeCodeFiles;
    /**
     * Step 4: Build comprehensive dependency graph
     */
    private _buildDependencyGraph;
    /**
     * Step 5: Calculate comprehensive project metrics
     */
    private _calculateProjectMetrics;
    /**
     * Helper: Detect programming language from extension
     */
    private _detectLanguage;
    /**
     * Helper: Extract dependencies from code content
     */
    private _extractDependencies;
    /**
     * Helper: Extract exports from code content
     */
    private _extractExports;
    /**
     * Helper: Calculate basic complexity score for a file
     */
    private _calculateFileComplexity;
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