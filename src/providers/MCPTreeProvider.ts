import * as vscode from 'vscode';
import { RSWEManager } from '@/core/RSWEManager';
import { TreeViewItem, MCPServer, MCPTool } from '@/types';

/**
 * MCP Tree Provider for RSWE-V1 Sidebar
 * 
 * Displays and manages MCP (Model Context Protocol) servers with:
 * - Server status monitoring
 * - Available tools listing
 * - Connection management
 * - Real-time health checks
 */
export class MCPTreeProvider implements vscode.TreeDataProvider<TreeViewItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<TreeViewItem | undefined | null | void> = new vscode.EventEmitter<TreeViewItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<TreeViewItem | undefined | null | void> = this._onDidChangeTreeData.event;

	private _mcpServers: MCPServer[] = [];
	private _refreshInterval: NodeJS.Timeout | null = null;

	constructor(private readonly _rsweManager: RSWEManager) {
		this._initialize();
		this._startAutoRefresh();
	}

	private async _initialize(): Promise<void> {
		try {
			this._mcpServers = await this._rsweManager.getMCPServers();
		} catch (error) {
			console.warn('Failed to initialize MCP servers:', error);
			this._mcpServers = [];
		}
	}

	private _startAutoRefresh(): void {
		// Refresh every 30 seconds to check server status
		this._refreshInterval = setInterval(() => {
			this.refresh();
		}, 30000);
	}

	public refresh(): void {
		this._initialize().then(() => {
			this._onDidChangeTreeData.fire();
		});
	}

	public dispose(): void {
		if (this._refreshInterval) {
			clearInterval(this._refreshInterval);
			this._refreshInterval = null;
		}
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
		if (!element) {
			return this._getRootItems();
		}

		return element.children || [];
	}

	private _getRootItems(): TreeViewItem[] {
		const items: TreeViewItem[] = [];

		// Server Status Overview
		items.push(this._createStatusOverviewItem());

		// Individual MCP Servers
		if (this._mcpServers.length > 0) {
			for (const server of this._mcpServers) {
				items.push(this._createServerItem(server));
			}
		} else {
			items.push(this._createNoServersItem());
		}

		// Quick Actions
		items.push(this._createQuickActionsItem());

		return items;
	}

	private _createStatusOverviewItem(): TreeViewItem {
		const connectedCount = this._mcpServers.filter(s => s.status === 'connected').length;
		const totalCount = this._mcpServers.length;
		
		const status = connectedCount === totalCount && totalCount > 0 
			? 'All Connected' 
			: connectedCount === 0 
				? 'None Connected'
				: `${connectedCount}/${totalCount} Connected`;

		const iconPath = connectedCount === totalCount && totalCount > 0 
			? 'check-all' 
			: connectedCount === 0 
				? 'error'
				: 'warning';

		return {
			id: 'status-overview',
			label: 'Server Status',
			description: status,
			tooltip: `MCP Server Connection Status: ${status}`,
			iconPath,
			collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
			contextValue: 'mcpStatusOverview',
			children: this._createStatusOverviewChildren()
		};
	}

	private _createStatusOverviewChildren(): TreeViewItem[] {
		const children: TreeViewItem[] = [];

		// Connection summary
		const statusCounts = this._mcpServers.reduce((acc, server) => {
			acc[server.status] = (acc[server.status] || 0) + 1;
			return acc;
		}, {} as Record<string, number>);

		for (const [status, count] of Object.entries(statusCounts)) {
			const iconPath = status === 'connected' ? 'check' : status === 'error' ? 'error' : 'warning';
			children.push({
				id: `status-${status}`,
				label: this._capitalizeFirst(status),
				description: `${count} servers`,
				iconPath,
				tooltip: `${count} servers with ${status} status`,
				contextValue: 'statusSummary'
			});
		}

		// Total tools available
		const totalTools = this._mcpServers.reduce((sum, server) => sum + server.tools.length, 0);
		if (totalTools > 0) {
			children.push({
				id: 'total-tools',
				label: 'Available Tools',
				description: `${totalTools} tools`,
				iconPath: 'tools',
				tooltip: `${totalTools} tools available across all servers`,
				contextValue: 'toolsSummary'
			});
		}

		return children;
	}

	private _createServerItem(server: MCPServer): TreeViewItem {
		const statusIcon = this._getStatusIcon(server.status);
		const lastPingText = server.lastPing 
			? `Last ping: ${server.lastPing.toLocaleTimeString()}`
			: 'Never pinged';

		return {
			id: `server-${server.id}`,
			label: server.name,
			description: this._capitalizeFirst(server.status),
			tooltip: `${server.name}\nStatus: ${server.status}\nTransport: ${server.transport}\nTools: ${server.tools.length}\n${lastPingText}`,
			iconPath: statusIcon,
			collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
			contextValue: `mcpServer-${server.status}`,
			children: this._createServerChildren(server)
		};
	}

	private _createServerChildren(server: MCPServer): TreeViewItem[] {
		const children: TreeViewItem[] = [];

		// Server info
		children.push({
			id: `${server.id}-info`,
			label: 'Server Info',
			iconPath: 'info',
			collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
			contextValue: 'serverInfo',
			children: [
				{
					id: `${server.id}-transport`,
					label: 'Transport',
					description: server.transport.toUpperCase(),
					iconPath: 'link',
					contextValue: 'serverDetail'
				},
				{
					id: `${server.id}-last-ping`,
					label: 'Last Ping',
					description: server.lastPing ? server.lastPing.toLocaleString() : 'Never',
					iconPath: 'pulse',
					contextValue: 'serverDetail'
				}
			]
		});

		// Available tools
		if (server.tools.length > 0) {
			children.push({
				id: `${server.id}-tools`,
				label: 'Available Tools',
				description: `${server.tools.length} tools`,
				iconPath: 'tools',
				collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
				contextValue: 'serverTools',
				children: server.tools.map(tool => this._createToolItem(server.id, tool))
			});
		} else {
			children.push({
				id: `${server.id}-no-tools`,
				label: 'No Tools Available',
				description: 'Server has no registered tools',
				iconPath: 'warning',
				contextValue: 'noTools'
			});
		}

		// Actions
		children.push({
			id: `${server.id}-actions`,
			label: 'Actions',
			iconPath: 'zap',
			collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
			contextValue: 'serverActions',
			children: [
				{
					id: `${server.id}-ping`,
					label: 'Ping Server',
					description: 'Test connection',
					iconPath: 'pulse',
					command: {
						command: 'rswe.pingMcpServer',
						title: 'Ping MCP Server',
						arguments: [server.id]
					},
					contextValue: 'pingAction'
				},
				{
					id: `${server.id}-restart`,
					label: 'Restart Server',
					description: 'Reconnect to server',
					iconPath: 'refresh',
					command: {
						command: 'rswe.restartMcpServer',
						title: 'Restart MCP Server',
						arguments: [server.id]
					},
					contextValue: 'restartAction'
				}
			]
		});

		return children;
	}

	private _createToolItem(serverId: string, tool: MCPTool): TreeViewItem {
		const paramCount = Object.keys(tool.parameters).length;
		
		const item: TreeViewItem = {
			id: `${serverId}-tool-${tool.name}`,
			label: tool.name,
			description: `${paramCount} parameters`,
			tooltip: `${tool.name}\n${tool.description}\nParameters: ${paramCount}`,
			iconPath: 'symbol-method',
			collapsibleState: paramCount > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
			contextValue: 'mcpTool'
		};
		
		if (paramCount > 0) {
			item.children = this._createToolParameterItems(serverId, tool);
		}
		
		return item;
	}

	private _createToolParameterItems(serverId: string, tool: MCPTool): TreeViewItem[] {
		return Object.entries(tool.parameters).map(([paramName, paramInfo]) => ({
			id: `${serverId}-tool-${tool.name}-param-${paramName}`,
			label: paramName,
			description: typeof paramInfo === 'object' && paramInfo.type ? paramInfo.type : 'any',
			tooltip: `Parameter: ${paramName}\nType: ${typeof paramInfo === 'object' && paramInfo.type ? paramInfo.type : 'any'}${typeof paramInfo === 'object' && paramInfo.description ? `\nDescription: ${paramInfo.description}` : ''}`,
			iconPath: 'symbol-parameter',
			contextValue: 'toolParameter'
		}));
	}

	private _createNoServersItem(): TreeViewItem {
		return {
			id: 'no-servers',
			label: 'No MCP Servers',
			description: 'Configure servers in settings',
			tooltip: 'No MCP servers are currently configured. Add servers in your VS Code settings under rswe.mcp.servers',
			iconPath: 'warning',
			contextValue: 'noServers',
			command: {
				command: 'workbench.action.openSettings',
				title: 'Open Settings',
				arguments: ['rswe.mcp']
			}
		};
	}

	private _createQuickActionsItem(): TreeViewItem {
		return {
			id: 'mcp-actions',
			label: 'Quick Actions',
			description: 'MCP management',
			tooltip: 'Quick actions for managing MCP servers',
			iconPath: 'zap',
			collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
			contextValue: 'mcpQuickActions',
			children: [
				{
					id: 'refresh-all',
					label: 'Refresh All Servers',
					description: 'Reconnect all servers',
					iconPath: 'refresh',
					command: {
						command: 'rswe.refreshMcp',
						title: 'Refresh MCP Servers'
					},
					contextValue: 'refreshAction'
				},
				{
					id: 'add-server',
					label: 'Add New Server',
					description: 'Configure new MCP server',
					iconPath: 'add',
					command: {
						command: 'rswe.addMcpServer',
						title: 'Add MCP Server'
					},
					contextValue: 'addServerAction'
				},
				{
					id: 'open-settings',
					label: 'Open MCP Settings',
					description: 'Configure MCP servers',
					iconPath: 'settings-gear',
					command: {
						command: 'workbench.action.openSettings',
						title: 'Open Settings',
						arguments: ['rswe.mcp']
					},
					contextValue: 'settingsAction'
				}
			]
		};
	}

	private _getStatusIcon(status: string): string {
		switch (status) {
			case 'connected':
				return 'check';
			case 'disconnected':
				return 'circle-outline';
			case 'error':
				return 'error';
			default:
				return 'warning';
		}
	}

	private _capitalizeFirst(str: string): string {
		return str.charAt(0).toUpperCase() + str.slice(1);
	}
}
