import asyncio
import websockets
import json

clients = []

async def handler(websocket):
    clients.append(websocket)
    print(f"Clients connected: {len(clients)}")
    
    try:
        if len(clients) == 2:
            print("We send start to the first (offer)")
            await clients[0].send(json.dumps({"type": "start", "role": "offer"}))
            print("We send start to the second (answer)")
            await clients[1].send(json.dumps({"type": "start", "role": "answer"}))

        async for message in websocket:
            if len(clients) >= 2:
                other = clients[0] if websocket == clients[1] else clients[1]
                await other.send(message)
                print(f"Sent message")
    except:
        pass
    finally:
        if websocket in clients:
            clients.remove(websocket)
        print(f"Clients remaining: {len(clients)}")

async def main():
    print("\n" + "="*50)
    print("     P2P SIGNALLING SERVER (V2.1.1)")
    print("="*50)
    print("  Link: ws://0.0.0.0:8080")
    print("  Waiting for two clients...\n")
    
    async with websockets.serve(handler, "0.0.0.0", 8080):
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())