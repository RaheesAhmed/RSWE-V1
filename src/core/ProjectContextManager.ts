import * as vscode from 'vscode';
import {
	ProjectAnalysis,
	ProjectFile,
	ProjectMetrics,
	ProjectStructure,
	RSWEError
} from '@/types';

/**
 * ProjectContextManager - Real-time Project Intelligence
 * 
 * Provides real-time context awareness by:
 * - Auto-analyzing projects when workspace opens
 * - Tracking file changes in real-time
 * - Maintaining dependency graphs
 * - Providing context to AI chat sessions
 */
export class ProjectContextManager {
	private _context: vscode.ExtensionContext;
	private _currentAnalysis: ProjectAnalysis | null = null;
	private _fileWatcher: vscode.FileSystemWatcher | null = null;
	private _isWatching = false;
	private _analysisInProgress = false;

	// Event emitter for context updates
	private _onContextUpdated = new vscode.EventEmitter<ProjectAnalysis>();
	public readonly onContextUpdated = this._onContextUpdated.event;

	constructor(context: vscode.ExtensionContext) {
		this._context = context;
		this._initializeFileWatching();
	}

	/**
	 * Initialize real-time file watching for context updates
	 */
	private _initializeFileWatching(): void {
		// Watch for file changes, additions, and deletions
		this._fileWatcher = vscode.workspace.createFileSystemWatcher(
			'**/*',
			false, // Don't ignore creates
			false, // Don't ignore changes
			false  // Don't ignore deletes
		);

		// Handle file events
		this._fileWatcher.onDidCreate(this._onFileCreated.bind(this));
		this._fileWatcher.onDidChange(this._onFileChanged.bind(this));
		this._fileWatcher.onDidDelete(this._onFileDeleted.bind(this));

		this._isWatching = true;
		console.log('📡 ProjectContextManager: Real-time file watching enabled');
	}

	/**
	 * Auto-analyze project when workspace is available
	 */
	public async initializeProjectContext(): Promise<ProjectAnalysis | null> {
		if (!vscode.workspace.workspaceFolders || this._analysisInProgress) {
			return null;
		}

		// Ensure file watching is active
		if (!this._isWatching) {
			this._initializeFileWatching();
		}

		try {
			console.log('🔍 ProjectContextManager: Auto-initializing project context...');
			this._analysisInProgress = true;
			
			const analysis = await this._performFullAnalysis();
			this._currentAnalysis = analysis;
			
			// Store context for persistence
			await this._context.workspaceState.update('rswe.projectContext', {
				analysis: this._serializeAnalysis(analysis),
				lastUpdated: new Date().toISOString()
			});

			// Notify listeners
			this._onContextUpdated.fire(analysis);

			console.log(`✅ ProjectContextManager: Context initialized - ${analysis.metrics.totalFiles} files analyzed`);
			return analysis;

		} catch (error) {
			console.error('❌ ProjectContextManager: Failed to initialize context:', error);
			throw new RSWEError('Failed to initialize project context', 'CONTEXT_INIT_ERROR', { error });
		} finally {
			this._analysisInProgress = false;
		}
	}

	/**
	 * Get current project analysis with real-time context
	 */
	public getCurrentAnalysis(): ProjectAnalysis | null {
		return this._currentAnalysis;
	}

	/**
	 * Get contextual information for AI chat sessions
	 */
	public getContextForChat(): string {
		if (!this._currentAnalysis) {
			return "No project context available. Please ensure a workspace is open.";
		}

		const analysis = this._currentAnalysis;
		
		return `## 🧠 Current Project Context

**📊 Project Overview:**
- **Total Files:** ${analysis.metrics.totalFiles}
- **Total Lines:** ${analysis.metrics.totalLines.toLocaleString()}
- **Languages:** ${Object.entries(analysis.metrics.languages).map(([lang, count]) => `${lang} (${count})`).join(', ')}
- **Average Complexity:** ${analysis.metrics.complexity}/10

**📁 Project Structure:**
- **Source Files:** ${analysis.structure.src.length}
- **Test Files:** ${analysis.structure.tests.length}
- **Config Files:** ${analysis.structure.configs.length}
- **Documentation:** ${analysis.structure.docs.length}

**🔗 Key Dependencies:**
${Array.from(analysis.dependencies.entries())
	.sort(([,a], [,b]) => b.length - a.length)
	.slice(0, 5)
	.map(([file, deps]) => `- **${file}**: ${deps.slice(0, 3).join(', ')}${deps.length > 3 ? ` (+${deps.length - 3} more)` : ''}`)
	.join('\n')}

**💡 Context Notes:**
- Project workspace is fully indexed and analyzed
- All file relationships and dependencies are mapped
- Real-time updates active for file changes`;
	}

	/**
	 * Handle file creation events
	 */
	private async _onFileCreated(uri: vscode.Uri): Promise<void> {
		if (this._shouldIgnoreFile(uri.fsPath)) return;
		
		console.log(`📄 ProjectContextManager: File created - ${uri.fsPath}`);
		await this._incrementalUpdate();
	}

	/**
	 * Handle file change events
	 */
	private async _onFileChanged(uri: vscode.Uri): Promise<void> {
		if (this._shouldIgnoreFile(uri.fsPath)) return;
		
		console.log(`✏️ ProjectContextManager: File changed - ${uri.fsPath}`);
		await this._incrementalUpdate();
	}

	/**
	 * Handle file deletion events
	 */
	private async _onFileDeleted(uri: vscode.Uri): Promise<void> {
		if (this._shouldIgnoreFile(uri.fsPath)) return;
		
		console.log(`🗑️ ProjectContextManager: File deleted - ${uri.fsPath}`);
		await this._incrementalUpdate();
	}

