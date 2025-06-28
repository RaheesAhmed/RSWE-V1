import * as vscode from 'vscode';
import Anthropic from '@anthropic-ai/sdk';
import { 
	RSWEConfig, 
	RSWEConfigSchema, 
	ChatMessage, 
	ProjectAnalysis, 
	MCPServer, 
	ValidationResult,
	RSWEError,
	ClaudeError,
	MCPError 
} from '@/types';

/**
 * Core RSWE Manager - The Brain of RSWE-V1
 * 
 * Orchestrates all RSWE functionality including:
 * - Claude Sonnet 4 integration
 * - Project analysis and context management
 * - MCP server coordination
 * - Code validation and error prevention
 */
export class RSWEManager {
	private config!: RSWEConfig;
	private claudeClient?: Anthropic;
	private projectAnalysis: ProjectAnalysis | null = null;
	private mcpServers: MCPServer[] = [];
	private isInitialized = false;

	constructor(_context: vscode.ExtensionContext) {
		// Extension context is available if needed for future features
	}

	/**
	 * Initialize the RSWE Manager
	 */
	public async initialize(): Promise<void> {
		try {
			await this.updateConfiguration();
			await this._initializeClaudeClient();
			await this._initializeMCPServers();
			this.isInitialized = true;
			console.log('RSWE Manager initialized successfully');
		} catch (error) {
			throw new RSWEError(
				`Failed to initialize RSWE Manager: ${error instanceof Error ? error.message : 'Unknown error'}`,
				'INIT_ERROR',
				{ error }
			);
		}
	}

	/**
	 * Update configuration from VS Code settings
	 */
	public async updateConfiguration(): Promise<void> {
		try {
			const config = vscode.workspace.getConfiguration('rswe');
			
			const rawConfig = {
				anthropic: {
					apiKey: config.get<string>('anthropic.apiKey') || '',
					model: config.get<string>('anthropic.model') || 'claude-3-5-sonnet-latest'
				},
				context: {
					maxFiles: config.get<number>('context.maxFiles') || 10000,
					enableSemanticSearch: config.get<boolean>('context.enableSemanticSearch') ?? true
				},
				validation: {
					enablePreExecution: config.get<boolean>('validation.enablePreExecution') ?? true
				},
				mcp: {
					enabledServers: config.get<string[]>('mcp.enabledServers') || []
				}
			};

			// Validate configuration
			this.config = RSWEConfigSchema.parse(rawConfig);

			// Reinitialize Claude client if API key changed
			if (this.isInitialized) {
				await this._initializeClaudeClient();
			}

		} catch (error) {
			if (error instanceof Error && 'issues' in error) {
				// Zod validation error
				const validationErrors = (error as any).issues
					.map((issue: any) => `${issue.path.join('.')}: ${issue.message}`)
					.join(', ');
				throw new RSWEError(`Configuration validation failed: ${validationErrors}`, 'CONFIG_ERROR');
			}
			throw new RSWEError(`Failed to update configuration: ${error instanceof Error ? error.message : 'Unknown error'}`, 'CONFIG_ERROR');
		}
	}

	/**
	 * Get current configuration (alias for getConfiguration)
	 */
	public getConfig(): RSWEConfig | null {
		return this.config;
	}

	/**
	 * Send a chat message to Claude and get response
	 */
	public async sendChatMessage(message: string, _context: ChatMessage[] = []): Promise<{
		content: string;
		metadata: { tokens: number };
	}> {
		if (!this.claudeClient || !this.config) {
			throw new ClaudeError('Claude client not initialized');
		}

		try {
			// System prompt for AI assistance
			const systemPrompt = `You are RSWE (Real-time Software Engineering), an AI-powered coding assistant integrated with VS Code. You have access to the user's project context and can provide intelligent suggestions, code analysis, and assistance.`;

			const response = await this.claudeClient.messages.create({
				model: this.config.anthropic.model,
				max_tokens: 2048,
				system: systemPrompt,
				messages: [{ role: 'user', content: message }]
			});

			const content = response.content[0];
			if (content.type === 'text') {
				return {
					content: content.text,
					metadata: {
						tokens: response.usage.output_tokens + response.usage.input_tokens
					}
				};
			}
			
			throw new Error('Unexpected response format from Claude');
		} catch (error) {
			let errorMessage = 'Unknown error occurred';
			if (error instanceof Error) {
				errorMessage = error.message;
			} else if (error && typeof error === 'object' && 'message' in error) {
				errorMessage = `API Error: ${(error as any).message}`;
			}
			throw new ClaudeError(errorMessage);
		}
	}

