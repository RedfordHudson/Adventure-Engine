import fastapi
router = fastapi.APIRouter()

# == [ RENDER ] ==

import components

from fastapi.templating import Jinja2Templates
templates = Jinja2Templates(directory="templates")

@router.get('/', response_class=fastapi.responses.HTMLResponse)
async def get_index(request: fastapi.Request):

    return templates.TemplateResponse(
        request=request,
        name='level_selector.html',
        context={
            'hud_nav': components.level_selector.hud_nav(),
            'crawler_controller': components.crawler_controller.crawler_controller(),
            'node_card': components.level_selector.node_card(),
        }
    )

# == [ API ] ==

# @router.post('/api/viewport',response_class=fastapi.responses.HTMLResponse)

from utils.websocket import ws
# from utils.parse_events import get_events

@router.websocket('/ws/levels')
async def websocket_stream(websocket: fastapi.WebSocket):
    # await websocket.accept()
    await ws.connect(websocket)

    try:
        await websocket.send_json([])
        # await ws.broadcast_json(get_events())

        # Keep connection open to push updates later if backend state mutates
        while True:
            await websocket.receive_text() # Idle check
            # pass

    except fastapi.WebSocketDisconnect:
        ws.disconnect(websocket)
        print('WebSocket Disconnected')