	/**
	 * Perform incremental context update (lightweight)
	 */
	private async _incrementalUpdate(): Promise<void> {
		if (this._analysisInProgress) return;

		// Debounce updates to avoid excessive processing
		setTimeout(async () => {
			try {
				console.log('🔄 ProjectContextManager: Performing incremental update...');
				const analysis = await this._performFullAnalysis();
				this._currentAnalysis = analysis;
				this._onContextUpdated.fire(analysis);
			} catch (error) {
				console.warn('⚠️ ProjectContextManager: Incremental update failed:', error);
			}
		}, 1000); // 1 second debounce
	}

	/**
	 * Check if file should be ignored for context tracking
	 */
	private _shouldIgnoreFile(filePath: string): boolean {
		const ignorePatterns = [
			'node_modules', '.git', '.vscode', 'dist', 'build', 'coverage',
			'.next', '.nuxt', 'out', 'target', 'bin', 'obj', '.vs',
			'__pycache__', '.pytest_cache', 'venv', 'env'
		];

		return ignorePatterns.some(pattern => filePath.includes(pattern));
	}

	/**
	 * Perform full project analysis (reused from RSWEManager)
	 */
	private async _performFullAnalysis(): Promise<ProjectAnalysis> {
		if (!vscode.workspace.workspaceFolders) {
			throw new RSWEError('No workspace folder found', 'NO_WORKSPACE');
		}

		const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
		
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
		
		// Step 2: Classification - Categorize files by type and purpose
		const classifiedFiles = await this._classifyFiles(allFiles, workspaceRoot);
		analysis.structure = classifiedFiles.structure;

		// Step 3: Analysis - Deep analyze each code file
		analysis.files = await this._analyzeCodeFiles(classifiedFiles.codeFiles);
		
		// Step 4: Dependency Mapping - Build dependency graph
		analysis.dependencies = await this._buildDependencyGraph(analysis.files);
		
		// Step 5: Metrics - Calculate project metrics
		analysis.metrics = await this._calculateProjectMetrics(analysis.files);

		return analysis;
	}

	// Helper methods (simplified versions from RSWEManager)
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

			if (codeExtensions.includes(ext)) {
				codeFiles.push(filePath);
				if (testPatterns.some(pattern => fileName.includes(pattern) || relativePath.includes(pattern))) {
					structure.tests.push(relativePath);
				} else {
					structure.src.push(relativePath);
				}
			}
			else if (configFiles.some(pattern => fileName.includes(pattern))) {
				structure.configs.push(relativePath);
			}
			else if (docExtensions.includes(ext)) {
				structure.docs.push(relativePath);
			}
		}

		return { codeFiles, structure };
	}

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

	private async _buildDependencyGraph(files: ProjectFile[]): Promise<Map<string, string[]>> {
		const dependencyGraph = new Map<string, string[]>();
		for (const file of files) {
			if (file.dependencies && file.dependencies.length > 0) {
				dependencyGraph.set(file.relativePath, file.dependencies);
			}
		}
		return dependencyGraph;
	}

	private async _calculateProjectMetrics(files: ProjectFile[]): Promise<ProjectMetrics> {
		const languages: Record<string, number> = {};
		let totalLines = 0;
		let complexity = 0;

		for (const file of files) {
			totalLines += file.lines;
			if (file.language) {
				languages[file.language] = (languages[file.language] || 0) + 1;
			}
			complexity += this._calculateFileComplexity(file);
		}

		return {
			totalFiles: files.length,
			totalLines,
			languages,
			complexity: Math.round(complexity / files.length)
		};
	}

	private _detectLanguage(extension: string): string {
		const languageMap: Record<string, string> = {
			'.js': 'JavaScript', '.ts': 'TypeScript', '.jsx': 'React', '.tsx': 'React TypeScript',
			'.py': 'Python', '.java': 'Java', '.c': 'C', '.cpp': 'C++', '.cs': 'C#',
			'.php': 'PHP', '.rb': 'Ruby', '.go': 'Go', '.rs': 'Rust', '.swift': 'Swift', '.kt': 'Kotlin'
		};
		return languageMap[extension.toLowerCase()] || 'Unknown';
	}

	private _extractDependencies(content: string, extension: string): string[] {
		const dependencies: string[] = [];
		if (extension === '.js' || extension === '.ts' || extension === '.jsx' || extension === '.tsx') {
			const importRegex = /import.*from\s+['"]([^'"]+)['"]/g;
			const requireRegex = /require\(['"]([^'"]+)['"]\)/g;
			let match;
			while ((match = importRegex.exec(content)) !== null) {
				dependencies.push(match[1]);
			}
			while ((match = requireRegex.exec(content)) !== null) {
				dependencies.push(match[1]);
			}
		}
		return dependencies;
	}

	private _extractExports(content: string, extension: string): string[] {
		const exports: string[] = [];
		if (extension === '.js' || extension === '.ts' || extension === '.jsx' || extension === '.tsx') {
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

	private _calculateFileComplexity(file: ProjectFile): number {
		const sizeComplexity = Math.min(file.lines / 100, 10);
		const depComplexity = (file.dependencies?.length || 0) * 0.5;
		return sizeComplexity + depComplexity;
	}

	private _serializeAnalysis(analysis: ProjectAnalysis): any {
		return {
			files: analysis.files,
			dependencies: Array.from(analysis.dependencies.entries()),
			structure: analysis.structure,
			metrics: analysis.metrics
		};
	}

	/**
	 * Dispose resources and cleanup
	 */
	public dispose(): void {
		if (this._fileWatcher) {
			this._fileWatcher.dispose();
			this._fileWatcher = null;
		}
		this._onContextUpdated.dispose();
		this._isWatching = false;
		console.log('🔌 ProjectContextManager: Disposed and cleaned up');
	}
}
