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
	MCPError, 
	ProjectStructure,
	ProjectFile,
	ProjectMetrics
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
	 * Analyze the current project with comprehensive codebase intelligence
	 */
	public async analyzeProject(): Promise<ProjectAnalysis> {
		if (!vscode.workspace.workspaceFolders) {
			throw new RSWEError('No workspace folder found', 'NO_WORKSPACE');
		}

		try {
			const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
			vscode.window.showInformationMessage('🔍 RSWE: Starting comprehensive project analysis...');
			
			// Initialize analysis structure
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

			// Step 1: Discovery - Find all files
			const allFiles = await this._discoverProjectFiles(workspaceRoot);
			console.log(`📁 Discovered ${allFiles.length} files`);

			// Step 2: Classification - Categorize files by type and purpose
			const classifiedFiles = await this._classifyFiles(allFiles, workspaceRoot);
			analysis.structure = classifiedFiles.structure;

			// Step 3: Analysis - Deep analyze each code file
			analysis.files = await this._analyzeCodeFiles(classifiedFiles.codeFiles);
			console.log(`🔬 Analyzed ${analysis.files.length} code files`);

			// Step 4: Dependency Mapping - Build dependency graph
			analysis.dependencies = await this._buildDependencyGraph(analysis.files);
			console.log(`🕸️ Mapped ${analysis.dependencies.size} dependency relationships`);

			// Step 5: Metrics - Calculate project metrics
			analysis.metrics = await this._calculateProjectMetrics(analysis.files);
			console.log(`📊 Calculated project metrics: ${analysis.metrics.totalFiles} files, ${analysis.metrics.totalLines} lines`);

			// Store analysis
			this.projectAnalysis = analysis;
			
			vscode.window.showInformationMessage(`✅ RSWE: Project analysis complete! Indexed ${analysis.files.length} files with ${Object.keys(analysis.metrics.languages).length} languages.`);
			return analysis;

		} catch (error) {
			const errorMsg = `Project analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
			vscode.window.showErrorMessage(`❌ RSWE: ${errorMsg}`);
			throw new RSWEError(errorMsg, 'ANALYSIS_ERROR', { error });
		}
	}

	// ================================
	// PROJECT INTELLIGENCE METHODS
	// ================================

	/**
	 * Step 1: Discover all files in the project
	 */
	private async _discoverProjectFiles(workspaceRoot: string): Promise<string[]> {
		const fs = require('fs').promises;
		const path = require('path');
		const files: string[] = [];

		const ignorePatterns = [
			'node_modules', '.git', '.vscode', 'dist', 'build', 'coverage',
			'.next', '.nuxt', 'out', 'target', 'bin', 'obj', '.vs',
			'__pycache__', '.pytest_cache', 'venv', 'env'
		];

		async function scanDirectory(dir: string): Promise<void> {
			try {
				const entries = await fs.readdir(dir, { withFileTypes: true });
				
				for (const entry of entries) {
					const fullPath = path.join(dir, entry.name);
					const relativePath = path.relative(workspaceRoot, fullPath);

					// Skip ignored directories
					if (ignorePatterns.some(pattern => relativePath.includes(pattern))) {
						continue;
					}

					if (entry.isDirectory()) {
						await scanDirectory(fullPath);
					} else if (entry.isFile()) {
						files.push(fullPath);
					}
				}
			} catch (error) {
				console.warn(`Failed to scan directory ${dir}:`, error);
			}
		}

		await scanDirectory(workspaceRoot);
		return files;
	}

	/**
	 * Step 2: Classify files by type and purpose
	 */
	private async _classifyFiles(files: string[], workspaceRoot: string): Promise<{
		codeFiles: string[];
		structure: ProjectStructure;
	}> {
		const path = require('path');
		const structure: ProjectStructure = {
			root: workspaceRoot,
			src: [],
			tests: [],
			configs: [],
			docs: []
		};

		const codeFiles: string[] = [];
		const codeExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.c', '.cpp', '.cs', '.php', '.rb', '.go', '.rs', '.swift', '.kt'];
		const testPatterns = ['test', 'spec', '__test__', '__tests__'];
		const configFiles = ['package.json', 'tsconfig.json', '.eslintrc', 'webpack.config', 'vite.config', 'next.config', 'tailwind.config'];
		const docExtensions = ['.md', '.txt', '.rst', '.adoc'];

		for (const filePath of files) {
			const ext = path.extname(filePath).toLowerCase();
			const fileName = path.basename(filePath).toLowerCase();
			const relativePath = path.relative(workspaceRoot, filePath);

			// Classify as code file
			if (codeExtensions.includes(ext)) {
				codeFiles.push(filePath);

				// Further classify into src/tests
				if (testPatterns.some(pattern => fileName.includes(pattern) || relativePath.includes(pattern))) {
					structure.tests.push(relativePath);
				} else {
					structure.src.push(relativePath);
				}
			}
			// Classify as config
			else if (configFiles.some(pattern => fileName.includes(pattern))) {
				structure.configs.push(relativePath);
			}
			// Classify as documentation
			else if (docExtensions.includes(ext)) {
				structure.docs.push(relativePath);
			}
		}

		return { codeFiles, structure };
	}

	/**
	 * Step 3: Deep analyze code files with AST parsing
	 */
	private async _analyzeCodeFiles(codeFiles: string[]): Promise<ProjectFile[]> {
		const fs = require('fs').promises;
		const path = require('path');
		const analyzedFiles: ProjectFile[] = [];

		for (const filePath of codeFiles) {
			try {
				const content = await fs.readFile(filePath, 'utf-8');
				const ext = path.extname(filePath);
				const stats = await fs.stat(filePath);

				const projectFile: ProjectFile = {
					path: filePath,
					relativePath: path.relative(process.cwd(), filePath),
					name: path.basename(filePath),
					extension: ext,
					type: 'file',
					size: stats.size,
					lines: content.split('\n').length,
					language: this._detectLanguage(ext),
					lastModified: stats.mtime,
					dependencies: this._extractDependencies(content, ext),
					exports: this._extractExports(content, ext)
				};

				analyzedFiles.push(projectFile);
			} catch (error) {
				console.warn(`Failed to analyze file ${filePath}:`, error);
			}
		}

		return analyzedFiles;
	}

	/**
	 * Step 4: Build comprehensive dependency graph
	 */
	private async _buildDependencyGraph(files: ProjectFile[]): Promise<Map<string, string[]>> {
		const dependencyGraph = new Map<string, string[]>();

		for (const file of files) {
			if (file.dependencies && file.dependencies.length > 0) {
				dependencyGraph.set(file.path, file.dependencies);
			}
		}

		return dependencyGraph;
	}

	/**
	 * Step 5: Calculate comprehensive project metrics
	 */
	private async _calculateProjectMetrics(files: ProjectFile[]): Promise<ProjectMetrics> {
		const languages: Record<string, number> = {};
		let totalLines = 0;
		let complexity = 0;

		for (const file of files) {
			totalLines += file.lines;
			
			if (file.language) {
				languages[file.language] = (languages[file.language] || 0) + 1;
			}

			// Simple complexity calculation
			complexity += this._calculateFileComplexity(file);
		}

		return {
			totalFiles: files.length,
			totalLines,
			languages,
			complexity: Math.round(complexity / files.length)
		};
	}

	/**
	 * Helper: Detect programming language from extension
	 */
	private _detectLanguage(extension: string): string {
		const languageMap: Record<string, string> = {
			'.js': 'JavaScript',
			'.ts': 'TypeScript',
			'.jsx': 'React',
			'.tsx': 'React TypeScript',
			'.py': 'Python',
			'.java': 'Java',
			'.c': 'C',
			'.cpp': 'C++',
			'.cs': 'C#',
			'.php': 'PHP',
			'.rb': 'Ruby',
			'.go': 'Go',
			'.rs': 'Rust',
			'.swift': 'Swift',
			'.kt': 'Kotlin'
		};
		return languageMap[extension.toLowerCase()] || 'Unknown';
	}

	/**
	 * Helper: Extract dependencies from code content
	 */
	private _extractDependencies(content: string, extension: string): string[] {
		const dependencies: string[] = [];

		if (extension === '.js' || extension === '.ts' || extension === '.jsx' || extension === '.tsx') {
			// Extract import statements
			const importRegex = /import.*from\s+['"]([^'"]+)['"]/g;
			const requireRegex = /require\(['"]([^'"]+)['"]\)/g;
			
			let match;
			while ((match = importRegex.exec(content)) !== null) {
				dependencies.push(match[1]);
			}
			while ((match = requireRegex.exec(content)) !== null) {
				dependencies.push(match[1]);
			}
		} else if (extension === '.py') {
			// Extract Python imports
			const importRegex = /(?:from\s+([\w.]+)\s+)?import\s+([\w\s,]+)/g;
			let match;
			while ((match = importRegex.exec(content)) !== null) {
				if (match[1]) dependencies.push(match[1]);
				if (match[2]) {
					const modules = match[2].split(',').map(m => m.trim());
					dependencies.push(...modules);
				}
			}
		}

		return dependencies;
	}

	/**
	 * Helper: Extract exports from code content
	 */
	private _extractExports(content: string, extension: string): string[] {
		const exports: string[] = [];

		if (extension === '.js' || extension === '.ts' || extension === '.jsx' || extension === '.tsx') {
			// Extract export statements
			const exportRegex = /export\s+(?:default\s+)?(?:class|function|const|let|var)\s+([\w$]+)/g;
			const namedExportRegex = /export\s+\{([^}]+)\}/g;
			
			let match;
			while ((match = exportRegex.exec(content)) !== null) {
				exports.push(match[1]);
			}
			while ((match = namedExportRegex.exec(content)) !== null) {
				const namedExports = match[1].split(',').map(e => e.trim());
				exports.push(...namedExports);
			}
		}

		return exports;
	}

	/**
	 * Helper: Calculate basic complexity score for a file
	 */
	private _calculateFileComplexity(file: ProjectFile): number {
		// Simple complexity calculation based on file size and dependencies
		const sizeComplexity = Math.min(file.lines / 100, 10); // Max 10 points for size
		const depComplexity = (file.dependencies?.length || 0) * 0.5; // 0.5 points per dependency
		return sizeComplexity + depComplexity;
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
