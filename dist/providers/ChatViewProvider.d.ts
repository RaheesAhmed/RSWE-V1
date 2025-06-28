import * as vscode from 'vscode';
import { RSWEManager } from '@/core/RSWEManager';
import { ProjectContextManager } from '@/core/ProjectContextManager';
/**
 * Chat View Provider for RSWE-V1 Sidebar
 *
 * Provides a modern, responsive chat interface for interacting with Claude Sonnet 4.
 * Features include:
 * - Real-time streaming responses
 * - Syntax highlighting for code blocks
 * - Session management
 * - Export/import functionality
 */
export declare class ChatViewProvider implements vscode.WebviewViewProvider {
    private readonly _extensionUri;
    private readonly _rsweManager;
    private readonly _projectContextManager;
    private readonly _context;
    static readonly viewType = "rswe.chatView";
    private _view?;
    private _currentSession;
    private _isContextLoaded;
    constructor(_extensionUri: vscode.Uri, _rsweManager: RSWEManager, _projectContextManager: ProjectContextManager, _context: vscode.ExtensionContext);
    /**
     * Initialize project context automatically when chat opens
     */
    private _initializeProjectContext;
    resolveWebviewView(webviewView: vscode.WebviewView, _context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken): void;
    private _handleWebviewMessage;
    private _handleSendMessage;
    private _handleExportChat;
    private _handleAnalyzeProject;
    private _handleImportChat;
    private _createNewSession;
    private _handleNewChat;
    private _handleSettings;
    private _handleHistory;
    private _handleSaveChat;
    private _postMessage;
    private _generateId;
    private _getHtmlForWebview;
    private _generateNonce;
}
//# sourceMappingURL=ChatViewProvider.d.ts.map