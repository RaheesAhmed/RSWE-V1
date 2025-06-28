import * as vscode from 'vscode';
import { ProjectAnalysis } from '@/types';
/**
 * ProjectContextManager - Real-time Project Intelligence
 *
 * Provides real-time context awareness by:
 * - Auto-analyzing projects when workspace opens
 * - Tracking file changes in real-time
 * - Maintaining dependency graphs
 * - Providing context to AI chat sessions
 */
export declare class ProjectContextManager {
    private _context;
    private _currentAnalysis;
    private _fileWatcher;
    private _isWatching;
    private _analysisInProgress;
    private _onContextUpdated;
    readonly onContextUpdated: vscode.Event<ProjectAnalysis>;
    constructor(context: vscode.ExtensionContext);
    /**
     * Initialize real-time file watching for context updates
     */
    private _initializeFileWatching;
    /**
     * Auto-analyze project when workspace is available
     */
    initializeProjectContext(): Promise<ProjectAnalysis | null>;
    /**
     * Get current project analysis with real-time context
     */
    getCurrentAnalysis(): ProjectAnalysis | null;
    /**
     * Get contextual information for AI chat sessions
     */
    getContextForChat(): string;
    /**
     * Handle file creation events
     */
    private _onFileCreated;
    /**
     * Handle file change events
     */
    private _onFileChanged;
    /**
     * Handle file deletion events
     */
    private _onFileDeleted;
    /**
     * Perform incremental context update (lightweight)
     */
    private _incrementalUpdate;
    /**
     * Check if file should be ignored for context tracking
     */
    private _shouldIgnoreFile;
    /**
     * Perform full project analysis (reused from RSWEManager)
     */
    private _performFullAnalysis;
    private _discoverProjectFiles;
    private _classifyFiles;
    private _analyzeCodeFiles;
    private _buildDependencyGraph;
    private _calculateProjectMetrics;
    private _detectLanguage;
    private _extractDependencies;
    private _extractExports;
    private _calculateFileComplexity;
    private _serializeAnalysis;
    /**
     * Dispose resources and cleanup
     */
    dispose(): void;
}
//# sourceMappingURL=ProjectContextManager.d.ts.map