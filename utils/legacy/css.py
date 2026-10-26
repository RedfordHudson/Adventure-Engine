"""
theme_engine.py

Generates CSS stylesheets dynamically from Python data structures
using a pure-Python, zero-dependency compiler. Fully compatible with Windows.
"""

from typing import Dict, Any


def dict_to_css(css_dict: Dict[str, Any]) -> str:
    """Compiles a nested Python dictionary into a valid CSS stylesheet string.
    
    Automatically translates Python snake_case keys into CSS kebab-case properties
    (e.g., 'background_color' -> 'background-color'). Supports nested rules like
    media queries.
    """
    lines = []
    for selector, rules in css_dict.items():
        # Handle media queries and other nested blocks (e.g., @media)
        if selector.startswith("@"):
            lines.append(f"{selector} {{")
            for nested_selector, nested_rules in rules.items():
                lines.append(f"  {nested_selector} {{")
                for prop, value in nested_rules.items():
                    css_prop = prop.replace("_", "-")
                    lines.append(f"    {css_prop}: {value};")
                lines.append("  }")
            lines.append("}\n")
        else:
            # Handle standard flat rules
            lines.append(f"{selector} {{")
            for prop, value in rules.items():
                css_prop = prop.replace("_", "-")
                lines.append(f"  {css_prop}: {value};")
            lines.append("}\n")
            
    return "\n".join(lines)


