import Anthropic from '@anthropic-ai/sdk';
import * as vscode from 'vscode';
import { Logger } from '../utils/Logger';
import { ConfigManager } from '../utils/ConfigManager';

export interface ClaudeMessage {
    question: string;
    context?: string[];
    selectedText?: string;
    currentFile?: string;
}

export interface RefactorRequest {
    code: string;
    language: string;
    prompt: string;
    context?: string[];
}

export interface TestGenerationRequest {
    code: string;
    language: string;
    fileName: string;
    context?: string[];
}

/**
 * Claude AI Service
 * Handles all interactions with Anthropic's Claude API
 */
export class ClaudeService implements vscode.Disposable {
    private client: Anthropic | undefined;
    private isInitialized = false;

    /**
     * Initialize the Claude service
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        try {
            Logger.info('🤖 Initializing Claude Service...');

            const apiKey = ConfigManager.get('anthropic.apiKey');
            if (!apiKey) {
                Logger.warn('No Claude API key configured');
                return;
            }

            this.client = new Anthropic({
                apiKey: apiKey,
                maxRetries: 3,
                timeout: 60000 // 60 seconds
            });

            this.isInitialized = true;
            Logger.info('✅ Claude Service initialized successfully');

        } catch (error) {
            Logger.error('❌ Failed to initialize Claude Service', error);
            throw error;
        }
    }

    /**
     * Test connection to Claude API
     */
    async testConnection(): Promise<boolean> {
        if (!this.client) {
            return false;
        }

        try {
            const response = await this.client.messages.create({
                model: ConfigManager.get('anthropic.model', 'claude-3-5-sonnet-latest'),
                max_tokens: 10,
                messages: [{ role: 'user', content: 'Hello' }]
            });

            return response.content.length > 0;

        } catch (error) {
            Logger.error('❌ Claude connection test failed', error);
            return false;
        }
    }

    /**
     * Send a message to Claude with project context
     */
    async sendMessage(request: ClaudeMessage): Promise<string> {
        if (!this.client) {
            throw new Error('Claude service not initialized');
        }

        try {
            Logger.info('📤 Sending message to Claude...');

            // Build the system prompt with RSWE-V1 identity
            const systemPrompt = this.buildSystemPrompt(request.context);

            // Build the user message with context
            const userMessage = this.buildUserMessage(request);

            const response = await this.client.messages.create({
                model: ConfigManager.get('anthropic.model', 'claude-3-5-sonnet-latest'),
                max_tokens: 4000,
                system: systemPrompt,
                messages: [{ role: 'user', content: userMessage }],
                temperature: 0.1 // Low temperature for more consistent, accurate responses
            });

            const responseText = response.content
                .filter(block => block.type === 'text')
                .map(block => (block as any).text)
                .join('\n');

            Logger.info('📥 Received response from Claude');
            return responseText;

        } catch (error) {
            Logger.error('❌ Failed to send message to Claude', error);
            throw new Error(`Claude API error: ${error}`);
        }
    }

    /**
     * Refactor code with Claude
     */
    async refactorCode(request: RefactorRequest): Promise<string> {
        if (!this.client) {
            throw new Error('Claude service not initialized');
        }

        try {
            Logger.info('🔧 Requesting code refactoring from Claude...');

            const systemPrompt = `You are RSWE-V1, an elite AI software engineer that never makes mistakes. You specialize in code refactoring with zero-error architecture.

CRITICAL RULES:
1. NEVER write placeholder or TODO code
2. All code must be production-ready and complete
3. Maintain existing functionality while improving the code
4. Add comprehensive error handling
5. Follow language-specific best practices
6. Include TypeScript types where applicable
7. Preserve original logic and behavior

Your task is to refactor the provided code according to the user's requirements while maintaining perfect functionality.`;

            const userMessage = `Please refactor this ${request.language} code: "${request.prompt}"

Original Code:
\`\`\`${request.language}
${request.code}
\`\`\`

${request.context ? `\nProject Context:\n${request.context.join('\n')}` : ''}

Requirements:
- Maintain all existing functionality
- ${request.prompt}
- Add proper error handling
- Follow ${request.language} best practices
- Return ONLY the refactored code, no explanations`;

            const response = await this.client.messages.create({
                model: ConfigManager.get('anthropic.model', 'claude-3-5-sonnet-latest'),
                max_tokens: 4000,
                system: systemPrompt,
                messages: [{ role: 'user', content: userMessage }],
                temperature: 0.1
            });

            const responseText = response.content
                .filter(block => block.type === 'text')
                .map(block => (block as any).text)
                .join('\n');

            // Extract code from response (remove markdown if present)
            const codeMatch = responseText.match(/```[\w]*\n([\s\S]*?)\n```/);
            const refactoredCode = codeMatch ? codeMatch[1] : responseText.trim();

            Logger.info('✅ Code refactoring completed');
            return refactoredCode;

        } catch (error) {
            Logger.error('❌ Code refactoring failed', error);
            throw new Error(`Code refactoring failed: ${error}`);
        }
    }

