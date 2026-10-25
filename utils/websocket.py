# == [ PAYLOAD SCHEMA ] ==

from pydantic import BaseModel
from typing import Dict, Any, List

class WSBaseMessage(BaseModel):
    event_type: str  # 'status_change' or 'data_stream'

# Type 1: The Crawler Update Payload
class CrawlerStatusUpdate(WSBaseMessage):
    event_type: str = 'status_change'
    source_id: str
    status: str  # 'syncing', 'extracting', 'idle', etc.

# Type 2: Your Existing Data Stream Payload
class DataStreamPayload(WSBaseMessage):
    event_type: str = 'data_stream'
    data: List[Dict[str, Any]]

# == [ WEBSOCKET MANAGER ] ==

import fastapi
from fastapi.encoders import jsonable_encoder
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

    async def broadcast_event(self, payload: WSBaseMessage):
        # Sends a JSON payload to all active WebSockets.

        # Convert Pydantic model to a clean, JSON-serializable Python dict
        clean_json = jsonable_encoder(payload.model_dump())

        for connection in self.active_connections:
            try:
                await connection.send_json(clean_json)
            except Exception as e:
                # Handle stale/dead connections gracefully
                print(f'[utils.websocket.ConnectionManager.broadcast_json:ERROR] {e}')
                self.disconnect(connection)

# Instantiate a single global manager instance
ws = ConnectionManager()
