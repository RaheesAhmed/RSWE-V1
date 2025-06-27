import * as vscode from 'vscode';
import { RSWEManager } from '@/core/RSWEManager';
import { ChatViewProvider } from '@/providers/ChatViewProvider';
import { ProjectTreeProvider } from '@/providers/ProjectTreeProvider';
import { MCPTreeProvider } from '@/providers/MCPTreeProvider';
import { RSWEError } from '@/types';

/**
 * RSWE-V1 Extension Activation Point
 * 
 * This function is called when the extension is activated.
 * It initializes all core components and sets up the sidebar UI.
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
	try {
		// Initialize the core RSWE manager
		const rsweManager = new RSWEManager(context);
		await rsweManager.initialize();

		// Register webview providers for the sidebar
		const chatProvider = new ChatViewProvider(context.extensionUri, rsweManager);
		const projectProvider = new ProjectTreeProvider(rsweManager);
		const mcpProvider = new MCPTreeProvider(rsweManager);

		// Register webview views
		context.subscriptions.push(
			vscode.window.registerWebviewViewProvider('rswe.chatView', chatProvider, {
				webviewOptions: {
					retainContextWhenHidden: true
				}
			})
		);

		// Register tree data providers
		context.subscriptions.push(
			vscode.window.registerTreeDataProvider('rswe.projectView', projectProvider),
			vscode.window.registerTreeDataProvider('rswe.mcpView', mcpProvider)
		);

		// Register commands
		context.subscriptions.push(
			vscode.commands.registerCommand('rswe.openChat', () => {
				vscode.commands.executeCommand('rswe.chatView.focus');
			}),

			vscode.commands.registerCommand('rswe.analyzeSelection', async (_selection: vscode.Selection) => {
				try {
					await rsweManager.analyzeProject();
					projectProvider.refresh();
					vscode.window.showInformationMessage('Project analysis completed successfully');
				} catch (error) {
					vscode.window.showErrorMessage(`Project analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
				}
			}),

			vscode.commands.registerCommand('rswe.refreshMcp', async () => {
				try {
					await rsweManager.refreshMCPServers();
					mcpProvider.refresh();
					vscode.window.showInformationMessage('MCP servers refreshed successfully');
				} catch (error) {
					vscode.window.showErrorMessage(`MCP refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
				}
			}),

			vscode.commands.registerCommand('rswe.validateCode', async () => {
				const activeEditor = vscode.window.activeTextEditor;
				if (!activeEditor) {
					vscode.window.showWarningMessage('No active editor found');
					return;
				}

				try {
					const result = await rsweManager.validateCode(activeEditor.document);
					if (result.isValid) {
						vscode.window.showInformationMessage('Code validation passed ');
					} else {
						const errorCount = result.errors.length;
						const warningCount = result.warnings.length;
						vscode.window.showWarningMessage(
							`Code validation found ${errorCount} errors and ${warningCount} warnings`
						);
					}
				} catch (error) {
					vscode.window.showErrorMessage(`Code validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
				}
			})
		);

		// Listen for configuration changes
		const disposable = vscode.workspace.onDidChangeConfiguration((event: vscode.ConfigurationChangeEvent) => {
			if (event.affectsConfiguration('rswe')) {
				rsweManager.updateConfiguration();
			}
		});
		context.subscriptions.push(disposable);

		// Listen for file system changes
		context.subscriptions.push(
			vscode.workspace.onDidChangeWorkspaceFolders(async () => {
				await rsweManager.analyzeProject();
				projectProvider.refresh();
			})
		);

		// Show welcome message
		vscode.window.showInformationMessage(
			'🚀 RSWE-V1 activated! Your AI Software Engineer is ready.',
			'Open Chat',
			'Analyze Project'
		).then((selection: string | undefined) => {
			switch (selection) {
				case 'Open Chat':
					vscode.commands.executeCommand('rswe.openChat');
					break;
				case 'Analyze Project':
					vscode.commands.executeCommand('rswe.analyzeProject');
					break;
			}
		});

		console.log('RSWE-V1 extension activated successfully');

	} catch (error) {
		const errorMessage = error instanceof RSWEError 
			? `RSWE Error: ${error.message}` 
			: `Activation failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
		
		vscode.window.showErrorMessage(errorMessage);
		console.error('RSWE-V1 activation failed:', error);
		throw error;
	}
}

/**
 * Extension Deactivation Point
 * 
 * This function is called when the extension is deactivated.
 * It performs cleanup operations.
 */
export function deactivate(): void {
	console.log('RSWE-V1 extension deactivated');
}