	/**
	 * Send streaming chat message with real-time updates
	 */
	public async sendStreamingChatMessage(
		message: string,
		_context: ChatMessage[] = [],
		onProgress: (chunk: { content: string; done: boolean }) => void
	): Promise<{ content: string; metadata: { tokens: number } }> {
		if (!this.claudeClient || !this.config) {
			throw new ClaudeError('Claude client not initialized');
		}

		try {
			// System prompt for AI assistance
			const systemPrompt = `You are RSWE (Real-time Software Engineering), an AI-powered coding assistant integrated with VS Code. You have access to the user's project context and can provide intelligent suggestions, code analysis, and assistance.`;

			const stream = await this.claudeClient.messages.create({
				model: this.config.anthropic.model,
				max_tokens: 2048,
				system: systemPrompt,
				messages: [{ role: 'user', content: message }],
				stream: true
			});

			let fullContent = '';
			let totalTokens = 0;

			for await (const chunk of stream) {
				if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
					fullContent += chunk.delta.text;
					onProgress({ content: fullContent, done: false });
				}
				else if (chunk.type === 'message_delta' && chunk.usage) {
					totalTokens = chunk.usage.output_tokens;
				}
			}

			// Signal completion
			onProgress({ content: fullContent, done: true });

			return {
				content: fullContent,
				metadata: { tokens: totalTokens }
			};

		} catch (error) {
			let errorMessage = 'Unknown error occurred';
			if (error instanceof Error) {
				errorMessage = error.message;
			} else if (error && typeof error === 'object' && 'message' in error) {
				errorMessage = `API Error: ${(error as any).message}`;
			}
			throw new ClaudeError(errorMessage);
		}
	}

	/**
	 * Analyze the current project
	 */
	public async analyzeProject(): Promise<ProjectAnalysis> {
		if (!vscode.workspace.workspaceFolders) {
			throw new RSWEError('No workspace folder found', 'NO_WORKSPACE');
		}

		try {
			const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
			
			// This is a simplified analysis - in a full implementation,
			// you would use more sophisticated analysis tools
			const analysis: ProjectAnalysis = {
				files: [],
				dependencies: new Map(),
				structure: {
					root: workspaceRoot,
					src: [],
					tests: [],
					configs: [],
					docs: []
				},
				metrics: {
					totalFiles: 0,
					totalLines: 0,
					languages: {},
					complexity: 0
				}
			};

			// Store analysis
			this.projectAnalysis = analysis;
			
			return analysis;

		} catch (error) {
			throw new RSWEError(
				`Project analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
				'ANALYSIS_ERROR',
				{ error }
			);
		}
	}

	/**
	 * Get current project analysis
	 */
	public async getProjectAnalysis(): Promise<ProjectAnalysis | null> {
		return this.projectAnalysis;
	}

	/**
	 * Validate code in a document
	 */
	public async validateCode(document: vscode.TextDocument): Promise<ValidationResult> {
		if (!this.config?.validation.enablePreExecution) {
			return {
				isValid: true,
				errors: [],
				warnings: [],
				suggestions: []
			};
		}

		try {
			// This is a placeholder - in a full implementation,
			// you would integrate with language servers, linters, and static analysis tools
			const result: ValidationResult = {
				isValid: true,
				errors: [],
				warnings: [],
				suggestions: []
			};

			return result;

		} catch (error) {
			throw new RSWEError(
				`Code validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
				'VALIDATION_ERROR',
				{ document: document.uri.toString() }
			);
		}
	}

	/**
	 * Get MCP servers
	 */
	public async getMCPServers(): Promise<MCPServer[]> {
		return this.mcpServers;
	}

	/**
	 * Refresh MCP servers
	 */
	public async refreshMCPServers(): Promise<void> {
		try {
			// This is a placeholder - in a full implementation,
			// you would implement actual MCP server management
			this.mcpServers = [
				{
					id: 'git-server',
					name: 'Git MCP Server',
					status: 'connected',
					transport: 'stdio',
					tools: [
						{
							name: 'git_status',
							description: 'Get git repository status',
							parameters: {}
						},
						{
							name: 'git_commit',
							description: 'Create a git commit',
							parameters: {
								message: { type: 'string', description: 'Commit message' }
							}
						}
					],
					lastPing: new Date()
				},
				{
					id: 'testing-server',
					name: 'Testing MCP Server',
					status: 'connected',
					transport: 'stdio',
					tools: [
						{
							name: 'run_tests',
							description: 'Run project tests',
							parameters: {
								pattern: { type: 'string', description: 'Test pattern to match' }
							}
						}
					],
					lastPing: new Date()
				}
			];

		} catch (error) {
			throw new MCPError(
				`Failed to refresh MCP servers: ${error instanceof Error ? error.message : 'Unknown error'}`,
				{ error }
			);
		}
	}

	/**
	 * Initialize Claude client
	 */
	private async _initializeClaudeClient(): Promise<void> {
		if (!this.config?.anthropic.apiKey) {
			vscode.window.showWarningMessage(
				'Claude API key not configured. Please set your Anthropic API key in settings.',
				'Open Settings'
			).then((selection: string | undefined) => {
				if (selection === 'Open Settings') {
					vscode.commands.executeCommand('workbench.action.openSettings', 'rswe.anthropic.apiKey');
				}
			});
			return;
		}

		try {
			this.claudeClient = new Anthropic({
				apiKey: this.config.anthropic.apiKey
			});
			
			console.log('Claude client initialized successfully');
		} catch (error) {
			throw new ClaudeError(`Failed to initialize Claude client: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	/**
	 * Initialize MCP servers
	 */
	private async _initializeMCPServers(): Promise<void> {
		try {
			await this.refreshMCPServers();
			console.log(`Initialized ${this.mcpServers.length} MCP servers`);
		} catch (error) {
			console.warn('Failed to initialize MCP servers:', error);
			// Don't throw - MCP servers are optional
		}
	}


}
