import * as vscode from 'vscode';
import * as path from 'path';
import { RSWEManager } from '../core/RSWEManager';
import { ProjectAnalysis, TreeViewItem } from '../types';

/**
 * Project Tree Provider for RSWE-V1 Sidebar
 * 
 * Displays intelligent project structure with:
 * - File dependency mapping
 * - Code complexity indicators
 * - Language distribution
 * - Quick navigation to important files
 */
export class ProjectTreeProvider implements vscode.TreeDataProvider<TreeViewItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<TreeViewItem | undefined | null | void> = new vscode.EventEmitter<TreeViewItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<TreeViewItem | undefined | null | void> = this._onDidChangeTreeData.event;

	private _projectAnalysis: ProjectAnalysis | null = null;

	constructor(private readonly _rsweManager: RSWEManager) {
		this._initialize();
	}

	private async _initialize(): Promise<void> {
		try {
			this._projectAnalysis = await this._rsweManager.getProjectAnalysis();
		} catch (error) {
			console.warn('Failed to initialize project analysis:', error);
		}
	}

	public refresh(): void {
		this._initialize().then(() => {
			this._onDidChangeTreeData.fire();
		});
	}

	public getTreeItem(element: TreeViewItem): vscode.TreeItem {
		const treeItem = new vscode.TreeItem(element.label, element.collapsibleState);
		
		treeItem.id = element.id;
		treeItem.description = element.description || '';
		treeItem.tooltip = element.tooltip || element.label;
		treeItem.contextValue = element.contextValue || '';
		if (element.command) {
			treeItem.command = element.command;
		}

		// Set icons
		if (element.iconPath) {
			if (typeof element.iconPath === 'string') {
				treeItem.iconPath = new vscode.ThemeIcon(element.iconPath);
			} else {
				treeItem.iconPath = element.iconPath;
			}
		}

		return treeItem;
	}

	public async getChildren(element?: TreeViewItem): Promise<TreeViewItem[]> {
		if (!vscode.workspace.workspaceFolders) {
			return [this._createNoWorkspaceItem()];
		}

		if (!element) {
			return this._getRootItems();
		}

		return element.children || [];
	}

	private _getRootItems(): TreeViewItem[] {
		const items: TreeViewItem[] = [];

		// Project Overview
		items.push(this._createOverviewItem());

		// File Structure
		items.push(this._createFileStructureItem());

		// Dependencies
		items.push(this._createDependenciesItem());

		// Metrics
		items.push(this._createMetricsItem());

		// Quick Actions
		items.push(this._createQuickActionsItem());

		return items;
	}

	private _createOverviewItem(): TreeViewItem {
		const metrics = this._projectAnalysis?.metrics;
		const description = metrics 
			? `${metrics.totalFiles} files, ${metrics.totalLines} lines`
			: 'Click to analyze';

		return {
			id: 'overview',
			label: 'Project Overview',
			description,
			tooltip: 'General project information and statistics',
			iconPath: 'project',
			collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
			contextValue: 'projectOverview',
			children: this._createOverviewChildren()
		};
	}

	private _createOverviewChildren(): TreeViewItem[] {
		if (!this._projectAnalysis) {
			return [{
				id: 'analyze-needed',
				label: 'Analysis Required',
				description: 'Click to analyze project',
				iconPath: 'search',
				command: {
					command: 'rswe.analyzeProject',
					title: 'Analyze Project'
				},
				contextValue: 'analyzeAction'
			}];
		}

		const { metrics } = this._projectAnalysis;
		const children: TreeViewItem[] = [];

		// Languages
		if (metrics.languages && Object.keys(metrics.languages).length > 0) {
			const languageItems = Object.entries(metrics.languages)
				.sort(([, a], [, b]) => b - a)
				.slice(0, 5)
				.map(([lang, count]) => ({
					id: `lang-${lang}`,
					label: lang,
					description: `${count} files`,
					iconPath: this._getLanguageIcon(lang),
					contextValue: 'languageInfo'
				}));

			children.push({
				id: 'languages',
				label: 'Languages',
				iconPath: 'code',
				collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
				children: languageItems,
				contextValue: 'languagesGroup'
			});
		}

		// Complexity indicator
		if (metrics.complexity) {
			const complexityLevel = this._getComplexityLevel(metrics.complexity);
			children.push({
				id: 'complexity',
				label: 'Complexity',
				description: complexityLevel.label,
				iconPath: complexityLevel.icon,
				tooltip: `Complexity score: ${metrics.complexity}`,
				contextValue: 'complexityInfo'
			});
		}

		return children;
	}

	private _createFileStructureItem(): TreeViewItem {
		return {
			id: 'structure',
			label: 'File Structure',
			description: 'Browse project files',
			tooltip: 'Navigate through your project structure',
			iconPath: 'folder-opened',
			collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
			contextValue: 'fileStructure',
			children: this._createFileStructureChildren()
		};
	}

	private _createFileStructureChildren(): TreeViewItem[] {
		if (!this._projectAnalysis) {
			return [];
		}

		// const structure = analysis.structure; // Reserved for future file tree implementation
		const children: TreeViewItem[] = [];

		// Source files
		if (this._projectAnalysis.structure.src.length > 0) {
			children.push({
				id: 'src-files',
				label: 'Source Files',
				description: `${this._projectAnalysis.structure.src.length} files`,
				iconPath: 'file-code',
				collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
				children: this._projectAnalysis.structure.src.slice(0, 10).map(filePath => this._createFileItem(filePath)),
				contextValue: 'sourceFiles'
			});
		}

		// Test files
		if (this._projectAnalysis.structure.tests.length > 0) {
			children.push({
				id: 'test-files',
				label: 'Test Files',
				description: `${this._projectAnalysis.structure.tests.length} files`,
				iconPath: 'beaker',
				collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
				children: this._projectAnalysis.structure.tests.slice(0, 10).map(filePath => this._createFileItem(filePath)),
				contextValue: 'testFiles'
			});
		}

		// Config files
		if (this._projectAnalysis.structure.configs.length > 0) {
			children.push({
				id: 'config-files',
				label: 'Configuration',
				description: `${this._projectAnalysis.structure.configs.length} files`,
				iconPath: 'settings-gear',
				collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
				children: this._projectAnalysis.structure.configs.map(filePath => this._createFileItem(filePath)),
				contextValue: 'configFiles'
			});
		}

		return children;
	}

	private _createFileItem(filePath: string): TreeViewItem {
		const fileName = path.basename(filePath);
		const fileExtension = path.extname(filePath).slice(1);
		
		return {
			id: `file-${filePath}`,
			label: fileName,
			description: path.dirname(filePath),
			tooltip: filePath,
			iconPath: this._getFileIcon(fileExtension),
			command: {
				command: 'vscode.open',
				title: 'Open File',
				arguments: [vscode.Uri.file(filePath)]
			},
			contextValue: 'projectFile'
		};
	}

	private _createDependenciesItem(): TreeViewItem {
		return {
			id: 'dependencies',
			label: 'Dependencies',
			description: 'File relationships',
			tooltip: 'View file dependencies and imports',
			iconPath: 'references',
			collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
			contextValue: 'dependencies',
			children: this._createDependenciesChildren()
		};
	}

	private _createDependenciesChildren(): TreeViewItem[] {
		if (!this._projectAnalysis) {
			return [];
		}

		const { dependencies } = this._projectAnalysis;
		const children: TreeViewItem[] = [];

		// Show files with most dependencies
		const sortedDeps = Array.from(dependencies.entries())
			.sort(([, a], [, b]) => b.length - a.length)
			.slice(0, 10);

		for (const [file, deps] of sortedDeps) {
			children.push({
				id: `deps-${file}`,
				label: path.basename(file),
				description: `${deps.length} dependencies`,
				tooltip: file,
				iconPath: 'symbol-file',
				collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
				children: deps.map(dep => ({
					id: `dep-${file}-${dep}`,
					label: path.basename(dep),
					description: path.dirname(dep),
					tooltip: dep,
					iconPath: 'arrow-right',
					command: {
						command: 'vscode.open',
						title: 'Open Dependency',
						arguments: [vscode.Uri.file(dep)]
					},
					contextValue: 'dependency'
				})),
				contextValue: 'dependencyGroup'
			});
		}

		return children;
	}

	private _createMetricsItem(): TreeViewItem {
		return {
			id: 'metrics',
			label: 'Code Metrics',
			description: 'Project statistics',
			tooltip: 'View detailed project metrics',
			iconPath: 'graph',
			collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
			contextValue: 'metrics',
			children: this._createMetricsChildren()
		};
	}

	private _createMetricsChildren(): TreeViewItem[] {
		if (!this._projectAnalysis) {
			return [];
		}

		const { metrics } = this._projectAnalysis;
		const children: TreeViewItem[] = [];

		children.push({
			id: 'total-files',
			label: 'Total Files',
			description: metrics.totalFiles.toString(),
			iconPath: 'file',
			contextValue: 'metric'
		});

		children.push({
			id: 'total-lines',
			label: 'Total Lines',
			description: metrics.totalLines.toLocaleString(),
			iconPath: 'symbol-ruler',
			contextValue: 'metric'
		});

		if (metrics.coverage !== undefined) {
			children.push({
				id: 'coverage',
				label: 'Test Coverage',
				description: `${metrics.coverage.toFixed(1)}%`,
				iconPath: metrics.coverage > 80 ? 'check' : 'warning',
				contextValue: 'metric'
			});
		}

		return children;
	}

	private _createQuickActionsItem(): TreeViewItem {
		return {
			id: 'actions',
			label: 'Quick Actions',
			description: 'Common tasks',
			tooltip: 'Frequently used project actions',
			iconPath: 'zap',
			collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
			contextValue: 'quickActions',
			children: [
				{
					id: 'analyze-project',
					label: 'Analyze Project',
					description: 'Full project analysis',
					iconPath: 'search',
					command: {
						command: 'rswe.analyzeProject',
						title: 'Analyze Project'
					},
					contextValue: 'action'
				},
				{
					id: 'validate-code',
					label: 'Validate Code',
					description: 'Check current file',
					iconPath: 'check',
					command: {
						command: 'rswe.validateCode',
						title: 'Validate Code'
					},
					contextValue: 'action'
				}
			]
		};
	}

	private _createNoWorkspaceItem(): TreeViewItem {
		return {
			id: 'no-workspace',
			label: 'No Workspace',
			description: 'Open a folder to get started',
			tooltip: 'RSWE requires a workspace to analyze your project',
			iconPath: 'folder',
			contextValue: 'noWorkspace'
		};
	}

	private _getLanguageIcon(language: string): string {
		const iconMap: Record<string, string> = {
			'typescript': 'symbol-variable',
			'javascript': 'symbol-variable',
			'python': 'symbol-variable',
			'java': 'symbol-class',
			'csharp': 'symbol-class',
			'cpp': 'symbol-class',
			'rust': 'symbol-class',
			'go': 'symbol-variable',
			'html': 'symbol-color',
			'css': 'symbol-color',
			'json': 'symbol-property',
			'yaml': 'symbol-property',
			'markdown': 'book'
		};
		return iconMap[language.toLowerCase()] || 'file';
	}

	private _getFileIcon(extension: string): string {
		const iconMap: Record<string, string> = {
			'ts': 'symbol-variable',
			'js': 'symbol-variable',
			'py': 'symbol-variable',
			'java': 'symbol-class',
			'cs': 'symbol-class',
			'cpp': 'symbol-class',
			'c': 'symbol-class',
			'rs': 'symbol-class',
			'go': 'symbol-variable',
			'html': 'symbol-color',
			'css': 'symbol-color',
			'json': 'symbol-property',
			'yaml': 'symbol-property',
			'yml': 'symbol-property',
			'md': 'book',
			'txt': 'file-text'
		};
		return iconMap[extension.toLowerCase()] || 'file';
	}

	private _getComplexityLevel(complexity: number): { label: string; icon: string } {
		if (complexity < 5) {
			return { label: 'Low', icon: 'check' };
		} else if (complexity < 10) {
			return { label: 'Medium', icon: 'warning' };
		} else {
			return { label: 'High', icon: 'error' };
		}
	}
}
