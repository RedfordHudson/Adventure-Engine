from typing import List, Dict
import dominate
from dominate import tags as t
from dominate.util import raw


def create_slider_widget(id_prefix: str, label_text: str, min_val: float, max_val: float, step: float, default: float) -> t.div:
    """Builds a titled range slider widget using Dominate tags integrated with HTMX."""
    container = t.div(cls="hud-group")
    with container:
        with t.div(cls="hud-label-row"):
            t.label(label_text, fr=f"{id_prefix}-slider")
            t.span(f"{default:.2f}", cls="hud-val", id=f"{id_prefix}-val")
        
        # We use a dictionary and ** unpacking to allow hyphenated HTML attributes
        t.input_(
            type="range",
            id=f"{id_prefix}-slider",
            name=id_prefix,  # This must match the FastAPI form parameter
            min=str(min_val),
            max=str(max_val),
            step=str(step),
            value=str(default),
            **{
                "hx-post": "/api/config",
                "hx-trigger": "input throttle:40ms",
                "hx-include": "[name='freq'], [name='amp'], [name='mode']",
                "hx-swap": "none"
            },
            oninput=f"document.getElementById('{id_prefix}-val').innerText = parseFloat(this.value).toFixed(2)"
        )
    return container


def create_brand_header(app_name: str, subtitle: str) -> t.header:
    """Constructs the glassmorphic brand badge and title banner."""
    header = t.header(cls="brand-panel")
    
    with header:
        with t.div(cls="brand-badge"):
            t.span(cls="live-dot", id="ws-indicator")
            t.span("Connecting to Python...", cls="badge-text", id="ws-status")
        t.h1(app_name, cls="brand-title")
        t.p(subtitle, cls="brand-sub")
    return header


def create_hud_panel(sliders_schema: List[Dict], modes: List[str], grid_count: int, active_mode: str = "radial") -> t.aside:
    """Assembles the interactive HUD panel using nested Dominate contexts."""
    panel = t.aside(cls="hud-panel", id="hud-container")
    with panel:
        # 1. Sliders Section
        for s in sliders_schema:
            create_slider_widget(s["id"], s["label"], s["min"], s["max"], s["step"], s["default"])

        # 2. Harmonics Mode Toggles
        with t.div(cls="hud-group"):
            t.label("Wave Harmonics Mode")
            # Hidden inputs hold selected mode value for the overall dynamic form
            t.input_(type="hidden", id="mode-state-input", name="mode", value=active_mode)
            
            with t.div(cls="mode-toggles"):
                for mode in modes:
                    is_active = (mode == active_mode)
                    btn_classes = "mode-btn active" if is_active else "mode-btn"
                    
                    t.button(
                        mode.capitalize(), 
                        cls=btn_classes, 
                        **{
                            "hx-post": "/api/config",
                            "hx-trigger": "click",
                            "hx-include": "[name='freq'], [name='amp'], [name='mode']",
                            "hx-target": "#hud-mount",  # Target the container in templates/shell.html
                            "hx-swap": "innerHTML",
                        },
                        onclick=f"document.getElementById('mode-state-input').value='{mode}'"
                    )

        t.hr(cls="hud-divider")

        # 3. Telemetry Metrics Section
        with t.div(cls="metrics-grid"):
            with t.div(cls="metric-card"):
                t.span("--", cls="metric-num", id="fps-counter")
                t.span("Client FPS", cls="metric-label")
            with t.div(cls="metric-card"):
                t.span(str(grid_count), cls="metric-num", id="instance-counter")
                t.span("Instances", cls="metric-label")

    return panel

# ui_components.py (Add these functions at the bottom)

def create_navigation_bar(active_page: str = "hub") -> t.nav:
    """Generates a glassmorphic top navigation bar with HTMX instant page transitions."""
    nav_container = t.nav(cls="brand-panel", style="top: 24px; left: 24px; padding: 12px 20px; pointer-events: auto; display: flex; gap: 16px; align-items: center;")
    with nav_container:
        # Mini Badge
        t.span("🛰️ ADVENTURE-NET", cls="brand-title", style="font-size: 14px; font-weight: 800; margin-right: 8px;")
        
        # Navigation Link Items
        pages = [("hub", "Control Hub", "/"), ("map", "Tactical Map", "/map")]
        for page_id, label, url in pages:
            is_active = (page_id == active_page)
            link_style = (
                "color: #ffffff; text-decoration: none; font-weight: 700; font-size: 12px; border-bottom: 2px solid var(--accent-primary);" 
                if is_active else 
                "color: var(--text-dim); text-decoration: none; font-size: 12px; transition: color 0.2s;"
            )
            
            t.a(
                label,
                style=link_style,
                **{
                    "hx-get": url,
                    "hx-target": "body",      # Swaps page viewport cleanly
                    "hx-push-url": "true"      # Updates the browser's URL history bar
                }
            )
    return nav_container


def create_map_panel() -> t.div:
    """Renders a mock tactical grid map view inside Python DOM."""
    container = t.div(cls="hud-panel", style="top: 80px; left: 24px; width: calc(100% - 48px); height: calc(100% - 120px); display: flex; align-items: center; justify-content: center;")
    with container:
        with t.div(style="text-align: center;"):
            t.h2("Tactical Map Canvas", style="color: #ffffff; font-weight: 700; margin-bottom: 12px;")
            t.p("Dynamic geospatial overlay coordinates mapped via pythonic Dominate components.", style="color: var(--text-dim); font-size: 14px; margin-bottom: 24px;")
            
            # Simple decorative SVG or layout to represent a Grid Map
            with t.div(style="width: 300px; height: 300px; border: 1px dashed var(--glass-border); border-radius: 12px; margin: 0 auto; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.2)"):
                t.span("🛰️ System Online (GRID_SIZE=32)", style="font-family: var(--font-mono); color: var(--accent-secondary); font-size: 11px;")
    return container
