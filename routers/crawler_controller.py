import fastapi
router = fastapi.APIRouter()

from fastapi import Form, Response, Depends
from fastapi.encoders import jsonable_encoder

from utils.database import get_session, DB
from sqlalchemy.ext.asyncio import AsyncSession
from utils.websocket import ws, DataStreamPayload
# from utils.parse_events import interim

# @router.post('/crawler/refresh')
async def refresh(
    session: AsyncSession = Depends(get_session)
):
    events = await DB(session).get_events()

    # node_levels = interim(events)
    # node_levels = [jsonable_encoder(e) for e in node_levels]

    payload = DataStreamPayload(data=events)

    await ws.broadcast_event(payload)
    
import sys, subprocess, os
from pathlib import Path

@router.post('/crawler/sync')
# @router.post('/sources/{source_id}/sync')
def trigger_independent_sync(
    # source_id: UUID
    name: str = Form(...)
):

    print(f'starting crawler: {name}')
    # cmd = [sys.executable, 'surrogate.py', '--source-id', str(source_id)]
    
    # exe = sys.executable
    env = 'crawler'
    exe = f'{Path.home()}/miniconda3/envs/{env}/bin/python'
    print(exe)

    cmd = [exe, '-m', 'utils.crawler_controller']
    

    # Spawn a detached OS process
    subprocess.Popen(
        cmd,
        start_new_session=True,  # Disassociates process from the FastAPI parent session
        # stdout=subprocess.DEVNULL,
        # stderr=subprocess.DEVNULL,
        stdout=None,
        stderr=None,
        cwd=os.getcwd()
    )
    return {'message': 'Crawler process spawned independently', 'status': 'initiated'}


from utils.websocket import CrawlerStatusUpdate

@router.post('/internal/notify-status')
async def notify_status(
    source_id: str,
    status: str,
    session: AsyncSession = Depends(get_session)
):
    print(f'notified from crawler: {status}')

    if status == 'idle':
        await refresh(session=session)

    source_id = 'status-indicator-luma'

    payload = CrawlerStatusUpdate(source_id=source_id, status=status)
    
    # Broadcast to the exact same socket!
    await ws.broadcast_event(payload)
    return {'status': 'ok'}