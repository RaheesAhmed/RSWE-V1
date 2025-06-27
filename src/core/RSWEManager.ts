import * as vscode from 'vscode';
import { ClaudeService } from '../services/ClaudeService';
import { ProjectAnalyzer } from '../services/ProjectAnalyzer';
import { MCPManager } from '../services/MCPManager';
import { ContextManager } from '../services/ContextManager';
import { ValidationEngine } from '../services/ValidationEngine';
import { Logger } from '../utils/Logger';
import { ConfigManager } from '../utils/ConfigManager';

/**
 * Main RSWE-V1 Manager
 * Orchestrates all services and provides high-level functionality
 */
export class RSWEManager implements vscode.Disposable {
    private context: vscode.ExtensionContext | undefined;
    private isInitialized = false;
    private disposables: vscode.Disposable[] = [];

    constructor(
        private claudeService: ClaudeService,
        private projectAnalyzer: ProjectAnalyzer,
        private mcpManager: MCPManager,
        private contextManager: ContextManager,
        private validationEngine: ValidationEngine
    ) {}

    /**
     * Initialize the RSWE manager and all services
     */
    async initialize(context: vscode.ExtensionContext): Promise<void> {
        if (this.isInitialized) {
            Logger.warn('RSWEManager already initialized');
            return;
        }

        try {
            this.context = context;
            Logger.info('🔧 Initializing RSWE-V1 Manager...');

            // Initialize configuration
            await ConfigManager.initialize();

            // Initialize services in dependency order
            await this.claudeService.initialize();
            await this.projectAnalyzer.initialize(context);
            await this.mcpManager.initialize();
            await this.contextManager.initialize();
            await this.validationEngine.initialize();

            // Set up workspace listeners
            this.setupWorkspaceListeners();

            // Initial project analysis if workspace is open
            if (vscode.workspace.workspaceFolders?.length) {
                await this.performInitialAnalysis();
            }

            this.isInitialized = true;
            Logger.info('✅ RSWE-V1 Manager initialized successfully');

        } catch (error) {
            Logger.error('❌ Failed to initialize RSWE-V1 Manager', error);
            throw error;
        }
    }

    /**
     * Activate RSWE for the current workspace
     */
    async activate(): Promise<void> {
        if (!this.isInitialized) {
            throw new Error('RSWEManager not initialized');
        }

        try {
            Logger.info('🚀 Activating RSWE-V1 for workspace...');

            // Validate API key
            const apiKey = ConfigManager.get('anthropic.apiKey');
            if (!apiKey) {
                const action = await vscode.window.showWarningMessage(
                    'RSWE-V1 requires a Claude API key to function.',
                    'Configure API Key',
                    'Learn More'
                );

                if (action === 'Configure API Key') {
                    await vscode.commands.executeCommand('rswe.settings');
                } else if (action === 'Learn More') {
                    await vscode.env.openExternal(vscode.Uri.parse('https://console.anthropic.com/'));
                }
                return;
            }

            // Test Claude connection
            const isConnected = await this.claudeService.testConnection();
            if (!isConnected) {
                vscode.window.showErrorMessage('Failed to connect to Claude. Please check your API key.');
                return;
            }

            // Start project analysis
            await this.analyzeProject();

            vscode.window.showInformationMessage('🤖 RSWE-V1 is now active and analyzing your project!');

        } catch (error) {
            Logger.error('❌ Failed to activate RSWE-V1', error);
            vscode.window.showErrorMessage(`Failed to activate RSWE-V1: ${error}`);
        }
    }

    /**
     * Analyze the current project
     */
    async analyzeProject(uri?: vscode.Uri): Promise<void> {
        if (!this.isInitialized) {
            return;
        }

        try {
            Logger.info('🔍 Starting project analysis...');

            const targetUri = uri || (vscode.workspace.workspaceFolders?.[0]?.uri);
            if (!targetUri) {
                vscode.window.showWarningMessage('No workspace folder found to analyze.');
                return;
            }

            // Show progress
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'RSWE-V1: Analyzing Project',
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: 'Scanning files...' });
                await this.projectAnalyzer.analyzeWorkspace(targetUri);

