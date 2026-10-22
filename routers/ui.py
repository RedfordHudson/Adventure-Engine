from fastapi import APIRouter
router = APIRouter()

from fastapi.responses import HTMLResponse
from fastapi import Request
from utils.config import SLIDERS_SCHEMA, MODES_SCHEMA, GRID_SIZE

from components.html import (
    create_hud_panel,
    create_brand_header,
    create_navigation_bar,  # <-- Added
    create_map_panel       # <-- Added
)

# Mount static JavaScript files
from fastapi.templating import Jinja2Templates
templates = Jinja2Templates(directory="templates")

@router.get("/", response_class=HTMLResponse)
async def get_index(request: Request):
    """Control Hub viewport."""
    nav_html = create_navigation_bar(active_page="hub").render()

    brand_html = create_brand_header(
        app_name="Generative Isometric Studio",
        subtitle="FastAPI Async Stream × Procedural Python DOM"
    ).render()

    hud_html = create_hud_panel(
        sliders_schema=SLIDERS_SCHEMA,
        modes=MODES_SCHEMA,
        grid_count=GRID_SIZE * GRID_SIZE
    ).render()

    # If it is an HTMX request, render only the DOM contents to save bandwidth
    if request.headers.get("HX-Request"):
        return templates.TemplateResponse(
            request=request,
            name="shell.html",
            context={
                "nav_component": nav_html,
                "brand_component": brand_html,
                "hud_component": hud_html,
                "map_component": None,
            }
        )

    # Standard browser landing load
    return templates.TemplateResponse(
        request=request,
        name="shell.html",
        context={
            "nav_component": nav_html,
            "brand_component": brand_html,
            "hud_component": hud_html,
            "map_component": None,
        }
    )

@router.get("/map", response_class=HTMLResponse)
async def get_map_view(request: Request):
    """Tactical Map viewport."""
    nav_html = create_navigation_bar(active_page="map").render()
    map_html = create_map_panel().render()

    # Pass elements cleanly to template renderers
    return templates.TemplateResponse(
        request=request,
        name="shell.html",
        context={
            "nav_component": nav_html,
            "brand_component": None,
            "hud_component": None,
            "map_component": map_html,
        }
    )