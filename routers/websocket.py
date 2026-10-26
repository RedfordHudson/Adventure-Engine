import fastapi
router = fastapi.APIRouter()

from fastapi import Depends
from utils.database import get_session
from sqlalchemy.ext.asyncio import AsyncSession
from routers.crawler_controller import refresh

from utils.websocket import ws

@router.websocket('/ws/levels')
async def websocket_stream(
    websocket: fastapi.WebSocket,
    session: AsyncSession = Depends(get_session)
):
    await ws.connect(websocket)

    try:
        await refresh(session=session)

        # Keep connection open to push updates later if backend state mutates
        while True:
            await websocket.receive_text() # Idle check

    except fastapi.WebSocketDisconnect:
        ws.disconnect(websocket)
        print('WebSocket Disconnected')