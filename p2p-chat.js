// ============================================
// P2P Чат на WebRTC - ИСПРАВЛЕННАЯ ВЕРСИЯ
// С автоматическим определением доступного сервера
// ============================================

// ---------- Глобальные переменные ----------
let peer = null;
let currentConnection = null;
let isConnected = false;
let localPeerId = null;
let reconnectAttempts = 0;
let connectionTimeout = null;

// DOM элементы
const connectionStatusDiv = document.getElementById('connectionStatus');
const localPeerIdSpan = document.getElementById('localPeerId');
const chatDiv = document.getElementById('chat');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const remotePeerIdInput = document.getElementById('remotePeerIdInput');
const connectBtn = document.getElementById('connectBtn');

// ---------- Настройки ----------
const PEER_CONFIGS = [
    // Вариант 1: Публичный PeerJS сервер (США)
    {
        host: '0.peerjs.com',
        port: 443,
        path: '/',
        secure: true,
        name: 'PeerJS Cloud (США)'
    },
    // Вариант 2: Альтернативный порт PeerJS
    {
        host: '0.peerjs.com',
        port: 9000,
        path: '/',
        secure: false,
        name: 'PeerJS Cloud (порт 9000)'
    },
    // Вариант 3: Европейский сервер
    {
        host: 'eu0.peerjs.com',
        port: 443,
        path: '/',
        secure: true,
        name: 'PeerJS Cloud (Европа)'
    }
];

let currentConfigIndex = 0;

// STUN серверы для WebRTC
const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        { urls: 'stun:stun.stunprotocol.org:3478' }
    ]
};

// ---------- Вспомогательные функции ----------

function addMessage(text, type = 'system') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;

    const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

    if (type === 'system') {
        messageDiv.innerHTML = `<div style="background:#f1f3f4; color:#f56368; font-style:italic; padding:6px 12px; border-radius:20px; display:inline-block;">📢 ${escapeHtml(text)}</div>`;
    } else if (type === 'me') {
        messageDiv.innerHTML = `
            <div style="background:linear-gradient(135deg, #667eea 0%, #764ba2 100%); color:white; display:inline-block; padding:10px 16px; border-radius:20px 20px 4px 20px; max-width:70%; word-wrap:break-word;">${escapeHtml(text)}</div>
            <div style="font-size:10px; color:#9ca3af; margin-top:4px;">${time}</div>
        `;
        messageDiv.style.textAlign = 'right';
    } else if (type === 'peer') {
        messageDiv.innerHTML = `
            <div style="background:#e8e8e8; color:#202124; display:inline-block; padding:10px 16px; border-radius:20px 20px 20px 4px; max-width:70%; word-wrap:break-word;">${escapeHtml(text)}</div>
            <div style="font-size:10px; color:#9ca3af; margin-top:4px;">${time}</div>
        `;
        messageDiv.style.textAlign = 'left';
    }

    chatDiv.appendChild(messageDiv);
    chatDiv.scrollTop = chatDiv.scrollHeight;
}

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function updateUI(connected) {
    isConnected = connected;
    if (connected) {
        connectionStatusDiv.innerHTML = '✅ P2P соединение установлено!';
        connectionStatusDiv.style.color = '#16a34a';
        messageInput.disabled = false;
        sendBtn.disabled = false;
        messageInput.placeholder = '💬 Введите сообщение...';
        messageInput.focus();
        connectBtn.disabled = false;
        remotePeerIdInput.disabled = false;
    } else {
        connectionStatusDiv.innerHTML = '⭕ Ожидание P2P соединения...';
        connectionStatusDiv.style.color = '#f59e0b';
        messageInput.disabled = true;
        sendBtn.disabled = true;
        messageInput.placeholder = '💬 Поле заблокировано до установки соединения';
        if (!localPeerId) {
            connectBtn.disabled = true;
            remotePeerIdInput.disabled = true;
        } else {
            connectBtn.disabled = false;
            remotePeerIdInput.disabled = false;
        }
    }
}

