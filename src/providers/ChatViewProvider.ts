import * as vscode from 'vscode';
import { RSWEManager } from '@/core/RSWEManager';
import { ChatWebviewMessage, ChatMessage, ChatSession } from '@/types';

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
export class ChatViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'rswe.chatView';
	private _view?: vscode.WebviewView;
	private _currentSession: ChatSession | null = null;

	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly _rsweManager: RSWEManager
	) {}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	): void {
		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri]
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		// Handle messages from the webview
		webviewView.webview.onDidReceiveMessage(
			async (message: ChatWebviewMessage) => {
				await this._handleWebviewMessage(message);
			}
		);

		// Initialize with a new session
		this._createNewSession();
	}

	private async _handleWebviewMessage(message: ChatWebviewMessage): Promise<void> {
		try {
			switch (message.type) {
				case 'chat.send':
					await this._handleSendMessage(message.payload.message || '');
					break;
				case 'chat.clear':
					await this._handleClearChat();
					break;
				case 'chat.export':
					await this._handleExportChat();
					break;
				case 'chat.import':
					await this._handleImportChat(message.payload.data);
					break;
				default:
					console.warn(`Unknown message type: ${message.type}`);
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
			this._postMessage({
				type: 'chat.error',
				payload: { error: errorMessage }
			});
		}
	}

	private async _handleSendMessage(messageContent: string): Promise<void> {
		if (!messageContent?.trim() || !this._currentSession) {
			return;
		}

		// Add user message to session
		const userMessage: ChatMessage = {
			id: this._generateId(),
			role: 'user',
			content: messageContent.trim(),
			timestamp: new Date()
		};

		this._currentSession.messages.push(userMessage);
		this._postMessage({
			type: 'chat.message',
			payload: { message: userMessage }
		});

		// Show typing indicator
		this._postMessage({
			type: 'chat.typing',
			payload: { isTyping: true }
		});

		try {
			// Get response from Claude via RSWE Manager
			const response = await this._rsweManager.sendChatMessage(
				messageContent,
				this._currentSession.messages
			);

			// Add assistant response to session
			const assistantMessage: ChatMessage = {
				id: this._generateId(),
				role: 'assistant' as const,
				content: response.content,
				timestamp: new Date(),
				metadata: {
					tokens: response.metadata.tokens,
					model: this._rsweManager.getConfig()?.anthropic.model || 'claude-3-5-sonnet-latest'
				}
			};

			this._currentSession.messages.push(assistantMessage);
			this._currentSession.updatedAt = new Date();

			// Send response to webview
			this._postMessage({
				type: 'chat.message',
				payload: { message: assistantMessage }
			});

		} catch (error) {
			// Add error message to session
			const errorMessage: ChatMessage = {
				id: this._generateId(),
				role: 'assistant',
				content: `❌ Error: ${error instanceof Error ? error.message : 'Failed to get response from Claude'}`,
				timestamp: new Date(),
				metadata: {
					error: error instanceof Error ? error.message : 'Unknown error'
				}
			};

			this._currentSession.messages.push(errorMessage);
			this._postMessage({
				type: 'chat.message',
				payload: { message: errorMessage }
			});

		} finally {
			// Hide typing indicator
			this._postMessage({
				type: 'chat.typing',
				payload: { isTyping: false }
			});
		}
	}

	private async _handleClearChat(): Promise<void> {
		this._createNewSession();
		this._postMessage({
			type: 'chat.clear',
			payload: {}
		});
	}

	private async _handleExportChat(): Promise<void> {
		if (!this._currentSession || this._currentSession.messages.length === 0) {
			vscode.window.showWarningMessage('No chat history to export');
			return;
		}

		const exportData = {
			session: this._currentSession,
			exportedAt: new Date().toISOString(),
			version: '1.0.0'
		};

		const exportJson = JSON.stringify(exportData, null, 2);
		
		const uri = await vscode.window.showSaveDialog({
			defaultUri: vscode.Uri.file(`rswe-chat-${Date.now()}.json`),
			filters: {
				'JSON Files': ['json'],
				'All Files': ['*']
			}
		});

		if (uri) {
			await vscode.workspace.fs.writeFile(uri, Buffer.from(exportJson, 'utf8'));
			vscode.window.showInformationMessage('Chat exported successfully!');
		}
	}

	private async _handleImportChat(data: any): Promise<void> {
		try {
			if (data.session && Array.isArray(data.session.messages)) {
				this._currentSession = data.session;
				this._postMessage({
					type: 'chat.import',
					payload: { session: this._currentSession }
				});
				vscode.window.showInformationMessage('Chat imported successfully!');
			}
		} catch (error) {
			vscode.window.showErrorMessage('Failed to import chat: Invalid format');
		}
	}

	private _createNewSession(): void {
		this._currentSession = {
			id: this._generateId(),
			title: `Chat ${new Date().toLocaleString()}`,
			messages: [],
			createdAt: new Date(),
			updatedAt: new Date()
		};
	}

	private _postMessage(message: any): void {
		this._view?.webview.postMessage(message);
	}

	private _generateId(): string {
		return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
	}

	private _getHtmlForWebview(webview: vscode.Webview): string {
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'chat.js'));
		const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'chat.css'));

		const nonce = this._generateNonce();

		return `<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
			<link href="${styleUri}" rel="stylesheet">
			<title>RSWE Chat</title>
		</head>
		<body>
			<div class="chat-container">
				<div class="chat-header">
					<div class="header-title">
						<span class="title-icon">🤖</span>
						<span class="title-text">RSWE Assistant</span>
					</div>
					<div class="header-actions">
						<button id="exportBtn" class="action-btn" title="Export Chat">
							<span class="codicon codicon-export"></span>
						</button>
						<button id="clearBtn" class="action-btn" title="Clear Chat">
							<span class="codicon codicon-clear-all"></span>
						</button>
					</div>
				</div>
				
				<div class="chat-messages" id="chatMessages">
					<div class="welcome-message">
						<div class="welcome-icon">🚀</div>
						<h3>Welcome to RSWE-V1!</h3>
						<p>I'm your AI software engineer powered by Claude Sonnet 4. I can help you with:</p>
						<ul>
							<li>🔍 Code analysis and debugging</li>
							<li>🏗️ Architecture planning</li>
							<li>📝 Documentation generation</li>
							<li>🧪 Test case creation</li>
							<li>🔧 Refactoring suggestions</li>
						</ul>
						<p>How can I help you today?</p>
					</div>
				</div>
				
				<div class="typing-indicator" id="typingIndicator" style="display: none;">
					<div class="typing-dots">
						<span></span>
						<span></span>
						<span></span>
					</div>
					<span class="typing-text">RSWE is thinking...</span>
				</div>
				
				<div class="chat-input-container">
					<div class="input-wrapper">
						<textarea
							id="messageInput"
							class="message-input"
							placeholder="Ask me anything about your code..."
							rows="1"
						></textarea>
						<button id="sendBtn" class="send-btn" disabled>
							<span class="codicon codicon-send"></span>
						</button>
					</div>
					<div class="input-footer">
						<span class="model-info">Powered by Claude Sonnet 4</span>
						<span class="shortcuts">Press Shift+Enter for new line</span>
					</div>
				</div>
			</div>
			
			<script nonce="${nonce}" src="${scriptUri}"></script>
		</body>
		</html>`;
	}

	private _generateNonce(): string {
		let text = '';
		const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		for (let i = 0; i < 32; i++) {
			text += possible.charAt(Math.floor(Math.random() * possible.length));
		}
		return text;
	}
}
