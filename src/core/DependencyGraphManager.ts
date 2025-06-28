import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { RSWEError, ProjectAnalysis, ProjectFile } from '../types';

/**
 * File type classification
 */
export type FileType = 'source' | 'test' | 'config' | 'asset';

/**
 * Dependency information for a specific file
 */
export interface DependencyInfo {
	file: string;
	dependencies: string[];
	dependents: string[];
	imports: ImportInfo[];
	exports: ExportInfo[];
	type: FileType;
}

/**
 * Circular dependency information
 */
export interface CircularDependency {
	cycle: string[];
	severity: 'low' | 'medium' | 'high';
}

/**
 * Graph node for visualization
 */
export interface GraphNode {
	id: string;
	label: string;
	type: FileType;
	dependencyCount: number;
	dependentCount: number;
}

/**
 * Graph edge for visualization
 */
export interface GraphEdge {
	from: string;
	to: string;
	type: 'dependency';
}

/**
 * Graph metrics
 */
export interface GraphMetrics {
	totalNodes: number;
	totalEdges: number;
	averageDepth: number;
	maxDepth: number;
}

/**
 * Dependency graph visualization data
 */
export interface DependencyGraphVisualization {
	nodes: GraphNode[];
	edges: GraphEdge[];
	metrics: GraphMetrics;
}

/**
 * Top file information for reports
 */
export interface TopFileInfo {
	file: string;
	count: number;
}

/**
 * Comprehensive dependency report
 */
export interface DependencyReport {
	totalFiles: number;
	totalDependencies: number;
	circularDependencies: CircularDependency[];
	mostDependentFiles: TopFileInfo[];
	mostDependencyFiles: TopFileInfo[];
	averageDepth: number;
	maxDepth: number;
	fileTypes: Record<string, number>;
}

/**
 * DependencyGraphManager - Advanced Dependency Visualization and Tracking
 * 
 * Provides dependency graph capabilities:
 * - Track file-to-file dependencies
 * - Visualize dependency relationships
 * - Detect circular dependencies
 * - Analyze dependency depth and complexity
 * - Generate dependency reports
 */
export class DependencyGraphManager {
	private readonly _context: vscode.ExtensionContext;
	private _projectAnalysis: ProjectAnalysis | null = null;
	private _dependencyGraph: Map<string, DependencyNode> = new Map();
	private _isInitialized = false;

	constructor(context: vscode.ExtensionContext) {
		this._context = context;
		console.log('🔗 DependencyGraphManager: Created instance');
		// Context stored for future extension integration
		void this._context; // Acknowledge unused variable
	}

	/**
	 * Initialize dependency graph with project analysis
	 */
	public async initialize(projectAnalysis: ProjectAnalysis): Promise<void> {
		try {
			console.log('🔗 DependencyGraphManager: Initializing dependency graph...');
			this._projectAnalysis = projectAnalysis;
			
			// Build dependency graph from project files
			await this._buildDependencyGraph();
			
			this._isInitialized = true;
			console.log(`✅ DependencyGraphManager: Initialized with ${this._dependencyGraph.size} nodes`);
		} catch (error) {
			console.error('❌ DependencyGraphManager: Failed to initialize:', error);
			throw new RSWEError('Failed to initialize dependency graph', 'DEPENDENCY_GRAPH_INIT_ERROR', { error });
		}
	}

	/**
	 * Build dependency graph from project files
	 */
	private async _buildDependencyGraph(): Promise<void> {
		if (!this._projectAnalysis) return;

		this._dependencyGraph.clear();
		console.log('🔨 DependencyGraphManager: Building dependency graph...');

		// Step 1: Create nodes for all files
		for (const file of this._projectAnalysis.files) {
			if (this._shouldIncludeFile(file)) {
				const node = await this._createDependencyNode(file);
				this._dependencyGraph.set(file.relativePath, node);
			}
		}

		// Step 2: Build dependency relationships
		for (const [, node] of this._dependencyGraph.entries()) {
			await this._analyzeDependencies(node);
		}

		// Step 3: Build reverse dependencies (dependents)
		this._buildReverseDependencies();

		console.log(`📊 DependencyGraphManager: Graph built with ${this._dependencyGraph.size} nodes`);
	}

