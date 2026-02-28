/**
 * OpenClaw Mobile Chat Application
 * 移动端聊天界�?- 连接 OpenClaw Gateway
 */

(function() {
    'use strict';

    // ==========================================
    // Configuration & State
    // ==========================================

    const CONFIG = {
        DEFAULT_GATEWAY: 'wss://smallti.com:88',
        RECONNECT_DELAY: 3000,
        MAX_RECONNECT_ATTEMPTS: 5,
        MESSAGE_HISTORY_KEY: 'openclaw_message_history',
        SETTINGS_KEY: 'openclaw_settings',
        MAX_HISTORY_MESSAGES: 100
    };

    const state = {
        ws: null,
        connected: false,
        connecting: false,
        reconnectAttempts: 0,
        requestId: 0,
        pendingMessages: new Map(),
        currentStreamMessage: null,
        settings: {
            gatewayUrl: CONFIG.DEFAULT_GATEWAY,
            authToken: '',
            deviceName: 'Mobile Web Client',
            autoConnect: true,
            soundEnabled: true
        },
        messages: [],
        pullState: {
            pulling: false,
            startY: 0,
            pullDistance: 0
        }
    };

    // ==========================================
    // DOM Elements
    // ==========================================

    const elements = {
        app: document.getElementById('app'),
        messagesContainer: document.getElementById('messages-container'),
        messages: document.getElementById('messages'),
        messageInput: document.getElementById('message-input'),
        sendBtn: document.getElementById('send-btn'),
        connectionStatus: document.getElementById('connection-status'),
        settingsBtn: document.getElementById('settings-btn'),
        settingsModal: document.getElementById('settings-modal'),
        closeSettings: document.getElementById('close-settings'),
        gatewayUrl: document.getElementById('gateway-url'),
        authToken: document.getElementById('auth-token'),
        deviceName: document.getElementById('device-name'),
        autoConnect: document.getElementById('auto-connect'),
        soundEnabled: document.getElementById('sound-enabled'),
        saveSettings: document.getElementById('save-settings'),
        clearHistory: document.getElementById('clear-history'),
        typingIndicator: document.getElementById('typing-indicator'),
        pullIndicator: document.getElementById('pull-indicator'),
        toast: document.getElementById('toast'),
        imageModal: document.getElementById('image-modal'),
        previewImage: document.getElementById('preview-image')
    };

    // ==========================================
    // Initialization
    // ==========================================

    function init() {
        loadSettings();
        loadMessageHistory();
        setupEventListeners();
        setupMarkdown();
        setupPullToRefresh();

        if (state.settings.autoConnect) {
            connect();
        }

        // Register Service Worker for PWA
        registerServiceWorker();
    }

    // ==========================================
    // Settings Management
    // ==========================================

    function loadSettings() {
        try {
            const saved = localStorage.getItem(CONFIG.SETTINGS_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                state.settings = { ...state.settings, ...parsed };
            }
        } catch (e) {
            console.error('Failed to load settings:', e);
        }

        // Update UI
        elements.gatewayUrl.value = state.settings.gatewayUrl;
        elements.authToken.value = state.settings.authToken;
        elements.deviceName.value = state.settings.deviceName;
        elements.autoConnect.checked = state.settings.autoConnect;
        elements.soundEnabled.checked = state.settings.soundEnabled;
    }

    function saveSettings() {
        state.settings.gatewayUrl = elements.gatewayUrl.value || CONFIG.DEFAULT_GATEWAY;
        state.settings.authToken = elements.authToken.value;
        state.settings.deviceName = elements.deviceName.value || 'Mobile Web Client';
        state.settings.autoConnect = elements.autoConnect.checked;
        state.settings.soundEnabled = elements.soundEnabled.checked;

        try {
            localStorage.setItem(CONFIG.SETTINGS_KEY, JSON.stringify(state.settings));
        } catch (e) {
            console.error('Failed to save settings:', e);
        }
    }

    // ==========================================
    // Message History
    // ==========================================

    function loadMessageHistory() {
        try {
            const saved = localStorage.getItem(CONFIG.MESSAGE_HISTORY_KEY);
            if (saved) {
                state.messages = JSON.parse(saved);
                renderMessages();
            }
        } catch (e) {
            console.error('Failed to load message history:', e);
        }
    }

    function saveMessageHistory() {
        try {
            const toSave = state.messages.slice(-CONFIG.MAX_HISTORY_MESSAGES);
            localStorage.setItem(CONFIG.MESSAGE_HISTORY_KEY, JSON.stringify(toSave));
        } catch (e) {
            console.error('Failed to save message history:', e);
        }
    }

    function clearMessageHistory() {
        state.messages = [];
        localStorage.removeItem(CONFIG.MESSAGE_HISTORY_KEY);
        renderMessages();
        showToast('历史消息已清�?, 'success');
    }

    // ==========================================
    // WebSocket Connection
    // ==========================================

    function connect() {
        if (state.connected || state.connecting) return;

        state.connecting = true;
        updateConnectionStatus('connecting');

        try {
            state.ws = new WebSocket(state.settings.gatewayUrl);

            state.ws.onopen = handleOpen;
            state.ws.onclose = handleClose;
            state.ws.onerror = handleError;
            state.ws.onmessage = handleMessage;

        } catch (e) {
            console.error('WebSocket connection failed:', e);
            showToast('连接失败: ' + e.message, 'error');
            state.connecting = false;
            updateConnectionStatus('disconnected');
        }
    }

    function disconnect() {
        if (state.ws) {
            state.ws.close();
            state.ws = null;
        }
        state.connected = false;
        state.connecting = false;
        updateConnectionStatus('disconnected');
    }

    function handleOpen() {
        console.log('WebSocket connected');
        state.connecting = false;

        // Send connect request
        const connectParams = {
            device: {
                name: state.settings.deviceName,
                type: 'mobile-web',
                version: '1.0.0'
            }
        };

        if (state.settings.authToken) {
            connectParams.auth = { token: state.settings.authToken };
        }

        sendRequest('connect', connectParams);
    }

    function handleClose(event) {
        console.log('WebSocket closed:', event.code, event.reason);
        state.connected = false;
        state.connecting = false;
        updateConnectionStatus('disconnected');

        // Auto reconnect
        if (state.reconnectAttempts < CONFIG.MAX_RECONNECT_ATTEMPTS) {
            state.reconnectAttempts++;
            console.log(`Reconnecting in ${CONFIG.RECONNECT_DELAY}ms (attempt ${state.reconnectAttempts})`);
            setTimeout(connect, CONFIG.RECONNECT_DELAY);
        } else {
            showToast('连接已断开，请手动重连', 'error');
        }
    }

    function handleError(error) {
        console.error('WebSocket error:', error);
        state.connecting = false;
        updateConnectionStatus('disconnected');
        showToast('连接错误', 'error');
    }

    function handleMessage(event) {
        try {
            const data = JSON.parse(event.data);
            console.log('Received:', data);

            switch (data.type) {
                case 'res':
                    handleResponse(data);
                    break;
                case 'event':
                    handleEvent(data);
                    break;
                case 'stream':
                    handleStream(data);
                    break;
                default:
                    console.log('Unknown message type:', data.type);
            }
        } catch (e) {
            console.error('Failed to parse message:', e);
        }
    }

    // ==========================================
    // Protocol Handlers
    // ==========================================

    function sendRequest(method, params = {}) {
        if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
            showToast('未连接到服务�?, 'error');
            return null;
        }

        const id = String(++state.requestId);
        const request = {
            type: 'req',
            id: id,
            method: method,
            params: params
        };

        console.log('Sending:', request);
        state.ws.send(JSON.stringify(request));

        return new Promise((resolve, reject) => {
            state.pendingMessages.set(id, { resolve, reject });

            // Timeout after 30 seconds
            setTimeout(() => {
                if (state.pendingMessages.has(id)) {
                    state.pendingMessages.delete(id);
                    reject(new Error('Request timeout'));
                }
            }, 30000);
        });
    }

    function handleResponse(data) {
        const pending = state.pendingMessages.get(data.id);
        if (pending) {
            state.pendingMessages.delete(data.id);

            if (data.ok) {
                pending.resolve(data.payload);

                // Handle connect response
                if (data.id === '1') {
                    state.connected = true;
                    state.reconnectAttempts = 0;
                    updateConnectionStatus('connected');
                    showToast('已连接到 OpenClaw', 'success');
                }
            } else {
                pending.reject(new Error(data.error || 'Unknown error'));

                if (data.id === '1') {
                    showToast('认证失败: ' + (data.error || 'Unknown error'), 'error');
                    disconnect();
                }
            }
        }
    }

    function handleEvent(data) {
        console.log('Event:', data.event, data.payload);

        switch (data.event) {
            case 'message':
            case 'message.received':
                handleIncomingMessage(data.payload);
                break;
            case 'message.stream':
                handleStreamEvent(data.payload);
                break;
            case 'typing':
                showTypingIndicator(data.payload?.typing ?? true);
                break;
            default:
                console.log('Unhandled event:', data.event);
        }
    }

    function handleStream(data) {
        // Handle streaming response
        if (data.done) {
            // Stream complete
            if (state.currentStreamMessage) {
                finalizeStreamMessage();
            }
        } else if (data.content) {
            appendToStreamMessage(data.content);
        }
    }

    function handleIncomingMessage(payload) {
        hideTypingIndicator();

        const message = {
            id: payload.id || Date.now().toString(),
            role: 'ai',
            content: payload.content || payload.text || '',
            timestamp: payload.timestamp || Date.now()
        };

        addMessage(message);
        playNotificationSound();
    }

    function handleStreamEvent(payload) {
        if (payload.done) {
            finalizeStreamMessage();
            hideTypingIndicator();
        } else if (payload.content || payload.text) {
            const content = payload.content || payload.text;
            if (state.currentStreamMessage) {
                appendToStreamMessage(content);
            } else {
                startStreamMessage(content);
            }
        }
    }

    // ==========================================
    // Message Handling
    // ==========================================

    function sendMessage(text) {
        if (!text.trim() || !state.connected) return;

        const message = {
            id: Date.now().toString(),
            role: 'user',
            content: text.trim(),
            timestamp: Date.now()
        };

        addMessage(message);

        // Send to gateway
        sendRequest('send', {
            idempotencyKey: message.id,
            content: message.content,
            conversationId: 'main'
        }).catch(err => {
            console.error('Failed to send message:', err);
            showToast('发送失�? ' + err.message, 'error');
        });

        // Clear input
        elements.messageInput.value = '';
        adjustTextareaHeight();
        updateSendButton();
    }

    function addMessage(message) {
        state.messages.push(message);
        saveMessageHistory();
        renderMessage(message);
        scrollToBottom();
    }

    function startStreamMessage(content) {
        const message = {
            id: 'stream-' + Date.now(),
            role: 'ai',
            content: content,
            timestamp: Date.now(),
            streaming: true
        };

        state.currentStreamMessage = message;
        state.messages.push(message);
        renderMessage(message);
        scrollToBottom();
    }

    function appendToStreamMessage(content) {
        if (state.currentStreamMessage) {
            state.currentStreamMessage.content += content;
            updateStreamingMessage();
        }
    }

    function finalizeStreamMessage() {
        if (state.currentStreamMessage) {
            state.currentStreamMessage.streaming = false;
            saveMessageHistory();
            updateStreamingMessage();
            state.currentStreamMessage = null;
            playNotificationSound();
        }
    }

    // ==========================================
    // UI Rendering
    // ==========================================

    function renderMessages() {
        elements.messages.innerHTML = '';

        // Add welcome message if no history
        if (state.messages.length === 0) {
            renderWelcomeMessage();
            return;
        }

        state.messages.forEach(msg => renderMessage(msg));
        scrollToBottom();
    }

    function renderWelcomeMessage() {
        const html = `
            <div class="message ai-message">
                <div class="message-avatar">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                    </svg>
                </div>
                <div class="message-content">
                    <div class="message-text">
                        <p>👋 你好！我�?OpenClaw AI 助手�?/p>
                        <p>请先在设置中配置 Gateway 地址，然后点击连接按钮开始对话�?/p>
                    </div>
                </div>
            </div>
        `;
        elements.messages.innerHTML = html;
    }

    function renderMessage(message) {
        const div = document.createElement('div');
        div.className = `message ${message.role === 'user' ? 'user-message' : 'ai-message'}`;
        div.dataset.id = message.id;

        const avatarHtml = message.role === 'user'
            ? `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                 <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
               </svg>`
            : `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                 <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
               </svg>`;

        const renderedContent = renderMarkdown(message.content);

        div.innerHTML = `
            <div class="message-avatar">${avatarHtml}</div>
            <div class="message-content">
                <div class="message-text">${renderedContent}</div>
                <div class="message-time">${formatTime(message.timestamp)}</div>
            </div>
        `;

        // Setup image click handlers
        div.querySelectorAll('.message-text img').forEach(img => {
            img.addEventListener('click', () => showImagePreview(img.src));
        });

        // Apply code highlighting
        div.querySelectorAll('pre code').forEach(block => {
            hljs.highlightElement(block);
        });

        elements.messages.appendChild(div);
    }

    function updateStreamingMessage() {
        const messageEl = elements.messages.querySelector(`[data-id="${state.currentStreamMessage.id}"]`);
        if (messageEl) {
            const textEl = messageEl.querySelector('.message-text');
            textEl.innerHTML = renderMarkdown(state.currentStreamMessage.content);

            // Apply code highlighting
            textEl.querySelectorAll('pre code').forEach(block => {
                hljs.highlightElement(block);
            });

            scrollToBottom();
        }
    }

    // ==========================================
    // Markdown Rendering
    // ==========================================

    function setupMarkdown() {
        if (typeof marked !== 'undefined') {
            marked.setOptions({
                breaks: true,
                gfm: true,
                headerIds: false,
                mangle: false
            });
        }
    }

    function renderMarkdown(text) {
        if (!text) return '';

        // Basic sanitization
        let sanitized = text
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // Use marked.js if available
        if (typeof marked !== 'undefined') {
            try {
                // Restore markdown characters that were escaped
                sanitized = text;
                return marked.parse(sanitized);
            } catch (e) {
                console.error('Markdown parse error:', e);
            }
        }

        // Fallback: basic formatting
        return sanitized
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>');
    }

    // ==========================================
    // UI Helpers
    // ==========================================

    function updateConnectionStatus(status) {
        const el = elements.connectionStatus;
        el.className = `connection-status ${status}`;

        const textEl = el.querySelector('.status-text');
        switch (status) {
            case 'connected':
                textEl.textContent = '已连�?;
                break;
            case 'connecting':
                textEl.textContent = '连接�?..';
                break;
            default:
                textEl.textContent = '未连�?;
        }
    }

    function showTypingIndicator(show = true) {
        elements.typingIndicator.classList.toggle('hidden', !show);
        if (show) scrollToBottom();
    }

    function hideTypingIndicator() {
        elements.typingIndicator.classList.add('hidden');
    }

    function scrollToBottom() {
        requestAnimationFrame(() => {
            elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
        });
    }

    function showToast(message, type = 'info') {
        const toast = elements.toast;
        toast.querySelector('.toast-message').textContent = message;
        toast.className = `toast ${type}`;

        // Force reflow
        toast.offsetHeight;

        toast.classList.remove('hidden');

        setTimeout(() => {
            toast.classList.add('hidden');
        }, 3000);
    }

    function showImagePreview(src) {
        elements.previewImage.src = src;
        elements.imageModal.classList.remove('hidden');
    }

    function hideImagePreview() {
        elements.imageModal.classList.add('hidden');
        elements.previewImage.src = '';
    }

    function formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();

        if (isToday) {
            return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        } else {
            return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) +
                   ' ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        }
    }

    function playNotificationSound() {
        if (!state.settings.soundEnabled) return;

        // Create a simple notification sound
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.frequency.value = 800;
            oscillator.type = 'sine';

            gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.2);
        } catch (e) {
            // Audio not supported
        }
    }

    // ==========================================
    // Input Handling
    // ==========================================

    function adjustTextareaHeight() {
        const textarea = elements.messageInput;
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }

    function updateSendButton() {
        const hasContent = elements.messageInput.value.trim().length > 0;
        const canSend = hasContent && state.connected;
        elements.sendBtn.disabled = !canSend;
    }

    // ==========================================
    // Pull to Refresh
    // ==========================================

    function setupPullToRefresh() {
        const container = elements.messagesContainer;
        let startY = 0;
        let pulling = false;

        container.addEventListener('touchstart', (e) => {
            if (container.scrollTop === 0) {
                startY = e.touches[0].clientY;
                pulling = true;
            }
        }, { passive: true });

        container.addEventListener('touchmove', (e) => {
            if (!pulling) return;

            const currentY = e.touches[0].clientY;
            const distance = currentY - startY;

            if (distance > 0 && container.scrollTop === 0) {
                const pullDistance = Math.min(distance * 0.5, 80);
                elements.pullIndicator.style.transform = `translateY(${pullDistance - 60}px)`;

                if (pullDistance > 60) {
                    elements.pullIndicator.classList.add('ready');
                } else {
                    elements.pullIndicator.classList.remove('ready');
                }
            }
        }, { passive: true });

        container.addEventListener('touchend', () => {
            if (elements.pullIndicator.classList.contains('ready')) {
                // Trigger refresh
                showToast('刷新历史消息', 'info');
                loadMessageHistory();
            }

            elements.pullIndicator.style.transform = '';
            elements.pullIndicator.classList.remove('ready');
            pulling = false;
        }, { passive: true });
    }

    // ==========================================
    // Event Listeners
    // ==========================================

    function setupEventListeners() {
        // Message input
        elements.messageInput.addEventListener('input', () => {
            adjustTextareaHeight();
            updateSendButton();
        });

        elements.messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!elements.sendBtn.disabled) {
                    sendMessage(elements.messageInput.value);
                }
            }
        });

        // Send button
        elements.sendBtn.addEventListener('click', () => {
            sendMessage(elements.messageInput.value);
        });

        // Settings
        elements.settingsBtn.addEventListener('click', () => {
            elements.settingsModal.classList.remove('hidden');
        });

        elements.closeSettings.addEventListener('click', () => {
            elements.settingsModal.classList.add('hidden');
        });

        elements.settingsModal.querySelector('.modal-backdrop').addEventListener('click', () => {
            elements.settingsModal.classList.add('hidden');
        });

        elements.saveSettings.addEventListener('click', () => {
            saveSettings();
            elements.settingsModal.classList.add('hidden');

            // Reconnect with new settings
            disconnect();
            setTimeout(connect, 500);
        });

        elements.clearHistory.addEventListener('click', () => {
            if (confirm('确定要清空所有历史消息吗�?)) {
                clearMessageHistory();
            }
        });

        // Image preview modal
        elements.imageModal.querySelector('.modal-backdrop').addEventListener('click', hideImagePreview);
        elements.imageModal.querySelector('.close-image-btn').addEventListener('click', hideImagePreview);

        // Connection status click to reconnect
        elements.connectionStatus.addEventListener('click', () => {
            if (!state.connected && !state.connecting) {
                connect();
            }
        });

        // Handle visibility change
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && !state.connected && state.settings.autoConnect) {
                connect();
            }
        });

        // Handle online/offline
        window.addEventListener('online', () => {
            showToast('网络已恢�?, 'success');
            if (!state.connected && state.settings.autoConnect) {
                connect();
            }
        });

        window.addEventListener('offline', () => {
            showToast('网络已断开', 'error');
        });

        // Prevent zoom on double tap
        let lastTouchEnd = 0;
        document.addEventListener('touchend', (e) => {
            const now = Date.now();
            if (now - lastTouchEnd <= 300) {
                e.preventDefault();
            }
            lastTouchEnd = now;
        }, false);
    }

    // ==========================================
    // Service Worker (PWA)
    // ==========================================

    function registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js')
                .then(registration => {
                    console.log('Service Worker registered:', registration.scope);
                })
                .catch(error => {
                    console.log('Service Worker registration failed:', error);
                });
        }
    }

    // ==========================================
    // Start Application
    // ==========================================

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
