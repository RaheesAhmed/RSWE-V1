import * as vscode from 'vscode';
import { ChatSession, ChatMessage, ChatWebviewMessage } from '@/types';
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
export class ChatViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'rswe.chatView';

	private _view?: vscode.WebviewView;
	private _currentSession: ChatSession | null = null;
	//private _chatHistory: ChatSession[] = [];
	private _isContextLoaded = false;

	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly _rsweManager: RSWEManager,
		private readonly _projectContextManager: ProjectContextManager,
		private readonly _context: vscode.ExtensionContext
	) {
		// Initialize context loading when provider is created
		this._initializeProjectContext();
	}

	/**
	 * Initialize project context automatically when chat opens
	 */
	private async _initializeProjectContext(): Promise<void> {
		if (this._isContextLoaded) return;

		try {
			console.log('🔍 ChatViewProvider: Auto-loading project context...');
			const analysis = await this._projectContextManager.initializeProjectContext();
			
			if (analysis) {
				this._isContextLoaded = true;
				console.log('✅ ChatViewProvider: Project context loaded successfully');
				
				// Send context info to webview if available
				if (this._view) {
					this._postMessage({
						type: 'context.loaded',
						payload: {
							context: this._projectContextManager.getContextForChat()
						}
					});
				}
			} else {
				console.log('⚠️ ChatViewProvider: No workspace found for context loading');
			}
		} catch (error) {
			console.error('❌ ChatViewProvider: Failed to load project context:', error);
		}
	}

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
				case 'chat.new':
					this._handleNewChat();
					break;
				case 'chat.settings':
					this._handleSettings();
					break;
				case 'chat.history':
					this._handleHistory();
					break;
				case 'chat.save':
					await this._handleSaveChat(message.payload);
					break;
				case 'project.analyze':
					await this._handleAnalyzeProject();
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
			// Create assistant message for streaming
			const messageId = this._generateId();
			let fullContent = '';

			// Get streaming response from Claude via RSWE Manager
			const response = await this._rsweManager.sendStreamingChatMessage(
				messageContent,
				this._currentSession.messages,
				(chunk) => {
					fullContent = chunk.content;
					
					// Send streaming update to webview
					this._postMessage({
						type: 'chat.stream',
						payload: {
							id: messageId,
							content: chunk.content,
							done: chunk.done
						}
					});
				}
			);

			// Add complete assistant response to session
			const assistantMessage: ChatMessage = {
				id: messageId,
				role: 'assistant' as const,
				content: fullContent,
				timestamp: new Date(),
				metadata: {
					tokens: response.metadata.tokens,
					model: this._rsweManager.getConfig()?.anthropic.model || 'claude-3-5-sonnet-latest'
				}
			};

			this._currentSession.messages.push(assistantMessage);
			this._currentSession.updatedAt = new Date();

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

	// private async _handleClearChat(): Promise<void> {
	// 	this._createNewSession();
	// 	this._postMessage({
	// 		type: 'chat.clear',
	// 		payload: {}
	// 	});
	// }

	private async _handleExportChat(): Promise<void> {
		if (!this._currentSession || this._currentSession.messages.length === 0) {
			vscode.window.showWarningMessage('No chat to export');
			return;
		}

		try {
			const exportData = {
				title: this._currentSession.title,
				messages: this._currentSession.messages,
				createdAt: this._currentSession.createdAt,
				updatedAt: new Date()
			};

			const fileName = `rswe-chat-${Date.now()}.json`;
			const content = JSON.stringify(exportData, null, 2);

			const saveUri = await vscode.window.showSaveDialog({
				defaultUri: vscode.Uri.file(fileName),
				filters: {
					'JSON Files': ['json']
				}
			});

			if (saveUri) {
				await vscode.workspace.fs.writeFile(saveUri, Buffer.from(content));
				vscode.window.showInformationMessage(`Chat exported to ${saveUri.fsPath}`);
			}
		} catch (error) {
			console.error('Export failed:', error);
			vscode.window.showErrorMessage('Failed to export chat');
		}
	}

	private async _handleAnalyzeProject(): Promise<void> {
		try {
			// Trigger project analysis
			const analysis = await this._rsweManager.analyzeProject();
			
			// Display analysis results in chat
			const analysisMessage = `## 🧠 Project Analysis Complete!

**📊 Overview:**
- **Total Files:** ${analysis.metrics.totalFiles}
- **Total Lines:** ${analysis.metrics.totalLines.toLocaleString()}
- **Languages:** ${Object.entries(analysis.metrics.languages).map(([lang, count]) => `${lang} (${count})`).join(', ')}
- **Average Complexity:** ${analysis.metrics.complexity}/10

**📁 Project Structure:**
- **Source Files:** ${analysis.structure.src.length}
- **Test Files:** ${analysis.structure.tests.length}
- **Config Files:** ${analysis.structure.configs.length}
- **Documentation:** ${analysis.structure.docs.length}

**🔗 Dependencies:**
- **Total Dependencies:** ${analysis.dependencies.size}
- **Most Connected Files:** ${Array.from(analysis.dependencies.entries())
				.sort(([,a], [,b]) => b.length - a.length)
				.slice(0, 3)
				.map(([file, deps]) => `${file} (${deps.length} deps)`)
				.join(', ')}

✅ **Your project is now fully indexed and ready for intelligent assistance!**`;
			
			this._postMessage({
				type: 'chat.message',
				payload: {
					role: 'assistant',
					content: analysisMessage
				}
			});

		} catch (error) {
			console.error('Project analysis failed:', error);
			this._postMessage({
				type: 'chat.message',
				payload: {
					role: 'assistant',
					content: '❌ **Project analysis failed.** Please check that you have a valid workspace open and try again.'
				}
			});
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

	private _handleNewChat(): void {
		this._createNewSession();
		this._postMessage({
			type: 'chat.new',
			payload: {}
		});
	}

	private _handleSettings(): void {
		// Open VS Code settings to RSWE section
		vscode.commands.executeCommand('workbench.action.openSettings', 'rswe');
	}

	private _handleHistory(): void {
		// Focus on the history view
		vscode.commands.executeCommand('rswe.historyView.focus');
	}

	private _handleSaveChat(session: any): void {
		if (session && session.messages && session.messages.length > 0) {
			// Save to workspace state or global state
			const chatHistory = this._context.workspaceState.get<any[]>('rswe.chatHistory', []);
			chatHistory.push(session);
			this._context.workspaceState.update('rswe.chatHistory', chatHistory);
			vscode.window.showInformationMessage(`Chat saved: ${session.title}`);
		}
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
					<div class="header">
						<div class="header-title">
							<span class="logo">RSWE</span>
						</div>
						<div class="header-actions">
							<button id="settingsBtn" class="header-btn" title="Settings">
								<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
									<path d="M8 10.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/>
									<path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8z"/>
									<path d="M6.025 8a1.975 1.975 0 1 1 3.95 0 1.975 1.975 0 0 1-3.95 0z"/>
								</svg>
							</button>
							<button id="historyBtn" class="header-btn" title="Chat History">
								<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
									<path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5z"/>
									<path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z"/>
								</svg>
							</button>
							<button id="newChatBtn" class="header-btn" title="Start New Chat">
								<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
									<path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
								</svg>
							</button>
						</div>
					</div>
				
				<div class="messages-container" id="messagesContainer">
					<div class="welcome-message" id="welcomeMessage">
						<div class="welcome-title">Welcome to RSWE</div>
						<div class="welcome-subtitle">Your AI software engineer powered by Claude Sonnet 4. Ask me anything about your code.</div>
					</div>
				</div>
				
				<div class="typing-indicator hidden" id="typingIndicator">
					<div class="typing-dots">
						<div class="typing-dot"></div>
						<div class="typing-dot"></div>
						<div class="typing-dot"></div>
					</div>
					<span>RSWE is thinking...</span>
				</div>
				
				<div class="input-container">
					<div class="input-wrapper">
						<textarea
							id="messageInput"
							class="message-input"
							placeholder="Ask me anything about your code..."
							rows="1"
						></textarea>
						<button id="sendButton" class="send-button" disabled>
							<svg class="send-icon" viewBox="0 0 16 16">
								<path d="M1.724 1.053a.75.75 0 0 1 .888-.024L14.836 7.78a.75.75 0 0 1 0 1.44L2.612 15.971a.75.75 0 0 1-.888-.024.75.75 0 0 1-.3-.783L2.1 9.5H6a.5.5 0 0 0 0-1H2.1L1.424 2.836a.75.75 0 0 1 .3-.783Z"/>
							</svg>
						</button>
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
