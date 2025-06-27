import * as vscode from 'vscode';
import { RSWEManager } from './core/RSWEManager';
import { ClaudeService } from './services/ClaudeService';
import { ProjectAnalyzer } from './services/ProjectAnalyzer';
import { MCPManager } from './services/MCPManager';
import { ContextManager } from './services/ContextManager';
import { ValidationEngine } from './services/ValidationEngine';
import { ChatProvider } from './providers/ChatProvider';
import { ProjectProvider } from './providers/ProjectProvider';
import { MCPProvider } from './providers/MCPProvider';
import { Logger } from './utils/Logger';

let rsweManager: RSWEManager;

/**
 * Extension activation entry point
 * Called when VS Code starts up or when the extension is first activated
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    try {
        Logger.info('🚀 Activating RSWE-V1 Extension...');

        // Initialize core services
        const claudeService = new ClaudeService();
        const projectAnalyzer = new ProjectAnalyzer();
        const mcpManager = new MCPManager();
        const contextManager = new ContextManager();
        const validationEngine = new ValidationEngine();

        // Initialize main RSWE manager
        rsweManager = new RSWEManager(
            claudeService,
            projectAnalyzer,
            mcpManager,
            contextManager,
            validationEngine
        );

        // Initialize the manager
        await rsweManager.initialize(context);

        // Register commands
        registerCommands(context);

        // Register providers
        registerProviders(context);

        // Show activation message
        vscode.window.showInformationMessage(
            '🤖 RSWE-V1 is now active! The first AI that never makes mistakes.',
            'Open Chat', 'Settings'
        ).then(selection => {
            switch (selection) {
                case 'Open Chat':
                    vscode.commands.executeCommand('rswe.openChat');
                    break;
                case 'Settings':
                    vscode.commands.executeCommand('rswe.settings');
                    break;
            }
        });

        Logger.info('✅ RSWE-V1 Extension activated successfully');

    } catch (error) {
        Logger.error('❌ Failed to activate RSWE-V1 Extension', error);
        vscode.window.showErrorMessage(`Failed to activate RSWE-V1: ${error}`);
    }
}

/**
 * Register all VS Code commands
 */
function registerCommands(context: vscode.ExtensionContext): void {
    const commands = [
        vscode.commands.registerCommand('rswe.activate', async () => {
            await rsweManager.activate();
        }),

        vscode.commands.registerCommand('rswe.analyzeProject', async (uri?: vscode.Uri) => {
            await rsweManager.analyzeProject(uri);
        }),

        vscode.commands.registerCommand('rswe.askClaude', async () => {
            await rsweManager.askClaude();
        }),

        vscode.commands.registerCommand('rswe.refactorCode', async () => {
            await rsweManager.refactorCode();
        }),

        vscode.commands.registerCommand('rswe.generateTests', async () => {
            await rsweManager.generateTests();
        }),

        vscode.commands.registerCommand('rswe.openChat', async () => {
            await rsweManager.openChat();
        }),

        vscode.commands.registerCommand('rswe.settings', async () => {
            await vscode.commands.executeCommand('workbench.action.openSettings', 'rswe');
        })
    ];

    commands.forEach(command => context.subscriptions.push(command));
}

/**
 * Register tree data providers and webview providers
 */
function registerProviders(context: vscode.ExtensionContext): void {
    // Chat webview provider
    const chatProvider = new ChatProvider(context.extensionUri, rsweManager);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('rswe.chat', chatProvider)
    );

    // Project analysis tree provider
    const projectProvider = new ProjectProvider(rsweManager);
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('rswe.project', projectProvider)
    );

    // MCP servers tree provider
    const mcpProvider = new MCPProvider(rsweManager);
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('rswe.mcp', mcpProvider)
    );
}

/**
 * Extension deactivation
 */
export async function deactivate(): Promise<void> {
    try {
        Logger.info('🔄 Deactivating RSWE-V1 Extension...');
        
        if (rsweManager) {
            await rsweManager.dispose();
        }

        Logger.info('✅ RSWE-V1 Extension deactivated successfully');
    } catch (error) {
        Logger.error('❌ Error during RSWE-V1 Extension deactivation', error);
    }
}