class ThemeEngine:
    def __init__(self, palette_mode: str = "obsidian"):
        self.palette_mode = palette_mode

    def get_variables(self) -> Dict[str, str]:
        """Design tokens mapped to CSS custom properties."""
        if self.palette_mode == "cyberpunk":
            return {
                "--bg-deep": "#05050d",
                "--glass-surface": "rgba(18, 12, 34, 0.72)",
                "--glass-border": "rgba(244, 63, 94, 0.25)",
                "--accent-primary": "#f43f5e",
                "--accent-secondary": "#06b6d4",
                "--text-main": "#fdf4ff",
                "--text-dim": "#a855f7",
            }
        else:  # Obsidian / Slate default
            return {
                "--bg-deep": "#080a0f",
                "--glass-surface": "rgba(15, 23, 42, 0.68)",
                "--glass-border": "rgba(255, 255, 255, 0.08)",
                "--accent-primary": "#6366f1",
                "--accent-secondary": "#38bdf8",
                "--text-main": "#f8fafc",
                "--text-dim": "#94a3b8",
            }

    def render_stylesheet(self) -> str:
        """Assembles and returns a complete, production-ready stylesheet."""
        palette_vars = self.get_variables()

        stylesheet_schema = {
            ":root": {
                **palette_vars,
                "--font-sans": "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
                "--font-mono": "'JetBrains Mono', monospace",
            },
            "*": {
                "box_sizing": "border-box",
                "margin": "0",
                "padding": "0",
                "user_select": "none",
            },
            "body, html": {
                "width": "100%",
                "height": "100%",
                "overflow": "hidden",
                "background_color": "var(--bg-deep)",
                "font_family": "var(--font-sans)",
                "color": "var(--text-main)",
                "-webkit-font-smoothing": "antialiased",
            },
            "#stage": {
                "position": "absolute",
                "top": "0",
                "left": "0",
                "width": "100vw",
                "height": "100vh",
                "display": "block",
                "z-index": "1",
            },
            ".brand-panel, .hud-panel": {
                "position": "absolute",
                "z_index": "10",
                "background": "var(--glass-surface)",
                "backdrop_filter": "blur(16px)",
                "-webkit-backdrop-filter": "blur(16px)",
                "border": "1px solid var(--glass-border)",
                "border_radius": "14px",
                "box_shadow": "0 20px 40px rgba(0, 0, 0, 0.45)",
            },
            ".brand-panel": {
                "top": "24px",
                "left": "24px",
                "padding": "16px 22px",
                "pointer_events": "none",
            },
            ".brand-badge": {
                "display": "inline-flex",
                "align_items": "center",
                "gap": "8px",
                "background": "rgba(0, 0, 0, 0.35)",
                "padding": "4px 10px",
                "border_radius": "20px",
                "font_family": "var(--font-mono)",
                "font_size": "11px",
                "color": "var(--text-dim)",
                "margin_bottom": "8px",
            },
            ".live-dot": {
                "width": "8px",
                "height": "8px",
                "border_radius": "50%",
                "background_color": "#ef4444",
                "box_shadow": "0 0 8px rgba(239, 68, 68, 0.6)",
                "transition": "background-color 0.3s, box-shadow 0.3s",
            },
            ".live-dot.connected": {
                "background_color": "#10b981",
                "box_shadow": "0 0 10px rgba(16, 185, 129, 0.8)",
            },
            ".brand-title": {
                "font_size": "17px",
                "font_weight": "700",
                "letter_spacing": "-0.02em",
                "color": "#ffffff",
            },
            ".brand-sub": {
                "font_size": "12px",
                "color": "var(--text-dim)",
                "margin_top": "2px",
            },
            ".hud-panel": {
                "top": "24px",
                "right": "24px",
                "width": "310px",
                "padding": "20px",
                "display": "flex",
                "flex_direction": "column",
                "gap": "16px",
            },
            ".hud-group": {
                "display": "flex",
                "flex_direction": "column",
                "gap": "8px",
            },
            ".hud-label-row": {
                "display": "flex",
                "justify_content": "space-between",
                "align_items": "center",
                "font_size": "12px",
                "font_weight": "600",
                "color": "var(--text-dim)",
            },
            ".hud-val": {
                "font_family": "var(--font-mono)",
                "color": "var(--accent-secondary)",
                "font_size": "12px",
            },
            'input[type="range"]': {
                "-webkit-appearance": "none",
                "width": "100%",
                "height": "6px",
                "border_radius": "3px",
                "background": "rgba(255, 255, 255, 0.12)",
                "outline": "none",
                "cursor": "pointer",
            },
            'input[type="range"]::-webkit-slider-thumb': {
                "-webkit-appearance": "none",
                "width": "16px",
                "height": "16px",
                "border_radius": "50%",
                "background": "var(--accent-primary)",
                "border": "2px solid #ffffff",
                "box_shadow": "0 0 10px rgba(99, 102, 241, 0.8)",
                "transition": "transform 0.1s",
            },
            'input[type="range"]::-webkit-slider-thumb:hover': {
                "transform": "scale(1.2)",
            },
            ".mode-toggles": {
                "display": "grid",
                "grid_template_columns": "repeat(3, 1fr)",
                "gap": "6px",
                "margin_top": "4px",
            },
            ".mode-btn": {
                "background": "rgba(255, 255, 255, 0.05)",
                "border": "1px solid var(--glass-border)",
                "color": "var(--text-dim)",
                "padding": "7px 0",
                "border_radius": "6px",
                "font_size": "11px",
                "font_weight": "600",
                "cursor": "pointer",
                "transition": "all 0.2s ease",
            },
            ".mode-btn:hover": {
                "background": "rgba(255, 255, 255, 0.1)",
                "color": "#ffffff",
            },
            ".mode-btn.active": {
                "background": "var(--accent-primary)",
                "color": "#ffffff",
                "border_color": "rgba(255, 255, 255, 0.3)",
                "box_shadow": "0 0 12px rgba(99, 102, 241, 0.5)",
            },
            ".hud-divider": {
                "border": "none",
                "height": "1px",
                "background": "var(--glass-border)",
                "margin": "2px 0",
            },
            ".metrics-grid": {
                "display": "grid",
                "grid_template_columns": "1fr 1fr",
                "gap": "10px",
            },
            ".metric-card": {
                "background": "rgba(0, 0, 0, 0.3)",
                "padding": "10px",
                "border_radius": "8px",
                "border": "1px solid rgba(255, 255, 255, 0.04)",
                "text_align": "center",
            },
            ".metric-num": {
                "display": "block",
                "font_family": "var(--font-mono)",
                "font_size": "16px",
                "font_weight": "700",
                "color": "#ffffff",
            },
            ".metric-label": {
                "display": "block",
                "font_size": "10px",
                "text_transform": "uppercase",
                "color": "var(--text-dim)",
                "letter_spacing": "0.05em",
                "margin_top": "2px",
            },
            # Handles responsive media block with correct indentation nesting
            "@media (max-width: 768px)": {
                ".brand-panel": {
                    "top": "16px",
                    "left": "16px",
                    "right": "16px",
                    "padding": "12px 16px",
                },
                ".hud-panel": {
                    "top": "auto",
                    "bottom": "16px",
                    "left": "16px",
                    "right": "16px",
                    "width": "auto",
                    "padding": "16px",
                }
            }
        }

        return dict_to_css(stylesheet_schema)
