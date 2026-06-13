#!/usr/bin/env python3
"""Полностью рабочий WebSocket сервер для P2P чата"""

import socket
import threading
import json
import hashlib
import base64
from datetime import datetime

clients = {}  # peer_id -> {'conn': socket, 'addr': addr}
peer_counter = 1


class WebSocketServer:
    def __init__(self, host='0.0.0.0', port=8080):
        self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.socket.bind((host, port))
        self.socket.listen(5)
        print(f"\n{'=' * 50}")
        print(f"   P2P WEBSOCKET СЕРВЕР v2")
        print(f"{'=' * 50}")
        print(f"\n🚀 Запущен на ws://{host}:{port}")
        print(f"📊 PID: {socket.gethostname()}")
        print(f"💡 Для остановки нажмите Ctrl+C\n")

    def handshake(self, conn):
        """Выполняет WebSocket handshake"""
        data = conn.recv(1024).decode()
        if 'Sec-WebSocket-Key' not in data:
            return False

        for line in data.split('\n'):
            if 'Sec-WebSocket-Key' in line:
                key = line.split(':')[1].strip()
                break
        else:
            return False

        accept = base64.b64encode(
            hashlib.sha1((key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest()).decode()

        response = (
            'HTTP/1.1 101 Switching Protocols\r\n'
            'Upgrade: websocket\r\n'
            'Connection: Upgrade\r\n'
            f'Sec-WebSocket-Accept: {accept}\r\n\r\n'
        )
        conn.send(response.encode())
        return True

    def decode_frame(self, data):
        """Декодирует WebSocket фрейм"""
        if not data or len(data) < 2:
            return None

        length = data[1] & 127
        mask = data[1] & 128
        pos = 2

        if length == 126:
            if len(data) < 4:
                return None
            length = int.from_bytes(data[pos:pos + 2], 'big')
            pos += 2
        elif length == 127:
            if len(data) < 10:
                return None
            length = int.from_bytes(data[pos:pos + 8], 'big')
            pos += 8

        if mask:
            if len(data) < pos + 4:
                return None
            mask_key = data[pos:pos + 4]
            pos += 4

            if len(data) < pos + length:
                return None

            decoded = bytearray(length)
            for i in range(length):
                decoded[i] = data[pos + i] ^ mask_key[i % 4]
            return decoded.decode('utf-8')

        if len(data) < pos + length:
            return None
        return data[pos:pos + length].decode('utf-8')

    def encode_frame(self, message):
        """Кодирует сообщение в WebSocket фрейм"""
        if isinstance(message, str):
            message = message.encode()
        length = len(message)

        if length < 126:
            frame = bytearray([0x81, length]) + message
        elif length < 65536:
            frame = bytearray([0x81, 126]) + length.to_bytes(2, 'big') + message
        else:
            frame = bytearray([0x81, 127]) + length.to_bytes(8, 'big') + message
        return frame

    def send_message(self, conn, message):
        """Отправляет сообщение клиенту"""
        try:
            conn.send(self.encode_frame(message))
            return True
        except:
            return False

    def handle_client(self, conn, addr, peer_id):
        """Обрабатывает подключение одного клиента"""
        # Handshake
        if not self.handshake(conn):
            conn.close()
            return

        # Отправляем ID клиенту
        self.send_message(conn, json.dumps({
            'type': 'init',
            'peerId': peer_id
        }))

        print(f"✅ [ПОДКЛЮЧЕНИЕ] Peer {peer_id} от {addr[0]}:{addr[1]}")
        print(f"   👥 Всего онлайн: {list(clients.keys())}")

        try:
            while True:
                data = conn.recv(4096)
                if not data:
                    break

                message = self.decode_frame(data)
                if not message:
                    continue

                try:
                    msg = json.loads(message)
                    target = msg.get('targetPeerId')

                    if target:
                        # Преобразуем target в число (если это строка с числом)
                        try:
                            target_int = int(target)
                        except:
                            target_int = target

                        # ВАЖНО: добавляем информацию об отправителе
                        msg['from'] = peer_id

                        if target_int in clients:
                            target_conn = clients[target_int]['conn']
                            self.send_message(target_conn, json.dumps(msg))
                            msg_type = msg.get('type', 'message')
                            print(f"📨 [{datetime.now().strftime('%H:%M:%S')}] {peer_id} -> {target_int} ({msg_type})")
                        else:
                            # Отправляем ошибку отправителю
                            self.send_message(conn, json.dumps({
                                'type': 'error',
                                'message': f'Peer {target} не в сети. Доступны: {list(clients.keys())}'
                            }))
                            print(f"❌ Peer {target} не найден. Доступны: {list(clients.keys())}")
                except json.JSONDecodeError as e:
                    print(f"⚠️ Ошибка JSON: {e}")

        except (ConnectionResetError, BrokenPipeError, OSError):
            pass
        finally:
            if peer_id in clients:
                del clients[peer_id]
            conn.close()
            print(f"\n❌ [ОТКЛЮЧЕНИЕ] Peer {peer_id}")
            print(f"   👥 Осталось: {list(clients.keys()) if clients else 'никого'}\n")

    def start(self):
        """Запускает сервер"""
        global peer_counter

        print("🟢 Ожидание подключений...\n")

        while True:
            try:
                conn, addr = self.socket.accept()
                peer_id = peer_counter
                peer_counter += 1
                clients[peer_id] = {'conn': conn, 'addr': addr}

                thread = threading.Thread(target=self.handle_client, args=(conn, addr, peer_id))
                thread.daemon = True
                thread.start()
            except KeyboardInterrupt:
                print("\n\n🛑 Остановка сервера...")
                break
            except Exception as e:
                print(f"⚠️ Ошибка: {e}")


if __name__ == '__main__':
    server = WebSocketServer()
    server.start()