function setupDataConnection(conn) {
    if (currentConnection && currentConnection.open) {
        currentConnection.close();
    }

    currentConnection = conn;

    conn.on('open', () => {
        addMessage('✨ P2P соединение установлено! Можете общаться.', 'system');
        updateUI(true);
    });

    conn.on('data', (data) => {
        addMessage(data, 'peer');
    });

    conn.on('close', () => {
        addMessage('❌ Соединение разорвано собеседником.', 'system');
        updateUI(false);
        currentConnection = null;
    });

    conn.on('error', (err) => {
        console.error('Ошибка соединения:', err);
        addMessage(`⚠️ Ошибка: ${err.message || 'Неизвестная ошибка'}`, 'system');
        updateUI(false);
        currentConnection = null;
    });
}

function sendMessage() {
    if (!isConnected || !currentConnection || currentConnection.open === false) {
        addMessage('⚠️ Нет активного P2P соединения. Сначала подключитесь к собеседнику.', 'system');
        return;
    }

    const message = messageInput.value.trim();
    if (message === '') return;

    currentConnection.send(message);
    addMessage(message, 'me');
    messageInput.value = '';
    messageInput.focus();
}

function connectToPeer(remoteId) {
    if (!remoteId || remoteId.trim() === '') {
        addMessage('⚠️ Введите Peer ID собеседника', 'system');
        return;
    }

    remoteId = remoteId.trim();

    if (remoteId === localPeerId) {
        addMessage('⚠️ Нельзя подключиться к самому себе!', 'system');
        return;
    }

    if (!peer) {
        addMessage('⚠️ P2P ещё не инициализирован. Подождите...', 'system');
        return;
    }

    addMessage(`🔍 Подключение к Peer: ${remoteId}...`, 'system');

    const conn = peer.connect(remoteId, { reliable: true });
    setupDataConnection(conn);
}

function copyPeerId() {
    if (!localPeerId) return;

    navigator.clipboard.writeText(localPeerId).then(() => {
        addMessage('📋 Peer ID скопирован!', 'system');
        const originalText = localPeerIdSpan.textContent;
        localPeerIdSpan.textContent = '✓ Скопировано!';
        setTimeout(() => {
            localPeerIdSpan.textContent = originalText;
        }, 1500);
    }).catch(() => {
        addMessage('❌ Нажмите Ctrl+C для копирования', 'system');
    });
}

// ---------- Инициализация Peer с автоматическим переключением серверов ----------