	/**
	 * Check if file should be included in dependency graph
	 */
	private _shouldIncludeFile(file: ProjectFile): boolean {
		// Include source files, exclude certain patterns
		const excludePatterns = [
			'.git',
			'node_modules',
			'.vscode',
			'dist',
			'build',
			'coverage',
			'.nyc_output'
		];

		// Check if file path contains any exclude patterns
		for (const pattern of excludePatterns) {
			if (file.relativePath.includes(pattern)) {
				return false;
			}
		}

		// Include source files that can have dependencies
		const sourceExtensions = ['.ts', '.js', '.tsx', '.jsx', '.py', '.java', '.cs', '.go', '.rs'];
		return sourceExtensions.includes(file.extension);
	}

	/**
	 * Create dependency node for a file
	 */
	private async _createDependencyNode(file: ProjectFile): Promise<DependencyNode> {
		const node: DependencyNode = {
			filePath: file.path,
			relativePath: file.relativePath,
			dependencies: [],
			dependents: [],
			type: this._determineFileType(file),
			imports: [],
			exports: []
		};

		// Parse file content to extract imports and exports
		try {
			const content = await fs.readFile(file.path, 'utf-8');
			node.imports = this._parseImports(content, file.extension);
			node.exports = this._parseExports(content, file.extension);
		} catch (error) {
			console.warn(`Failed to parse file ${file.path}:`, error);
		}

		return node;
	}

	/**
	 * Determine file type based on path and extension
	 */
	private _determineFileType(file: ProjectFile): 'source' | 'test' | 'config' | 'asset' {
		const relativePath = file.relativePath.toLowerCase();
		
		// Test files
		if (relativePath.includes('test') || relativePath.includes('spec') || 
		    relativePath.includes('__tests__') || relativePath.includes('.test.') || 
		    relativePath.includes('.spec.')) {
			return 'test';
		}

		// Config files
		if (relativePath.includes('config') || relativePath.includes('.config.') ||
		    file.name.startsWith('.') || file.name.includes('webpack') ||
		    file.name.includes('babel') || file.name.includes('eslint') ||
		    file.name.includes('prettier') || file.name.includes('tsconfig')) {
			return 'config';
		}

		// Source files
		const sourceExtensions = ['.ts', '.js', '.tsx', '.jsx', '.py', '.java', '.cs', '.go', '.rs'];
		if (sourceExtensions.includes(file.extension)) {
			return 'source';
		}

		// Default to asset
		return 'asset';
	}

	/**
	 * Parse import statements from file content
	 */
	private _parseImports(content: string, extension: string): ImportInfo[] {
		const imports: ImportInfo[] = [];
		const lines = content.split('\n');

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim();
			const lineNumber = i + 1;

			// Parse based on file extension
			if (extension === '.ts' || extension === '.js' || extension === '.tsx' || extension === '.jsx') {
				const jsImport = this._parseJavaScriptImport(line, lineNumber);
				if (jsImport) imports.push(jsImport);
			} else if (extension === '.py') {
				const pyImport = this._parsePythonImport(line, lineNumber);
				if (pyImport) imports.push(pyImport);
			} else if (extension === '.java') {
				const javaImport = this._parseJavaImport(line, lineNumber);
				if (javaImport) imports.push(javaImport);
			}
		}

