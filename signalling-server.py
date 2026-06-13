#!/usr/bin/env python3
"""
Простой Signalling сервер для PeerJS
Запуск: python signalling-server.py
"""

import asyncio
import websockets
import json
import uuid

# Хранилище активных подключений
clients = {}  # peer_id -> websocket


async def handler(websocket, path):
    """Обработчик WebSocket соединения"""
    peer_id = str(uuid.uuid4())[:8]
    clients[peer_id] = websocket

    print(f"✅ Peer {peer_id} подключился")

    # Отправляем клиенту его ID
    await websocket.send(json.dumps({
        "type": "open",
        "peerId": peer_id
    }))

    try:
        async for message in websocket:
            data = json.loads(message)

            # Перенаправляем сообщение нужному peer'у
            if "type" in data and "dst" in data:
                dst = data["dst"]
                if dst in clients:
                    await clients[dst].send(message)
                    print(f"📨 Пересылка от {peer_id} к {dst}")
                else:
                    print(f"❌ Peer {dst} не найден")

    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        del clients[peer_id]
        print(f"🔌 Peer {peer_id} отключился")


async def main():
    async with websockets.serve(handler, "0.0.0.0", 9000):
        print("🚀 Signalling сервер запущен на ws://0.0.0.0:9000")
        print("📝 Для использования в PeerJS укажите:")
        print("   host: 'localhost'")
        print("   port: 9000")
        print("   path: '/'")
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())