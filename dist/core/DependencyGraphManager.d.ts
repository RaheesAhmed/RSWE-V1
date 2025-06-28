import * as vscode from 'vscode';
import { ProjectAnalysis, ProjectFile } from '../types';
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
export declare class DependencyGraphManager {
    private readonly _context;
    private _projectAnalysis;
    private _dependencyGraph;
    private _isInitialized;
    constructor(context: vscode.ExtensionContext);
    /**
     * Initialize dependency graph with project analysis
     */
    initialize(projectAnalysis: ProjectAnalysis): Promise<void>;
    /**
     * Build dependency graph from project files
     */
    private _buildDependencyGraph;
    /**
     * Check if file should be included in dependency graph
     */
    private _shouldIncludeFile;
    /**
     * Create dependency node for a file
     */
    private _createDependencyNode;
    /**
     * Determine file type based on path and extension
     */
    private _determineFileType;
    /**
     * Parse import statements from file content
     */
    private _parseImports;
    /**
     * Parse export statements from file content
     */
    private _parseExports;
    /**
     * Parse JavaScript/TypeScript import statements
     */
    private _parseJavaScriptImport;
    /**
     * Parse Python import statements
     */
    private _parsePythonImport;
    /**
     * Parse Java import statements
     */
    private _parseJavaImport;
    /**
     * Parse JavaScript/TypeScript export statements
     */
    private _parseJavaScriptExports;
    /**
     * Parse Python export statements (def/class at module level)
     */
    private _parsePythonExports;
    /**
     * Analyze dependencies for a specific node
     */
    private _analyzeDependencies;
    /**
     * Resolve import path to actual file path in the project
     */
    private _resolveImportPath;
    /**
     * Build reverse dependencies (dependents) for all nodes
     */
    private _buildReverseDependencies;
    /**
     * Get dependency information for a specific file
     */
    getDependencies(filePath: string): DependencyInfo | null;
    /**
     * Find circular dependencies in the project
     */
    findCircularDependencies(): CircularDependency[];
    /**
     * Get dependency graph visualization data
     */
    getGraphVisualization(): DependencyGraphVisualization;
    /**
     * Get dependency analysis report
     */
    getDependencyReport(): DependencyReport;
    /**
     * Update graph when files change
     */
    updateGraph(updatedFiles: ProjectFile[]): Promise<void>;
    /**
     * Detect cycles in dependency graph using DFS
     */
    private _detectCycle;
    /**
     * Calculate severity of circular dependency
     */
    private _calculateCycleSeverity;
    /**
     * Calculate graph metrics
     */
    private _calculateGraphMetrics;
    /**
     * Calculate dependency depth for a node
     */
    private _calculateNodeDepth;
    /**
     * Get top dependency files
     */
    private _getTopDependencyFiles;
    /**
     * Get file type distribution
     */
    private _getFileTypeDistribution;
    /**
     * Get dependency graph status for integration
     */
    getGraphStatus(): {
        isInitialized: boolean;
        totalNodes: number;
        totalEdges: number;
        circularDependencies: number;
    };
    /**
     * Dispose resources and cleanup
     */
    dispose(): void;
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
export {};
//# sourceMappingURL=DependencyGraphManager.d.ts.map