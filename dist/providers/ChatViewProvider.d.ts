import * as vscode from 'vscode';
import { RSWEManager } from '@/core/RSWEManager';
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
    static readonly viewType = "rswe.chatView";
    private _view?;
    private _currentSession;
    constructor(_extensionUri: vscode.Uri, _rsweManager: RSWEManager);
    resolveWebviewView(webviewView: vscode.WebviewView, _context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken): void;
    private _handleWebviewMessage;
    private _handleSendMessage;
    private _handleClearChat;
    private _handleExportChat;
    private _handleImportChat;
    private _createNewSession;
    private _postMessage;
    private _generateId;
    private _getHtmlForWebview;
    private _generateNonce;
}
//# sourceMappingURL=ChatViewProvider.d.ts.map