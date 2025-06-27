import * as vscode from 'vscode';
import { RSWEManager } from '../core/RSWEManager';
import { TreeViewItem } from '../types';
/**
 * Project Tree Provider for RSWE-V1 Sidebar
 *
 * Displays intelligent project structure with:
 * - File dependency mapping
 * - Code complexity indicators
 * - Language distribution
 * - Quick navigation to important files
 */
export declare class ProjectTreeProvider implements vscode.TreeDataProvider<TreeViewItem> {
    private readonly _rsweManager;
    private _onDidChangeTreeData;
    readonly onDidChangeTreeData: vscode.Event<TreeViewItem | undefined | null | void>;
    private _projectAnalysis;
    constructor(_rsweManager: RSWEManager);
    private _initialize;
    refresh(): void;
    getTreeItem(element: TreeViewItem): vscode.TreeItem;
    getChildren(element?: TreeViewItem): Promise<TreeViewItem[]>;
    private _getRootItems;
    private _createOverviewItem;
    private _createOverviewChildren;
    private _createFileStructureItem;
    private _createFileStructureChildren;
    private _createFileItem;
    private _createDependenciesItem;
    private _createDependenciesChildren;
    private _createMetricsItem;
    private _createMetricsChildren;
    private _createQuickActionsItem;
    private _createNoWorkspaceItem;
    private _getLanguageIcon;
    private _getFileIcon;
    private _getComplexityLevel;
}
//# sourceMappingURL=ProjectTreeProvider.d.ts.map