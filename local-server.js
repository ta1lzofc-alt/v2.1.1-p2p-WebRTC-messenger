// ============================================
// Локальный Signalling Сервер для P2P Чата
// Запуск: node local-server.js
// ============================================

const WebSocket = require('ws');
const server = new WebSocket.Server({ port: 8080 });

// Хранилище подключений
const clients = new Map(); // ws -> peerId
let nextPeerId = 1;

console.log('\n╔════════════════════════════════════════════╗');
console.log('║     Локальный P2P Signalling Сервер       ║');
console.log('║          Запущен на порту 8080            ║');
console.log('╚════════════════════════════════════════════╝\n');
console.log('📡 WebSocket сервер: ws://localhost:8080');
console.log('💡 Ожидание подключения клиентов...\n');

server.on('connection', (ws) => {
    // Генерируем уникальный ID для клиента
    const peerId = `peer_${nextPeerId++}`;
    clients.set(ws, peerId);

    console.log(`✅ [${new Date().toLocaleTimeString()}] Новый клиент: ${peerId}`);
    console.log(`   Всего подключено: ${clients.size}`);

    // Отправляем клиенту его ID
    ws.send(JSON.stringify({
        type: 'init',
        peerId: peerId
    }));

    // Обработка входящих сообщений
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log(`📨 [${peerId}] -> ${data.type || 'message'}`);

            // Пересылка сообщения другому клиенту
            if (data.targetPeerId) {
                let found = false;
                for (let [clientWs, clientId] of clients) {
                    if (clientId === data.targetPeerId) {
                        clientWs.send(JSON.stringify({
                            type: data.type,
                            from: peerId,
                            data: data.data
                        }));
                        found = true;
                        console.log(`   ↳ Переслано клиенту: ${data.targetPeerId}`);
                        break;
                    }
                }

                if (!found) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: `Peer ${data.targetPeerId} не найден`
                    }));
                    console.log(`   ❌ Peer ${data.targetPeerId} не найден`);
                }
            }
        } catch (err) {
            console.error('   ⚠️ Ошибка обработки:', err.message);
        }
    });

    // Обработка отключения
    ws.on('close', () => {
        const disconnectedId = clients.get(ws);
        clients.delete(ws);
        console.log(`❌ [${new Date().toLocaleTimeString()}] Отключился: ${disconnectedId}`);
        console.log(`   Осталось клиентов: ${clients.size}`);
    });

    ws.on('error', (err) => {
        console.error(`   ⚠️ Ошибка WebSocket: ${err.message}`);
    });
});

// Вывод списка подключений каждые 30 секунд
setInterval(() => {
    if (clients.size > 0) {
        console.log('\n📊 Активные подключения:');
        for (let [ws, id] of clients) {
            console.log(`   - ${id}`);
        }
        console.log('');
    }
}, 30000);

console.log('🟢 Сервер готов к работе!\n');
console.log('⚡ Чтобы остановить сервер, нажмите Ctrl+C\n');