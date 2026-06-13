// ============================================
// P2P Чат - Полностью локальная версия
// Использует WebSocket signalling + WebRTC
// ============================================

// ---------- Глобальные переменные ----------
let ws = null;
let peerConnection = null;
let dataChannel = null;
let myPeerId = null;
let remotePeerId = null;
let isP2PConnected = false;

// DOM элементы
const myPeerIdBox = document.getElementById('myPeerIdBox');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const remotePeerIdInput = document.getElementById('remotePeerId');
const connectBtn = document.getElementById('connectBtn');

// WebRTC конфигурация (только STUN для локальной сети)
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// ---------- Вспомогательные функции ----------

function addMessage(text, type = 'system') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;

    const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

    if (type === 'system') {
        messageDiv.innerHTML = `<div class="bubble">📢 ${escapeHtml(text)}</div>`;
    } else if (type === 'me') {
        messageDiv.innerHTML = `
            <div class="bubble">${escapeHtml(text)}</div>
            <div class="message-time">${time}</div>
        `;
    } else if (type === 'peer') {
        messageDiv.innerHTML = `
            <div class="bubble">${escapeHtml(text)}</div>
            <div class="message-time">${time}</div>
        `;
    }

    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
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

function updateStatus(status, isConnected = false) {
    statusText.textContent = status;

    if (isConnected) {
        statusIndicator.className = 'connection-status status-connected';
    } else if (status.includes('Ожидание') || status.includes('Подключение')) {
        statusIndicator.className = 'connection-status status-connecting';
    } else {
        statusIndicator.className = 'connection-status status-disconnected';
    }
}

function enableChat(enabled) {
    if (enabled && isP2PConnected) {
        messageInput.disabled = false;
        sendBtn.disabled = false;
        messageInput.placeholder = '💬 Введите сообщение...';
        messageInput.focus();
    } else {
        messageInput.disabled = true;
        sendBtn.disabled = true;
        messageInput.placeholder = '💬 Поле заблокировано до установки P2P';
    }
}

// ---------- WebRTC функции ----------

async function createPeerConnection(isInitiator, targetPeerId) {
    if (peerConnection) {
        peerConnection.close();
    }

    peerConnection = new RTCPeerConnection(rtcConfig);

    // Сбор ICE кандидатов
    peerConnection.onicecandidate = (event) => {
        if (event.candidate && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'ice-candidate',
                targetPeerId: targetPeerId,
                data: event.candidate
            }));
        }
    };

    peerConnection.oniceconnectionstatechange = () => {
        console.log('ICE состояние:', peerConnection.iceConnectionState);
        if (peerConnection.iceConnectionState === 'connected') {
            addMessage('✅ P2P соединение установлено!', 'system');
            isP2PConnected = true;
            updateStatus('P2P активен', true);
            enableChat(true);
        } else if (peerConnection.iceConnectionState === 'disconnected') {
            addMessage('❌ P2P соединение разорвано', 'system');
            isP2PConnected = false;
            updateStatus('Ожидание P2P', false);
            enableChat(false);
        }
    };

    if (isInitiator) {
        // Создаём Data Channel
        dataChannel = peerConnection.createDataChannel('chat');
        setupDataChannel();

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        ws.send(JSON.stringify({
            type: 'offer',
            targetPeerId: targetPeerId,
            data: offer
        }));
    } else {
        // Принимаем Data Channel
        peerConnection.ondatachannel = (event) => {
            dataChannel = event.channel;
            setupDataChannel();
        };
    }
}

function setupDataChannel() {
    if (!dataChannel) return;

    dataChannel.onopen = () => {
        addMessage('🔗 Data Channel открыт!', 'system');
        isP2PConnected = true;
        updateStatus('P2P активен', true);
        enableChat(true);
    };

    dataChannel.onclose = () => {
        addMessage('🔌 Data Channel закрыт', 'system');
        isP2PConnected = false;
        updateStatus('Ожидание P2P', false);
        enableChat(false);
    };

    dataChannel.onmessage = (event) => {
        addMessage(event.data, 'peer');
    };

    dataChannel.onerror = (error) => {
        console.error('Data Channel ошибка:', error);
        addMessage('⚠️ Ошибка канала передачи', 'system');
    };
}

async function handleOffer(offer, fromPeerId) {
    await createPeerConnection(false, fromPeerId);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    ws.send(JSON.stringify({
        type: 'answer',
        targetPeerId: fromPeerId,
        data: answer
    }));
}

