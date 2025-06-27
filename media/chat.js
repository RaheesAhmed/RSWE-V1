/* RSWE-V1 Chat Interface JavaScript */
/* Modern ES6+ with comprehensive error handling and accessibility */

(function() {
    'use strict';

    // VS Code API reference
    const vscode = acquireVsCodeApi();

    // DOM elements
    let messageInput;
    let sendBtn;
    let chatMessages;
    let typingIndicator;
    let exportBtn;
    let clearBtn;

    // State management
    let isTyping = false;
    let messageHistory = [];
    let currentSessionId = null;

    /**
     * Initialize the chat interface
     */
    function initialize() {
        try {
            // Get DOM elements
            messageInput = document.getElementById('messageInput');
            sendBtn = document.getElementById('sendBtn');
            chatMessages = document.getElementById('chatMessages');
            typingIndicator = document.getElementById('typingIndicator');
            exportBtn = document.getElementById('exportBtn');
            clearBtn = document.getElementById('clearBtn');

            if (!messageInput || !sendBtn || !chatMessages) {
                throw new Error('Required DOM elements not found');
            }

            // Set up event listeners
            setupEventListeners();

            // Set up message handling from VS Code
            window.addEventListener('message', handleVSCodeMessage);

            // Auto-resize textarea
            setupAutoResize();

            // Initialize accessibility
            setupAccessibility();

            console.log('RSWE Chat interface initialized successfully');

        } catch (error) {
            console.error('Failed to initialize chat interface:', error);
            showError('Failed to initialize chat interface');
        }
    }

    /**
     * Set up all event listeners
     */
    function setupEventListeners() {
        // Send button click
        sendBtn.addEventListener('click', handleSendMessage);

        // Enter key handling
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
            }
        });

        // Input validation
        messageInput.addEventListener('input', validateInput);

        // Header action buttons
        if (exportBtn) {
            exportBtn.addEventListener('click', handleExportChat);
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', handleClearChat);
        }

        // Prevent form submission if wrapped in form
        const form = messageInput.closest('form');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                handleSendMessage();
            });
        }
    }

    /**
     * Handle sending a message
     */
    async function handleSendMessage() {
        const message = messageInput.value.trim();
        
        if (!message || isTyping) {
            return;
        }

        try {
            // Clear input immediately for better UX
            messageInput.value = '';
            validateInput();

            // Add user message to UI
            addMessageToUI({
                id: generateId(),
                role: 'user',
                content: message,
                timestamp: new Date()
            });

            // Send to VS Code extension
            vscode.postMessage({
                type: 'chat.send',
                payload: { message }
            });

            // Focus back to input
            messageInput.focus();

        } catch (error) {
            console.error('Failed to send message:', error);
            showError('Failed to send message');
        }
    }

    /**
     * Handle messages from VS Code extension
     */
    function handleVSCodeMessage(event) {
        const message = event.data;

        try {
            switch (message.type) {
                case 'chat.message':
                    addMessageToUI(message.payload.message);
                    break;

                case 'chat.typing':
                    setTypingIndicator(message.payload.isTyping);
                    break;

                case 'chat.clear':
                    clearMessages();
                    break;

                case 'chat.import':
                    importSession(message.payload.session);
                    break;

                case 'chat.error':
                    showError(message.payload.error);
                    break;

                default:
                    console.warn('Unknown message type:', message.type);
            }
        } catch (error) {
            console.error('Failed to handle VS Code message:', error);
        }
    }

    /**
     * Add a message to the UI
     */
    function addMessageToUI(message) {
        try {
            const messageElement = createMessageElement(message);
            
            // Remove welcome message if it exists
            const welcomeMessage = chatMessages.querySelector('.welcome-message');
            if (welcomeMessage) {
                welcomeMessage.remove();
            }

            chatMessages.appendChild(messageElement);
            scrollToBottom();

            // Add to history
            messageHistory.push(message);

            // Announce to screen readers
            announceMessage(message);

        } catch (error) {
            console.error('Failed to add message to UI:', error);
        }
    }

    /**
     * Create a message element
     */
    function createMessageElement(message) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message message-${message.role}`;
        messageDiv.setAttribute('role', 'article');
        messageDiv.setAttribute('aria-label', `${message.role} message`);

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        // Process content for code blocks and formatting
        contentDiv.innerHTML = processMessageContent(message.content);

        const metaDiv = document.createElement('div');
        metaDiv.className = 'message-meta';

        const timeSpan = document.createElement('span');
        timeSpan.className = 'message-time';
        timeSpan.textContent = formatTime(message.timestamp);

        metaDiv.appendChild(timeSpan);

        // Add token info for assistant messages
        if (message.role === 'assistant' && message.metadata?.tokens) {
            const tokensSpan = document.createElement('span');
            tokensSpan.className = 'message-tokens';
            tokensSpan.textContent = `${message.metadata.tokens} tokens`;
            metaDiv.appendChild(tokensSpan);
        }

        messageDiv.appendChild(contentDiv);
        messageDiv.appendChild(metaDiv);

        return messageDiv;
    }

    /**
     * Process message content for formatting
     */
    function processMessageContent(content) {
        if (!content) return '';

        // Escape HTML first
        let processed = escapeHtml(content);

        // Process code blocks (```language\ncode\n```)
        processed = processed.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, language, code) => {
            const lang = language || 'text';
            return `<pre><code class="language-${lang}">${code.trim()}</code></pre>`;
        });

        // Process inline code (`code`)
        processed = processed.replace(/`([^`]+)`/g, '<code>$1</code>');

        // Process line breaks
        processed = processed.replace(/\n/g, '<br>');

        return processed;
    }

    /**
     * Escape HTML characters
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Set typing indicator visibility
     */
    function setTypingIndicator(show) {
        isTyping = show;
        if (typingIndicator) {
            typingIndicator.style.display = show ? 'flex' : 'none';
            if (show) {
                scrollToBottom();
            }
        }
    }

    /**
     * Scroll chat to bottom
     */
    function scrollToBottom() {
        if (chatMessages) {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    }

    /**
     * Validate input and update send button state
     */
    function validateInput() {
        const hasContent = messageInput.value.trim().length > 0;
        sendBtn.disabled = !hasContent || isTyping;
        
        // Update aria-label for accessibility
        sendBtn.setAttribute('aria-label', 
            hasContent && !isTyping ? 'Send message' : 'Enter a message to send'
        );
    }

    /**
     * Handle export chat
     */
    function handleExportChat() {
        if (messageHistory.length === 0) {
            showError('No messages to export');
            return;
        }

        vscode.postMessage({
            type: 'chat.export',
            payload: {}
        });
    }

    /**
     * Handle clear chat
     */
    function handleClearChat() {
        if (messageHistory.length === 0) {
            return;
        }

        if (confirm('Are you sure you want to clear the chat history?')) {
            vscode.postMessage({
                type: 'chat.clear',
                payload: {}
            });
        }
    }

    /**
     * Clear all messages
     */
    function clearMessages() {
        messageHistory = [];
        if (chatMessages) {
            chatMessages.innerHTML = `
                <div class="welcome-message">
                    <div class="welcome-icon">🚀</div>
                    <h3>Welcome to RSWE-V1!</h3>
                    <p>I'm your AI software engineer powered by Claude Sonnet 4. I can help you with:</p>
                    <ul>
                        <li>🔍 Code analysis and debugging</li>
                        <li>🏗️ Architecture planning</li>
                        <li>📝 Documentation generation</li>
                        <li>🧪 Test case creation</li>
                        <li>🔧 Refactoring suggestions</li>
                    </ul>
                    <p>How can I help you today?</p>
                </div>
            `;
        }
    }

    /**
     * Import a chat session
     */
    function importSession(session) {
        if (!session || !session.messages) {
            return;
        }

        clearMessages();
        currentSessionId = session.id;

        for (const message of session.messages) {
            addMessageToUI(message);
        }
    }

    /**
     * Set up auto-resize for textarea
     */
    function setupAutoResize() {
        if (!messageInput) return;

        messageInput.addEventListener('input', () => {
            // Reset height to calculate new height
            messageInput.style.height = 'auto';
            
            // Set new height based on scroll height
            const newHeight = Math.min(messageInput.scrollHeight, 120);
            messageInput.style.height = newHeight + 'px';
        });
    }

    /**
     * Set up accessibility features
     */
    function setupAccessibility() {
        // Add ARIA labels
        if (messageInput) {
            messageInput.setAttribute('aria-label', 'Type your message here');
            messageInput.setAttribute('aria-describedby', 'input-help');
        }

        if (sendBtn) {
            sendBtn.setAttribute('aria-label', 'Send message');
        }

        if (chatMessages) {
            chatMessages.setAttribute('aria-label', 'Chat messages');
            chatMessages.setAttribute('role', 'log');
            chatMessages.setAttribute('aria-live', 'polite');
        }

        // Add keyboard navigation for buttons
        const buttons = document.querySelectorAll('button');
        buttons.forEach(button => {
            button.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    button.click();
                }
            });
        });
    }

    /**
     * Announce new messages to screen readers
     */
    function announceMessage(message) {
        const announcement = document.createElement('div');
        announcement.setAttribute('aria-live', 'polite');
        announcement.setAttribute('aria-atomic', 'true');
        announcement.className = 'sr-only';
        announcement.style.position = 'absolute';
        announcement.style.left = '-10000px';
        announcement.style.width = '1px';
        announcement.style.height = '1px';
        announcement.style.overflow = 'hidden';

        const roleText = message.role === 'user' ? 'You said' : 'RSWE responded';
        announcement.textContent = `${roleText}: ${message.content.substring(0, 100)}${message.content.length > 100 ? '...' : ''}`;

        document.body.appendChild(announcement);

        // Remove after announcement
        setTimeout(() => {
            document.body.removeChild(announcement);
        }, 1000);
    }

    /**
     * Show error message
     */
    function showError(errorMessage) {
        addMessageToUI({
            id: generateId(),
            role: 'assistant',
            content: `❌ Error: ${errorMessage}`,
            timestamp: new Date(),
            metadata: { error: errorMessage }
        });
    }

    /**
     * Format timestamp
     */
    function formatTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false 
        });
    }

    /**
     * Generate unique ID
     */
    function generateId() {
        return Math.random().toString(36).substring(2, 15) + 
               Math.random().toString(36).substring(2, 15);
    }

    // Initialize when DOM is loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

    // Handle page unload
    window.addEventListener('beforeunload', () => {
        // Save any pending state if needed
        console.log('RSWE Chat interface unloading');
    });

})();
