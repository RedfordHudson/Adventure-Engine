from fastapi import APIRouter
router = APIRouter()

# == [ PROCESS USER INTERACTIONS ] ==

from fastapi.responses import HTMLResponse
from fastapi import Form

from utils.config import EngineConfig
current_config = EngineConfig()

from utils.config import SLIDERS_SCHEMA, MODES_SCHEMA, GRID_SIZE
from components.html import create_hud_panel

from utils.math import IsometricMathEngine
from utils.config import GRID_SIZE
engine = IsometricMathEngine(grid_size=GRID_SIZE, spacing=1.15)

@router.post("/api/config", response_class=HTMLResponse)
async def update_config(
    freq: float = Form(0.22),
    amp: float = Form(2.8),
    mode: str = Form("radial")
):
    """Callback triggered dynamically by HTMX when the user interacts with the UI."""
    global current_config

    # 1. Update our central backend python config
    current_config = EngineConfig(frequency=freq, amplitude=amp, mode=mode)

    # 2. Re-render and return the fresh HUD panel, carrying updated button configurations
    updated_panel = create_hud_panel(
        sliders_schema=SLIDERS_SCHEMA,
        modes=MODES_SCHEMA,
        grid_count=GRID_SIZE * GRID_SIZE,
        active_mode=mode
    )

    # Send the raw compiled html fragment directly back to HTMX for mounting
    return HTMLResponse(content=updated_panel.render())

# == [ SERIALIZE MATRIX THROUGH WEBSOCKET TO ENGINE.JS ] ==

from fastapi import WebSocket, WebSocketDisconnect
import asyncio

@router.websocket("/ws/stream")
async def websocket_stream(websocket: WebSocket):
    await websocket.accept()
    time_tick = 0.0
    try:
        while True:
            matrix_data = engine.compute_field(
                time_sec=time_tick,
                frequency=current_config.frequency,
                amplitude=current_config.amplitude,
                mode=current_config.mode
            )
            await websocket.send_json({
                "tick": round(time_tick, 2),
                "instances": matrix_data
            })
            time_tick += 0.035
            await asyncio.sleep(1 / 35)
    except WebSocketDisconnect:
        pass