function initPeerWithConfig(configIndex) {
    if (connectionTimeout) clearTimeout(connectionTimeout);

    const config = PEER_CONFIGS[configIndex];
    connectionStatusDiv.innerHTML = `🔄 Подключение к ${config.name}...`;
    connectionStatusDiv.style.color = '#f59e0b';

    addMessage(`🔄 Попытка подключения к signalling-серверу (${config.name})...`, 'system');

    try {
        peer = new Peer({
            host: config.host,
            port: config.port,
            path: config.path,
            secure: config.secure,
            config: ICE_SERVERS,
            debug: 2  // Включить отладку для консоли
        });

        // Таймаут на подключение (10 секунд)
        connectionTimeout = setTimeout(() => {
            if (peer && !localPeerId) {
                addMessage(`⏰ Таймаут подключения к ${config.name}. Пробуем следующий сервер...`, 'system');
                peer.destroy();
                tryNextServer();
            }
        }, 10000);

        peer.on('open', (id) => {
            clearTimeout(connectionTimeout);
            localPeerId = id;
            localPeerIdSpan.textContent = id;
            connectionStatusDiv.innerHTML = '🟢 Ожидание P2P соединения...';
            connectionStatusDiv.style.color = '#16a34a';
            addMessage(`✅ Подключено к signalling-серверу (${config.name})!`, 'system');
            addMessage(`🆔 Ваш Peer ID: ${id}`, 'system');
            addMessage('💡 Дайте этот ID собеседнику или введите его ID в поле ниже.', 'system');
            updateUI(false);
            reconnectAttempts = 0;
        });

        peer.on('connection', (conn) => {
            addMessage(`📞 Входящий запрос от ${conn.peer}...`, 'system');
            setupDataConnection(conn);
        });

        peer.on('error', (err) => {
            console.error('PeerJS ошибка:', err);

            if (!localPeerId) {
                // Если ещё не подключились - пробуем следующий сервер
                addMessage(`⚠️ Ошибка на ${config.name}: ${err.type || err.message}`, 'system');
                peer.destroy();
                tryNextServer();
            } else {
                // Если уже подключены, просто показываем ошибку
                let errorMsg = '';
                switch (err.type) {
                    case 'peer-unavailable':
                        errorMsg = 'Собеседник недоступен. Проверьте ID.';
                        break;
                    case 'network':
                        errorMsg = 'Сетевая ошибка. Проверьте интернет.';
                        break;
                    default:
                        errorMsg = err.message || 'Ошибка соединения';
                }
                addMessage(`⚠️ ${errorMsg}`, 'system');
            }
        });

        peer.on('disconnected', () => {
            addMessage('⚠️ Соединение с signalling-сервером потеряно. Переподключение...', 'system');
            connectionStatusDiv.innerHTML = '🔄 Переподключение...';
            connectionStatusDiv.style.color = '#f59e0b';
            peer.reconnect();
        });

        peer.on('close', () => {
            if (localPeerId) {
                addMessage('🔌 Соединение с signalling-сервером закрыто.', 'system');
                localPeerId = null;
                localPeerIdSpan.textContent = '-';
                connectionStatusDiv.innerHTML = '⚫ Отключено';
                connectionStatusDiv.style.color = '#6c757d';
            }
        });

    } catch (error) {
        console.error('Ошибка создания Peer:', error);
        addMessage(`❌ Не удалось создать соединение: ${error.message}`, 'system');
        tryNextServer();
    }
}

function tryNextServer() {
    currentConfigIndex++;

    if (currentConfigIndex < PEER_CONFIGS.length) {
        addMessage(`🔄 Переключение на следующий сервер...`, 'system');
        setTimeout(() => {
            initPeerWithConfig(currentConfigIndex);
        }, 1000);
    } else {
        // Все серверы перепробованы - показываем локальную альтернативу
        connectionStatusDiv.innerHTML = '⚠️ Нет доступа к публичным серверам';
        connectionStatusDiv.style.color = '#dc2626';
        addMessage('❌ Не удалось подключиться ни к одному signalling-серверу.', 'system');
        addMessage('💡 Решение: запустите локальный сервер (см. инструкцию в консоли)', 'system');

        // Предлагаем локальный вариант
        console.log('\n=== АЛЬТЕРНАТИВНЫЙ ВАРИАНТ ===');
        console.log('1. Установите Node.js');
        console.log('2. Запустите: npx peerjs --port 9000');
        console.log('3. Или используйте Python сервер из предыдущего сообщения');
        console.log('================================\n');

        // Показываем кнопку для ручного переподключения
        const retryBtn = document.createElement('button');
        retryBtn.textContent = '🔄 Повторить подключение';
        retryBtn.style.cssText = 'margin-top:10px; padding:8px; background:#667eea; color:white; border:none; border-radius:8px; cursor:pointer;';
        retryBtn.onclick = () => {
            currentConfigIndex = 0;
            retryBtn.remove();
            initPeerWithConfig(0);
        };
        document.querySelector('.status-card').appendChild(retryBtn);
    }
}

// ---------- Обработчики событий ----------

sendBtn.addEventListener('click', sendMessage);

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

connectBtn.addEventListener('click', () => {
    connectToPeer(remotePeerIdInput.value.trim());
});

remotePeerIdInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        connectToPeer(remotePeerIdInput.value.trim());
    }
});

localPeerIdSpan.addEventListener('click', copyPeerId);

// ---------- ЗАПУСК ----------
addMessage('🚀 Запуск P2P чата...', 'system');
addMessage('🔍 Поиск доступного signalling-сервера...', 'system');
initPeerWithConfig(0);