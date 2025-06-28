import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
	ProjectAnalysis,
	ProjectFile,
	RSWEError
} from '@/types';

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
	private _context: vscode.ExtensionContext;
	private _projectAnalysis: ProjectAnalysis | null = null;
	private _dependencyGraph: Map<string, DependencyNode> = new Map();
	private _isInitialized = false;

	constructor(context: vscode.ExtensionContext) {
		this._context = context;
		console.log('🔗 DependencyGraphManager: Created instance');
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
		for (const [filePath, node] of this._dependencyGraph.entries()) {
			await this._analyzeDependencies(node);
		}

		// Step 3: Build reverse dependencies (dependents)
		this._buildReverseDependencies();

		console.log(`📊 DependencyGraphManager: Graph built with ${this._dependencyGraph.size} nodes`);
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