		return imports;
	}

	/**
	 * Parse export statements from file content
	 */
	private _parseExports(content: string, extension: string): ExportInfo[] {
		const exports: ExportInfo[] = [];
		const lines = content.split('\n');

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim();
			const lineNumber = i + 1;

			// Parse based on file extension
			if (extension === '.ts' || extension === '.js' || extension === '.tsx' || extension === '.jsx') {
				const jsExports = this._parseJavaScriptExports(line, lineNumber);
				exports.push(...jsExports);
			} else if (extension === '.py') {
				const pyExports = this._parsePythonExports(line, lineNumber);
				exports.push(...pyExports);
			}
		}

		return exports;
	}

	/**
	 * Parse JavaScript/TypeScript import statements
	 */
	private _parseJavaScriptImport(line: string, lineNumber: number): ImportInfo | null {
		// Match: import { a, b } from 'module'
		const namedImportMatch = line.match(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/);;
		if (namedImportMatch) {
			const imports = namedImportMatch[1].split(',').map(imp => imp.trim());
			return {
				source: namedImportMatch[2],
				imports: imports,
				isDefaultImport: false,
				isNamespaceImport: false,
				lineNumber: lineNumber
			};
		}

		// Match: import defaultExport from 'module'
		const defaultImportMatch = line.match(/import\s+([a-zA-Z_$][\w$]*)\s+from\s*['"]([^'"]+)['"]/);;
		if (defaultImportMatch) {
			return {
				source: defaultImportMatch[2],
				imports: [defaultImportMatch[1]],
				isDefaultImport: true,
				isNamespaceImport: false,
				lineNumber: lineNumber
			};
		}

		// Match: import * as name from 'module'
		const namespaceImportMatch = line.match(/import\s*\*\s*as\s+([a-zA-Z_$][\w$]*)\s+from\s*['"]([^'"]+)['"]/);;
		if (namespaceImportMatch) {
			return {
				source: namespaceImportMatch[2],
				imports: [namespaceImportMatch[1]],
				isDefaultImport: false,
				isNamespaceImport: true,
				lineNumber: lineNumber
			};
		}

		// Match: import 'module' (side effect import)
		const sideEffectImportMatch = line.match(/import\s*['"]([^'"]+)['"]/);;
		if (sideEffectImportMatch) {
			return {
				source: sideEffectImportMatch[1],
				imports: [],
				isDefaultImport: false,
				isNamespaceImport: false,
				lineNumber: lineNumber
			};
		}

		return null;
	}

	/**
	 * Parse Python import statements
	 */
	private _parsePythonImport(line: string, lineNumber: number): ImportInfo | null {
		// Match: from module import a, b
		const fromImportMatch = line.match(/from\s+([a-zA-Z_][\w.]*)\s+import\s+(.+)/);
		if (fromImportMatch) {
			const imports = fromImportMatch[2].split(',').map(imp => imp.trim());
			return {
				source: fromImportMatch[1],
				imports: imports,
				isDefaultImport: false,
				isNamespaceImport: false,
				lineNumber: lineNumber
			};
		}

		// Match: import module
		const importMatch = line.match(/import\s+([a-zA-Z_][\w.]*)/);
		if (importMatch) {
			return {
				source: importMatch[1],
				imports: [importMatch[1]],
				isDefaultImport: false,
				isNamespaceImport: true,
				lineNumber: lineNumber
			};
		}

		return null;
	}

	/**
	 * Parse Java import statements
	 */
	private _parseJavaImport(line: string, lineNumber: number): ImportInfo | null {
		// Match: import package.Class;
		const importMatch = line.match(/import\s+([a-zA-Z_][\w.]*)\.([a-zA-Z_][\w]*);?/);
		if (importMatch) {
			return {
				source: importMatch[1],
				imports: [importMatch[2]],
				isDefaultImport: false,
				isNamespaceImport: false,
				lineNumber: lineNumber
			};
		}

		return null;
	}

	/**
	 * Parse JavaScript/TypeScript export statements
	 */
	private _parseJavaScriptExports(line: string, lineNumber: number): ExportInfo[] {
		const exports: ExportInfo[] = [];

		// Match: export function name() {}
		const functionExportMatch = line.match(/export\s+(?:async\s+)?function\s+([a-zA-Z_$][\w$]*)\s*\(/);
		if (functionExportMatch) {
			exports.push({
				name: functionExportMatch[1],
				type: 'function',
				lineNumber: lineNumber
			});
		}

		// Match: export class Name {}
		const classExportMatch = line.match(/export\s+class\s+([a-zA-Z_$][\w$]*)/);
		if (classExportMatch) {
			exports.push({
				name: classExportMatch[1],
				type: 'class',
				lineNumber: lineNumber
			});
		}

		// Match: export const/let/var name
		const variableExportMatch = line.match(/export\s+(?:const|let|var)\s+([a-zA-Z_$][\w$]*)/);
		if (variableExportMatch) {
			exports.push({
				name: variableExportMatch[1],
				type: 'variable',
				lineNumber: lineNumber
			});
		}

		// Match: export default
		const defaultExportMatch = line.match(/export\s+default\s+/);
		if (defaultExportMatch) {
			exports.push({
				name: 'default',
				type: 'default',
				lineNumber: lineNumber
			});
		}

		// Match: export { a, b }
		const namedExportMatch = line.match(/export\s*\{([^}]+)\}/);
		if (namedExportMatch) {
			const names = namedExportMatch[1].split(',').map(name => name.trim().split(' as ')[0]);
			for (const name of names) {
				exports.push({
					name: name,
					type: 'variable',
					lineNumber: lineNumber
				});
			}
		}

		return exports;
	}

	/**
	 * Parse Python export statements (def/class at module level)
	 */
	private _parsePythonExports(line: string, lineNumber: number): ExportInfo[] {
		const exports: ExportInfo[] = [];

		// Match: def function_name()
		const functionMatch = line.match(/^def\s+([a-zA-Z_][\w]*)\s*\(/);
		if (functionMatch) {
			exports.push({
				name: functionMatch[1],
				type: 'function',
				lineNumber: lineNumber
			});
		}

		// Match: class ClassName
		const classMatch = line.match(/^class\s+([a-zA-Z_][\w]*)/);
		if (classMatch) {
			exports.push({
				name: classMatch[1],
				type: 'class',
				lineNumber: lineNumber
			});
		}

		// Match: variable = value (module level)
		const variableMatch = line.match(/^([a-zA-Z_][\w]*)\s*=/);
		if (variableMatch && !line.includes('def ') && !line.includes('class ')) {
			exports.push({
				name: variableMatch[1],
				type: 'variable',
				lineNumber: lineNumber
			});
		}

		return exports;
	}

	/**
	 * Analyze dependencies for a specific node
	 */
	private async _analyzeDependencies(node: DependencyNode): Promise<void> {
		for (const importInfo of node.imports) {
			const resolvedPath = this._resolveImportPath(importInfo.source, node.relativePath);
			if (resolvedPath && this._dependencyGraph.has(resolvedPath)) {
				node.dependencies.push(resolvedPath);
			}
		}
		
		// Remove duplicates
		node.dependencies = [...new Set(node.dependencies)];
	}

	/**
	 * Resolve import path to actual file path in the project
	 */
	private _resolveImportPath(importSource: string, fromFilePath: string): string | null {
		// Handle relative imports (./file, ../file)
		if (importSource.startsWith('./') || importSource.startsWith('../')) {
			const fromDir = path.dirname(fromFilePath);
			const resolvedPath = path.normalize(path.join(fromDir, importSource));
			
			// Try different extensions
			const extensions = ['.ts', '.js', '.tsx', '.jsx', '.py', '.java'];
			for (const ext of extensions) {
				const pathWithExt = resolvedPath + ext;
				if (this._dependencyGraph.has(pathWithExt)) {
					return pathWithExt;
				}
			}
			
			// Try index files
			for (const ext of extensions) {
				const indexPath = path.join(resolvedPath, `index${ext}`);
				if (this._dependencyGraph.has(indexPath)) {
					return indexPath;
				}
			}
		}

		// Handle absolute imports from src root (@/path)
		if (importSource.startsWith('@/')) {
			const srcRelativePath = importSource.substring(2); // Remove '@/'
			const extensions = ['.ts', '.js', '.tsx', '.jsx'];
			
			for (const ext of extensions) {
				const fullPath = `src/${srcRelativePath}${ext}`;
				if (this._dependencyGraph.has(fullPath)) {
					return fullPath;
				}
			}
		}

		// Handle node_modules imports (external dependencies)
		// We don't track these in our internal graph, but we could log them
		if (!importSource.startsWith('.') && !importSource.startsWith('@/')) {
			// External dependency - not tracking in internal graph
			return null;
		}

		return null;
	}

	/**
	 * Build reverse dependencies (dependents) for all nodes
	 */
	private _buildReverseDependencies(): void {
		// Clear existing dependents
		for (const node of this._dependencyGraph.values()) {
			node.dependents = [];
		}

		// Build reverse relationships
		for (const [filePath, node] of this._dependencyGraph.entries()) {
			for (const dependency of node.dependencies) {
				const dependencyNode = this._dependencyGraph.get(dependency);
				if (dependencyNode && !dependencyNode.dependents.includes(filePath)) {
					dependencyNode.dependents.push(filePath);
				}
			}
		}
	}

	/**
	 * Get dependency information for a specific file
	 */
	public getDependencies(filePath: string): DependencyInfo | null {
		if (!this._isInitialized) {
			throw new RSWEError('Dependency graph not initialized', 'DEPENDENCY_GRAPH_NOT_INITIALIZED');
		}

		const node = this._dependencyGraph.get(filePath);
		if (!node) return null;

		return {
			file: filePath,
			dependencies: node.dependencies,
			dependents: node.dependents,
			imports: node.imports,
			exports: node.exports,
			type: node.type
		};
	}

	/**
	 * Find circular dependencies in the project
	 */
	public findCircularDependencies(): CircularDependency[] {
		if (!this._isInitialized) {
			throw new RSWEError('Dependency graph not initialized', 'DEPENDENCY_GRAPH_NOT_INITIALIZED');
		}

		const circularDeps: CircularDependency[] = [];
		const visited = new Set<string>();
		const recursionStack = new Set<string>();

		for (const filePath of this._dependencyGraph.keys()) {
			if (!visited.has(filePath)) {
				const cycle = this._detectCycle(filePath, visited, recursionStack, []);
				if (cycle.length > 0) {
					circularDeps.push({
						cycle: cycle,
						severity: this._calculateCycleSeverity(cycle)
					});
				}
			}
		}

		return circularDeps;
	}

	/**
	 * Get dependency graph visualization data
	 */
	public getGraphVisualization(): DependencyGraphVisualization {
		if (!this._isInitialized) {
			throw new RSWEError('Dependency graph not initialized', 'DEPENDENCY_GRAPH_NOT_INITIALIZED');
		}

		const nodes: GraphNode[] = [];
		const edges: GraphEdge[] = [];

		// Create nodes
		for (const [filePath, node] of this._dependencyGraph.entries()) {
			nodes.push({
				id: filePath,
				label: path.basename(filePath),
				type: node.type,
				dependencyCount: node.dependencies.length,
				dependentCount: node.dependents.length
			});
		}

		// Create edges
		for (const [filePath, node] of this._dependencyGraph.entries()) {
			for (const dependency of node.dependencies) {
				edges.push({
					from: filePath,
					to: dependency,
					type: 'dependency'
				});
			}
		}

		return {
			nodes: nodes,
			edges: edges,
			metrics: this._calculateGraphMetrics()
		};
	}

	/**
	 * Get dependency analysis report
	 */
	public getDependencyReport(): DependencyReport {
		if (!this._isInitialized) {
			throw new RSWEError('Dependency graph not initialized', 'DEPENDENCY_GRAPH_NOT_INITIALIZED');
		}

		const metrics = this._calculateGraphMetrics();
		const circularDeps = this.findCircularDependencies();
		const topFiles = this._getTopDependencyFiles();

		return {
			totalFiles: this._dependencyGraph.size,
			totalDependencies: metrics.totalEdges,
			circularDependencies: circularDeps,
			mostDependentFiles: topFiles.mostDependent,
			mostDependencyFiles: topFiles.mostDependencies,
			averageDepth: metrics.averageDepth,
			maxDepth: metrics.maxDepth,
			fileTypes: this._getFileTypeDistribution()
		};
	}

	/**
	 * Update graph when files change
	 */
	public async updateGraph(updatedFiles: ProjectFile[]): Promise<void> {
		if (!this._isInitialized || !this._projectAnalysis) return;

		console.log(`🔄 DependencyGraphManager: Updating graph for ${updatedFiles.length} files`);

		// Update or add nodes for changed files
		for (const file of updatedFiles) {
			if (this._shouldIncludeFile(file)) {
				const node = await this._createDependencyNode(file);
				this._dependencyGraph.set(file.relativePath, node);
			} else {
				this._dependencyGraph.delete(file.relativePath);
			}
		}

		// Rebuild relationships for all affected files
		for (const file of updatedFiles) {
			const node = this._dependencyGraph.get(file.relativePath);
			if (node) {
				node.dependencies = []; // Clear existing dependencies
				await this._analyzeDependencies(node);
			}
		}

		// Rebuild reverse dependencies
		this._buildReverseDependencies();

		console.log(`✅ DependencyGraphManager: Graph updated`);
	}

	/**
	 * Detect cycles in dependency graph using DFS
	 */
	private _detectCycle(filePath: string, visited: Set<string>, recursionStack: Set<string>, currentPath: string[]): string[] {
		visited.add(filePath);
		recursionStack.add(filePath);
		currentPath.push(filePath);

		const node = this._dependencyGraph.get(filePath);
		if (!node) return [];

		for (const dependency of node.dependencies) {
			if (recursionStack.has(dependency)) {
				// Found cycle - return the cycle path
				const cycleStart = currentPath.indexOf(dependency);
				return currentPath.slice(cycleStart).concat(dependency);
			}

			if (!visited.has(dependency)) {
				const cycle = this._detectCycle(dependency, visited, recursionStack, [...currentPath]);
				if (cycle.length > 0) {
					return cycle;
				}
			}
		}

		recursionStack.delete(filePath);
		return [];
	}

	/**
	 * Calculate severity of circular dependency
	 */
	private _calculateCycleSeverity(cycle: string[]): 'low' | 'medium' | 'high' {
		if (cycle.length <= 2) return 'high'; // Direct circular dependency
		if (cycle.length <= 4) return 'medium';
		return 'low'; // Long chains are less severe
	}

	/**
	 * Calculate graph metrics
	 */
	private _calculateGraphMetrics(): GraphMetrics {
		let totalEdges = 0;
		let maxDepth = 0;
		let totalDepth = 0;

		for (const node of this._dependencyGraph.values()) {
			totalEdges += node.dependencies.length;
			const depth = this._calculateNodeDepth(node.relativePath, new Set());
			maxDepth = Math.max(maxDepth, depth);
			totalDepth += depth;
		}

		return {
			totalNodes: this._dependencyGraph.size,
			totalEdges: totalEdges,
			averageDepth: this._dependencyGraph.size > 0 ? totalDepth / this._dependencyGraph.size : 0,
			maxDepth: maxDepth
		};
	}

	/**
	 * Calculate dependency depth for a node
	 */
	private _calculateNodeDepth(filePath: string, visited: Set<string>): number {
		if (visited.has(filePath)) return 0; // Avoid infinite recursion
		visited.add(filePath);

		const node = this._dependencyGraph.get(filePath);
		if (!node || node.dependencies.length === 0) return 1;

		let maxChildDepth = 0;
		for (const dependency of node.dependencies) {
			const childDepth = this._calculateNodeDepth(dependency, new Set(visited));
			maxChildDepth = Math.max(maxChildDepth, childDepth);
		}

		return maxChildDepth + 1;
	}

	/**
	 * Get top dependency files
	 */
	private _getTopDependencyFiles(): { mostDependent: TopFileInfo[]; mostDependencies: TopFileInfo[] } {
		const nodes = Array.from(this._dependencyGraph.entries());

		const mostDependent = nodes
			.sort(([,a], [,b]) => b.dependents.length - a.dependents.length)
			.slice(0, 5)
			.map(([filePath, node]) => ({
				file: filePath,
				count: node.dependents.length
			}));

		const mostDependencies = nodes
			.sort(([,a], [,b]) => b.dependencies.length - a.dependencies.length)
			.slice(0, 5)
			.map(([filePath, node]) => ({
				file: filePath,
				count: node.dependencies.length
			}));

		return { mostDependent, mostDependencies };
	}

	/**
	 * Get file type distribution
	 */
	private _getFileTypeDistribution(): Record<string, number> {
		const distribution: Record<string, number> = {};

		for (const node of this._dependencyGraph.values()) {
			distribution[node.type] = (distribution[node.type] || 0) + 1;
		}

		return distribution;
	}

	/**
	 * Get dependency graph status for integration
	 */
	public getGraphStatus(): {
		isInitialized: boolean;
		totalNodes: number;
		totalEdges: number;
		circularDependencies: number;
	} {
		if (!this._isInitialized) {
			return {
				isInitialized: false,
				totalNodes: 0,
				totalEdges: 0,
				circularDependencies: 0
			};
		}

		let totalEdges = 0;
		for (const node of this._dependencyGraph.values()) {
			totalEdges += node.dependencies.length;
		}

		const circularDeps = this.findCircularDependencies();

		return {
			isInitialized: this._isInitialized,
			totalNodes: this._dependencyGraph.size,
			totalEdges: totalEdges,
			circularDependencies: circularDeps.length
		};
	}

	/**
	 * Dispose resources and cleanup
	 */
	public dispose(): void {
		this._dependencyGraph.clear();
		this._isInitialized = false;
		console.log('🔌 DependencyGraphManager: Disposed and cleaned up');
	}
}

// Core dependency types
interface DependencyNode {
	filePath: string;
	relativePath: string;
	dependencies: string[]; // Files this file depends on
	dependents: string[];   // Files that depend on this file
	type: 'source' | 'test' | 'config' | 'asset';
	imports: ImportInfo[];
	exports: ExportInfo[];
}

interface ImportInfo {
	source: string;
	imports: string[];
	isDefaultImport: boolean;
	isNamespaceImport: boolean;
	lineNumber: number;
}

interface ExportInfo {
	name: string;
	type: 'function' | 'class' | 'variable' | 'default';
	lineNumber: number;
}
