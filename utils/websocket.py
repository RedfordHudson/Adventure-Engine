import fastapi
from typing import List

class ConnectionManager:
    def __init__(self):
        # Store all active WebSocket connections
        self.active_connections: List[fastapi.WebSocket] = []

    async def connect(self, websocket: fastapi.WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: fastapi.WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast_json(self, data: dict):
        """Sends a JSON payload to all active WebSockets."""
        for connection in self.active_connections:
            try:
                await connection.send_json(data)
            except Exception as e:
                # Handle stale/dead connections gracefully
                print(f'[utils.websocket.ConnectionManager.broadcast_json:ERROR] {e}')
                self.disconnect(connection)

# Instantiate a single global manager instance
ws = ConnectionManager()