                progress.report({ increment: 33, message: 'Building context map...' });
                await this.contextManager.buildContext(targetUri);

                progress.report({ increment: 66, message: 'Indexing for semantic search...' });
                await this.contextManager.indexForSearch();

                progress.report({ increment: 100, message: 'Analysis complete!' });
            });

            Logger.info('✅ Project analysis completed');
            vscode.window.showInformationMessage('🎯 Project analysis complete! RSWE-V1 now has full context.');

        } catch (error) {
            Logger.error('❌ Project analysis failed', error);
            vscode.window.showErrorMessage(`Project analysis failed: ${error}`);
        }
    }

    /**
     * Ask Claude with full project context
     */
    async askClaude(): Promise<void> {
        if (!this.isInitialized) {
            return;
        }

        try {
            const question = await vscode.window.showInputBox({
                prompt: 'Ask Claude anything about your code...',
                placeHolder: 'e.g., "How can I optimize this function?" or "Add error handling to this class"'
            });

            if (!question) {
                return;
            }

            // Get current context
            const activeEditor = vscode.window.activeTextEditor;
            const currentFile = activeEditor?.document.uri;
            const selectedText = activeEditor?.document.getText(activeEditor.selection);

            // Build context for Claude
            const context = await this.contextManager.getRelevantContext(question, currentFile);

            // Send to Claude with full context
            const response = await this.claudeService.sendMessage({
                question,
                context,
                selectedText,
                currentFile: currentFile?.fsPath
            });

            // Show response in a new document or webview
            await this.showClaudeResponse(response, question);

        } catch (error) {
            Logger.error('❌ Failed to ask Claude', error);
            vscode.window.showErrorMessage(`Failed to ask Claude: ${error}`);
        }
    }

    /**
     * Refactor selected code with Claude
     */
    async refactorCode(): Promise<void> {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor || activeEditor.selection.isEmpty) {
            vscode.window.showWarningMessage('Please select code to refactor.');
            return;
        }

        try {
            const selectedText = activeEditor.document.getText(activeEditor.selection);
            const language = activeEditor.document.languageId;

            const refactorType = await vscode.window.showQuickPick([
                'Optimize Performance',
                'Improve Readability',
                'Add Error Handling',
                'Extract Functions',
                'Add Type Safety',
                'Follow Best Practices',
                'Custom Refactoring...'
            ], {
                placeHolder: 'What type of refactoring do you need?'
            });

            if (!refactorType) {
                return;
            }

            let prompt = '';
            if (refactorType === 'Custom Refactoring...') {
                const customPrompt = await vscode.window.showInputBox({
                    prompt: 'Describe the refactoring you want...',
                    placeHolder: 'e.g., "Convert to async/await" or "Add input validation"'
                });
                if (!customPrompt) {
                    return;
                }
                prompt = customPrompt;
            } else {
                prompt = refactorType;
            }

            // Get file context
            const context = await this.contextManager.getFileContext(activeEditor.document.uri);

            // Send to Claude for refactoring
            const refactoredCode = await this.claudeService.refactorCode({
                code: selectedText,
                language,
                prompt,
                context
            });

            // Validate the refactored code
            const isValid = await this.validationEngine.validateCode(refactoredCode, language);
            if (!isValid.isValid) {
                Logger.warn('Refactored code validation warnings', isValid.issues);
                const proceed = await vscode.window.showWarningMessage(
                    'The refactored code has validation warnings. Proceed anyway?',
                    'Yes', 'No'
                );
                if (proceed !== 'Yes') {
                    return;
                }
            }

            // Apply the refactoring
            await activeEditor.edit(editBuilder => {
                editBuilder.replace(activeEditor.selection, refactoredCode);
            });

            vscode.window.showInformationMessage('🔧 Code refactored successfully!');

        } catch (error) {
            Logger.error('❌ Code refactoring failed', error);
            vscode.window.showErrorMessage(`Code refactoring failed: ${error}`);
        }
    }

    /**
     * Generate tests for current file
     */
    async generateTests(): Promise<void> {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            vscode.window.showWarningMessage('Please open a file to generate tests for.');
            return;
        }

        try {
            const document = activeEditor.document;
            const code = document.getText();
            const language = document.languageId;
            const fileName = document.fileName;

            // Get project context for test generation
            const context = await this.contextManager.getTestContext(document.uri);

            // Generate tests with Claude
            const tests = await this.claudeService.generateTests({
                code,
                language,
                fileName,
                context
            });

            // Determine test file path
            const testFilePath = this.getTestFilePath(fileName, language);

            // Create test file
            const testUri = vscode.Uri.file(testFilePath);
            const testEdit = new vscode.WorkspaceEdit();
            testEdit.createFile(testUri, { ignoreIfExists: true });
            testEdit.set(testUri, [vscode.TextEdit.insert(new vscode.Position(0, 0), tests)]);

            await vscode.workspace.applyEdit(testEdit);
            
            // Open the test file
            const testDocument = await vscode.workspace.openTextDocument(testUri);
            await vscode.window.showTextDocument(testDocument);

            vscode.window.showInformationMessage('🧪 Tests generated successfully!');

        } catch (error) {
            Logger.error('❌ Test generation failed', error);
            vscode.window.showErrorMessage(`Test generation failed: ${error}`);
        }
    }

    /**
     * Open RSWE chat interface
     */
    async openChat(): Promise<void> {
        await vscode.commands.executeCommand('rswe.chat.focus');
    }

    /**
     * Set up workspace event listeners
     */
    private setupWorkspaceListeners(): void {
        // File change listeners
        const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*');
        
        fileWatcher.onDidCreate(async (uri) => {
            await this.contextManager.addFile(uri);
        });

        fileWatcher.onDidChange(async (uri) => {
            await this.contextManager.updateFile(uri);
        });

        fileWatcher.onDidDelete(async (uri) => {
            await this.contextManager.removeFile(uri);
        });

        this.disposables.push(fileWatcher);

        // Document change listeners
        this.disposables.push(
            vscode.workspace.onDidOpenTextDocument(async (document) => {
                await this.contextManager.trackDocument(document);
            })
        );

        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument(async (event) => {
                await this.contextManager.updateDocument(event.document);
            })
        );
    }

    /**
     * Perform initial project analysis
     */
    private async performInitialAnalysis(): Promise<void> {
        try {
            // Check if user wants auto-analysis
            const autoAnalyze = ConfigManager.get('context.autoAnalyzeOnStartup', true);
            if (!autoAnalyze) {
                return;
            }

            Logger.info('🔍 Starting initial project analysis...');
            await this.analyzeProject();

        } catch (error) {
            Logger.error('❌ Initial project analysis failed', error);
        }
    }

    /**
     * Show Claude response in appropriate format
     */
    private async showClaudeResponse(response: string, question: string): Promise<void> {
        // Create a new untitled document with the response
        const document = await vscode.workspace.openTextDocument({
            content: `# Claude Response\n\n**Question:** ${question}\n\n**Answer:**\n\n${response}`,
            language: 'markdown'
        });

        await vscode.window.showTextDocument(document);
    }

    /**
     * Get test file path based on source file and language
     */
    private getTestFilePath(sourceFile: string, language: string): string {
        const path = require('path');
        const dir = path.dirname(sourceFile);
        const name = path.basename(sourceFile, path.extname(sourceFile));
        
        // Language-specific test patterns
        const testPatterns: Record<string, string> = {
            typescript: `${name}.test.ts`,
            javascript: `${name}.test.js`,
            python: `test_${name}.py`,
            java: `${name}Test.java`,
            csharp: `${name}Tests.cs`,
            go: `${name}_test.go`,
            rust: `${name}_test.rs`
        };

        const testFileName = testPatterns[language] || `${name}.test.${language}`;
        return path.join(dir, '__tests__', testFileName);
    }

    /**
     * Dispose of all resources
     */
    dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
        
        // Dispose services
        this.claudeService.dispose();
        this.projectAnalyzer.dispose();
        this.mcpManager.dispose();
        this.contextManager.dispose();
        this.validationEngine.dispose();

        this.isInitialized = false;
    }
}
