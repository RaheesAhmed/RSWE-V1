import * as vscode from 'vscode';
import { RSWEManager } from '@/core/RSWEManager';
import { TreeViewItem } from '@/types';
/**
 * MCP Tree Provider for RSWE-V1 Sidebar
 *
 * Displays and manages MCP (Model Context Protocol) servers with:
 * - Server status monitoring
 * - Available tools listing
 * - Connection management
 * - Real-time health checks
 */
export declare class MCPTreeProvider implements vscode.TreeDataProvider<TreeViewItem> {
    private readonly _rsweManager;
    private _onDidChangeTreeData;
    readonly onDidChangeTreeData: vscode.Event<TreeViewItem | undefined | null | void>;
    private _mcpServers;
    private _refreshInterval;
    constructor(_rsweManager: RSWEManager);
    private _initialize;
    private _startAutoRefresh;
    refresh(): void;
    dispose(): void;
    getTreeItem(element: TreeViewItem): vscode.TreeItem;
    getChildren(element?: TreeViewItem): Promise<TreeViewItem[]>;
    private _getRootItems;
    private _createStatusOverviewItem;
    private _createStatusOverviewChildren;
    private _createServerItem;
    private _createServerChildren;
    private _createToolItem;
    private _createToolParameterItems;
    private _createNoServersItem;
    private _createQuickActionsItem;
    private _getStatusIcon;
    private _capitalizeFirst;
}
//# sourceMappingURL=MCPTreeProvider.d.ts.map