async function handleAnswer(answer, fromPeerId) {
    if (peerConnection) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }
}

async function handleIceCandidate(candidate, fromPeerId) {
    if (peerConnection) {
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
            console.error('Ошибка добавления ICE кандидата:', e);
        }
    }
}

// ---------- WebSocket подключение ----------

function connectWebSocket() {
    updateStatus('Подключение к серверу...', false);

    ws = new WebSocket('ws://localhost:8080');

    ws.onopen = () => {
        console.log('WebSocket подключён');
        updateStatus('Ожидание Peer ID...', false);
        addMessage('✅ Подключено к signalling серверу', 'system');
    };

    ws.onmessage = async (event) => {
        try {
            const data = JSON.parse(event.data);

            switch (data.type) {
                case 'init':
                    myPeerId = data.peerId;
                    myPeerIdBox.textContent = myPeerId;
                    updateStatus('Готов к P2P соединению', false);
                    addMessage(`🆔 Ваш Peer ID: ${myPeerId}`, 'system');
                    addMessage('💡 Дайте этот ID собеседнику для подключения', 'system');
                    break;

                case 'offer':
                    addMessage(`📞 Получен запрос на соединение от ${data.from}`, 'system');
                    await handleOffer(data.data, data.from);
                    break;

                case 'answer':
                    await handleAnswer(data.data, data.from);
                    break;

                case 'ice-candidate':
                    await handleIceCandidate(data.data, data.from);
                    break;

                case 'error':
                    addMessage(`⚠️ ${data.message}`, 'system');
                    break;
            }
        } catch (err) {
            console.error('Ошибка обработки сообщения:', err);
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocket ошибка:', error);
        updateStatus('Ошибка подключения к серверу', false);
        addMessage('❌ Не удалось подключиться к signalling серверу', 'system');
        addMessage('💡 Убедитесь, что сервер запущен: node local-server.js', 'system');
    };

    ws.onclose = () => {
        console.log('WebSocket отключён');
        updateStatus('Отключено от сервера', false);
        addMessage('🔌 Соединение с сервером потеряно', 'system');

        // Попытка переподключения через 3 секунды
        setTimeout(() => {
            if (ws.readyState === WebSocket.CLOSED) {
                addMessage('🔄 Попытка переподключения...', 'system');
                connectWebSocket();
            }
        }, 3000);
    };
}

// ---------- Отправка сообщений ----------

function sendMessage() {
    if (!isP2PConnected || !dataChannel || dataChannel.readyState !== 'open') {
        addMessage('⚠️ Нет активного P2P соединения', 'system');
        return;
    }

    const text = messageInput.value.trim();
    if (text === '') return;

    dataChannel.send(text);
    addMessage(text, 'me');
    messageInput.value = '';
}

// ---------- Инициализация P2P соединения ----------

function initiateP2PConnection() {
    const targetId = remotePeerIdInput.value.trim();
    if (!targetId) {
        addMessage('⚠️ Введите Peer ID собеседника', 'system');
        return;
    }

    if (targetId === myPeerId) {
        addMessage('⚠️ Нельзя подключиться к самому себе!', 'system');
        return;
    }

    remotePeerId = targetId;
    addMessage(`🔍 Инициализация P2P соединения с ${targetId}...`, 'system');
    updateStatus('Установка P2P...', false);

    createPeerConnection(true, targetId);
}

// ---------- Обработчики UI ----------

myPeerIdBox.addEventListener('click', () => {
    if (myPeerId) {
        navigator.clipboard.writeText(myPeerId).then(() => {
            addMessage('📋 Peer ID скопирован в буфер обмена!', 'system');
            const originalText = myPeerIdBox.textContent;
            myPeerIdBox.textContent = '✓ Скопировано!';
            setTimeout(() => {
                myPeerIdBox.textContent = originalText;
            }, 1500);
        });
    }
});

connectBtn.addEventListener('click', initiateP2PConnection);
sendBtn.addEventListener('click', sendMessage);

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

remotePeerIdInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        initiateP2PConnection();
    }
});

// ---------- ЗАПУСК ----------
addMessage('🚀 Запуск P2P чата...', 'system');
addMessage('📡 Подключение к локальному signalling серверу...', 'system');
connectWebSocket();