/* RSWE-V1 Chat - Minimal VS Code Dark Mode JavaScript */
/* Clean, efficient, streaming-enabled chat interface */

(function() {
    'use strict';

    // VS Code API reference
    const vscode = acquireVsCodeApi();

    // DOM elements
    let messageInput;
    let sendButton;
    let messagesContainer;
    let typingIndicator;
    let newChatBtn;
    let welcomeMessage;

    // State management
    let isTyping = false;
    let messageHistory = [];
    let currentSessionId = null;
    let currentStreamingMessage = null;

    /**
     * Initialize the chat interface
     */
    function initialize() {
        try {
            // Get DOM elements
            messageInput = document.getElementById('messageInput');
            sendButton = document.getElementById('sendButton');
            messagesContainer = document.getElementById('messagesContainer');
            typingIndicator = document.getElementById('typingIndicator');
            newChatBtn = document.getElementById('newChatBtn');
            welcomeMessage = document.getElementById('welcomeMessage');

            if (!messageInput || !sendButton || !messagesContainer) {
                console.error('Required DOM elements not found');
                return;
            }

            // Setup event listeners
            setupEventListeners();
            
            // Focus input
            messageInput.focus();

            console.log('RSWE Chat initialized successfully');
        } catch (error) {
            console.error('Failed to initialize chat:', error);
        }
    }

    /**
     * Setup all event listeners
     */
    function setupEventListeners() {
        // Message input events
        messageInput.addEventListener('input', handleInputChange);
        messageInput.addEventListener('keydown', handleKeyDown);

        // Send button
        sendButton.addEventListener('click', handleSendMessage);

        // New chat button
        if (newChatBtn) {
            newChatBtn.addEventListener('click', handleNewChat);
        }

        // VS Code message listener
        window.addEventListener('message', handleVSCodeMessage);

        // Auto-resize textarea
        messageInput.addEventListener('input', autoResizeTextarea);
    }

    /**
     * Handle input changes
     */
    function handleInputChange() {
        const hasText = messageInput.value.trim().length > 0;
        sendButton.disabled = !hasText || isTyping;
    }

    /**
     * Handle keyboard events
     */
    function handleKeyDown(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            handleSendMessage();
        }
    }

    /**
     * Auto-resize textarea
     */
    function autoResizeTextarea() {
        messageInput.style.height = 'auto';
        messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
    }

    /**
     * Handle sending a message
     */
    async function handleSendMessage() {
        try {
            const message = messageInput.value.trim();
            if (!message || isTyping) {
                return;
            }

            // Clear input
            messageInput.value = '';
            messageInput.style.height = 'auto';
            handleInputChange();

            // Hide welcome message if visible
            if (welcomeMessage && !welcomeMessage.classList.contains('hidden')) {
                welcomeMessage.classList.add('hidden');
            }

            // Add user message to UI
            const userMessage = {
                id: generateId(),
                role: 'user',
                content: message,
                timestamp: new Date()
            };

            addMessageToUI(userMessage);
            messageHistory.push(userMessage);

            // Show typing indicator
            showTypingIndicator();

            // Send to VS Code extension
            vscode.postMessage({
                type: 'chat.send',
                payload: { message: message }
            });

        } catch (error) {
            console.error('Failed to send message:', error);
            hideTypingIndicator();
        }
    }

    /**
     * Handle new chat
     */
    function handleNewChat() {
        try {
            // Clear messages
            messagesContainer.innerHTML = '';
            
            // Show welcome message
            const welcomeDiv = document.createElement('div');
            welcomeDiv.className = 'welcome-message';
            welcomeDiv.id = 'welcomeMessage';
            welcomeDiv.innerHTML = `
                <div class="welcome-title">Welcome to RSWE</div>
                <div class="welcome-subtitle">Your AI software engineer powered by Claude Sonnet 4. Ask me anything about your code.</div>
            `;
            messagesContainer.appendChild(welcomeDiv);
            welcomeMessage = welcomeDiv;

            // Clear history
            messageHistory = [];
            currentSessionId = null;
            currentStreamingMessage = null;

            // Hide typing indicator
            hideTypingIndicator();

            // Focus input
            messageInput.focus();

            // Send to VS Code extension
            vscode.postMessage({
                type: 'chat.new',
                payload: {}
            });

        } catch (error) {
            console.error('Failed to start new chat:', error);
        }
    }

    /**
     * Add message to UI with smooth animation
     */
    function addMessageToUI(message) {
        try {
            const messageEl = document.createElement('div');
            messageEl.className = `message ${message.role}`;
            messageEl.dataset.messageId = message.id;

            const avatar = document.createElement('div');
            avatar.className = 'message-avatar';
            avatar.textContent = message.role === 'user' ? 'U' : 'R';

            const content = document.createElement('div');
            content.className = 'message-content';

            const text = document.createElement('div');
            text.className = 'message-text';
            
            if (message.role === 'assistant') {
                // Render markdown for assistant messages
                text.innerHTML = renderMarkdown(message.content);
            } else {
                text.textContent = message.content;
            }

            content.appendChild(text);
            messageEl.appendChild(avatar);
            messageEl.appendChild(content);

            messagesContainer.appendChild(messageEl);
            scrollToBottom();

            return messageEl;
        } catch (error) {
            console.error('Failed to add message to UI:', error);
            return null;
        }
    }

    /**
     * Simple markdown renderer
     */
    function renderMarkdown(text) {
        if (!text) return '';

        return text
            // Code blocks
            .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
            // Inline code
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            // Bold
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            // Italic
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            // Headers
            .replace(/^### (.*$)/gm, '<h3>$1</h3>')
            .replace(/^## (.*$)/gm, '<h2>$1</h2>')
            .replace(/^# (.*$)/gm, '<h1>$1</h1>')
            // Lists
            .replace(/^\* (.*$)/gm, '<li>$1</li>')
            .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
            // Line breaks
            .replace(/\n/g, '<br>');
    }

    /**
     * Handle streaming message updates
     */
    function handleStreamingMessage(messageData) {
        try {
            if (!currentStreamingMessage) {
                // Create new streaming message
                const message = {
                    id: messageData.id || generateId(),
                    role: 'assistant',
                    content: messageData.content || '',
                    timestamp: new Date()
                };

                currentStreamingMessage = addMessageToUI(message);
                if (!currentStreamingMessage) return;
            }

            // Update content
            const textEl = currentStreamingMessage.querySelector('.message-text');
            if (textEl && messageData.content) {
                textEl.innerHTML = renderMarkdown(messageData.content);
                scrollToBottom();
            }

            // If streaming is complete
            if (messageData.done) {
                currentStreamingMessage = null;
                hideTypingIndicator();
                
                // Add to history
                messageHistory.push({
                    id: messageData.id,
                    role: 'assistant',
                    content: messageData.content,
                    timestamp: new Date()
                });
            }
        } catch (error) {
            console.error('Failed to handle streaming message:', error);
        }
    }

    /**
     * Show typing indicator
     */
    function showTypingIndicator() {
        if (typingIndicator) {
            typingIndicator.classList.remove('hidden');
            isTyping = true;
            handleInputChange();
        }
    }

    /**
     * Hide typing indicator
     */
    function hideTypingIndicator() {
        if (typingIndicator) {
            typingIndicator.classList.add('hidden');
            isTyping = false;
            handleInputChange();
        }
    }

    /**
     * Scroll to bottom of messages
     */
    function scrollToBottom() {
        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }

    /**
     * Generate unique ID
     */
    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    /**
     * Show error message
     */
    function showError(errorMessage) {
        try {
            const errorEl = document.createElement('div');
            errorEl.className = 'error-message';
            errorEl.textContent = errorMessage;
            messagesContainer.appendChild(errorEl);
            scrollToBottom();

            // Auto-remove after 5 seconds
            setTimeout(() => {
                if (errorEl.parentNode) {
                    errorEl.parentNode.removeChild(errorEl);
                }
            }, 5000);
        } catch (error) {
            console.error('Failed to show error:', error);
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
                    // Handle complete message
                    if (message.payload.message) {
                        hideTypingIndicator();
                        addMessageToUI(message.payload.message);
                        messageHistory.push(message.payload.message);
                    }
                    break;

                case 'chat.stream':
                    // Handle streaming message
                    handleStreamingMessage(message.payload);
                    break;

                case 'chat.typing':
                    if (message.payload.isTyping) {
                        showTypingIndicator();
                    } else {
                        hideTypingIndicator();
                    }
                    break;

                case 'chat.clear':
                    handleNewChat();
                    break;

                case 'chat.error':
                    hideTypingIndicator();
                    showError(message.payload.error);
                    break;

                default:
                    console.warn('Unknown message type:', message.type);
            }
        } catch (error) {
            console.error('Failed to handle VS Code message:', error);
        }
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

})();