    /**
     * Generate tests with Claude
     */
    async generateTests(request: TestGenerationRequest): Promise<string> {
        if (!this.client) {
            throw new Error('Claude service not initialized');
        }

        try {
            Logger.info('🧪 Generating tests with Claude...');

            const systemPrompt = `You are RSWE-V1, an elite AI software engineer that writes comprehensive, production-ready tests.

CRITICAL RULES:
1. Write complete, runnable tests with NO placeholders
2. Cover all functions, edge cases, and error scenarios
3. Use appropriate testing framework for the language
4. Include setup/teardown where needed
5. Add descriptive test names and comments
6. Test both success and failure paths
7. Include mocking where appropriate
8. Follow testing best practices

Generate comprehensive unit tests for the provided code.`;

            const testFrameworks: Record<string, string> = {
                typescript: 'Jest with TypeScript',
                javascript: 'Jest',
                python: 'pytest',
                java: 'JUnit 5',
                csharp: 'xUnit',
                go: 'Go standard testing',
                rust: 'Rust standard testing'
            };

            const framework = testFrameworks[request.language] || 'appropriate testing framework';

            const userMessage = `Generate comprehensive unit tests for this ${request.language} code using ${framework}.

Source Code (${request.fileName}):
\`\`\`${request.language}
${request.code}
\`\`\`

${request.context ? `\nProject Context:\n${request.context.join('\n')}` : ''}

Requirements:
- Test all public functions and methods
- Include edge cases and error scenarios
- Use proper assertions and mocking
- Add descriptive test names
- Include necessary imports and setup
- Return complete, runnable test file`;

            const response = await this.client.messages.create({
                model: ConfigManager.get('anthropic.model', 'claude-3-5-sonnet-latest'),
                max_tokens: 4000,
                system: systemPrompt,
                messages: [{ role: 'user', content: userMessage }],
                temperature: 0.2
            });

            const responseText = response.content
                .filter(block => block.type === 'text')
                .map(block => (block as any).text)
                .join('\n');

            Logger.info('✅ Test generation completed');
            return responseText;

        } catch (error) {
            Logger.error('❌ Test generation failed', error);
            throw new Error(`Test generation failed: ${error}`);
        }
    }

    /**
     * Stream response from Claude (for real-time chat)
     */
    async streamMessage(request: ClaudeMessage, onChunk: (chunk: string) => void): Promise<void> {
        if (!this.client) {
            throw new Error('Claude service not initialized');
        }

        try {
            Logger.info('📡 Starting Claude stream...');

            const systemPrompt = this.buildSystemPrompt(request.context);
            const userMessage = this.buildUserMessage(request);

            const stream = await this.client.messages.create({
                model: ConfigManager.get('anthropic.model', 'claude-3-5-sonnet-latest'),
                max_tokens: 4000,
                system: systemPrompt,
                messages: [{ role: 'user', content: userMessage }],
                temperature: 0.1,
                stream: true
            });

            for await (const messageStreamEvent of stream) {
                if (messageStreamEvent.type === 'content_block_delta' && 
                    messageStreamEvent.delta.type === 'text_delta') {
                    onChunk(messageStreamEvent.delta.text);
                }
            }

            Logger.info('✅ Claude stream completed');

        } catch (error) {
            Logger.error('❌ Claude streaming failed', error);
            throw new Error(`Claude streaming failed: ${error}`);
        }
    }

    /**
     * Build system prompt with RSWE-V1 identity
     */
    private buildSystemPrompt(context?: string[]): string {
        let systemPrompt = `You are RSWE-V1, the first AI-powered coding assistant that never makes mistakes. You are a revolutionary AI software engineer with complete project intelligence and zero-error architecture.

CORE IDENTITY:
- Elite-tier software engineer at Google/Meta/Microsoft Principal Engineer level
- Complete project context awareness and understanding
- Zero-error production-ready code generation
- World-class UI/UX design sensibilities
- NEVER write dummy, placeholder, or "TODO" code

CAPABILITIES:
- Full codebase comprehension and analysis
- Context-aware decision making considering the entire project ecosystem
- Modern development practices with latest frameworks
- Comprehensive error handling and security practices
- Performance optimization and best practices

BEHAVIOR:
- Provide complete, production-ready solutions
- Consider full project impact of any changes
- Suggest modern, maintainable approaches
- Include proper error handling and validation
- Follow language-specific best practices`;

        if (context && context.length > 0) {
            systemPrompt += `\n\nPROJECT CONTEXT:\n${context.join('\n')}`;
        }

        return systemPrompt;
    }

    /**
     * Build user message with context
     */
    private buildUserMessage(request: ClaudeMessage): string {
        let message = request.question;

        if (request.currentFile) {
            message += `\n\nCurrent File: ${request.currentFile}`;
        }

        if (request.selectedText) {
            message += `\n\nSelected Code:\n\`\`\`\n${request.selectedText}\n\`\`\``;
        }

        return message;
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        this.client = undefined;
        this.isInitialized = false;
    }
}
