"""
math_engine.py
Generative procedural math engine executed natively in Python.
"""
import math
from typing import List, Dict, Any, Tuple


class ColorRamp:
    """Computes procedural RGB gradients in Python."""

    @staticmethod
    def hex_to_rgb(hex_val: int) -> Tuple[float, float, float]:
        r = ((hex_val >> 16) & 255) / 255.0
        g = ((hex_val >> 8) & 255) / 255.0
        b = (hex_val & 255) / 255.0
        return r, g, b

    @classmethod
    def interpolate(cls, c1_hex: int, c2_hex: int, c3_hex: int, factor: float) -> Tuple[float, float, float]:
        """Maps a normalized factor (0.0 - 1.0) through a 3-stop color palette."""
        t = max(0.0, min(1.0, factor))
        if t < 0.5:
            local_t = t * 2.0
            r1, g1, b1 = cls.hex_to_rgb(c1_hex)
            r2, g2, b2 = cls.hex_to_rgb(c2_hex)
            return (
                r1 + (r2 - r1) * local_t,
                g1 + (g2 - g1) * local_t,
                b1 + (b2 - b1) * local_t,
            )
        else:
            local_t = (t - 0.5) * 2.0
            r1, g1, b1 = cls.hex_to_rgb(c2_hex)
            r2, g2, b2 = cls.hex_to_rgb(c3_hex)
            return (
                r1 + (r2 - r1) * local_t,
                g1 + (g2 - g1) * local_t,
                b1 + (b2 - b1) * local_t,
            )


class IsometricMathEngine:
    def __init__(self, grid_size: int = 32, spacing: float = 1.15):
        self.grid_size = grid_size
        self.spacing = spacing
        self.half_extent = (grid_size * spacing) / 2.0

        # High-res neon / obsidian palette (Trough -> Crest -> Accent)
        self.palette = {
            "low": 0x0f172a,    # Deep slate
            "mid": 0x6366f1,    # Vibrant indigo
            "high": 0x38bdf8,   # Electric cyan
            "peak": 0xf43f5e    # Rose accent
        }

    def compute_field(
        self,
        time_sec: float,
        frequency: float = 0.22,
        amplitude: float = 2.8,
        mode: str = "radial"
    ) -> List[Dict[str, Any]]:
        """
        Computes 3D coordinates, dynamic heights, and color values for all instances.
        """
        instances = []
        center = self.grid_size / 2.0

        for ix in range(self.grid_size):
            for iz in range(self.grid_size):
                # World-space isometric plane coordinates
                x = (ix * self.spacing) - self.half_extent
                z = (iz * self.spacing) - self.half_extent

                dx = ix - center
                dz = iz - center
                distance = math.sqrt(dx * dx + dz * dz)

                if mode == "radial":
                    # Multi-harmonic circular concentric ripple
                    h1 = math.sin(distance * frequency - time_sec * 2.4) * amplitude
                    h2 = math.cos((ix * 0.35) + time_sec * 1.2) * (amplitude * 0.35)
                    h3 = math.sin((iz * 0.35) - time_sec * 0.8) * (amplitude * 0.35)
                    elevation = h1 + h2 + h3

                elif mode == "simplex":
                    # Diagonal wave interference simulation
                    diag1 = math.sin((x * 0.25) + (z * 0.25) + time_sec * 2.0)
                    diag2 = math.cos((x * 0.3) - (z * 0.2) - time_sec * 1.5)
                    elevation = (diag1 + diag2) * amplitude

                elif mode == "peaks":
                    # Peak landscape synthesis
                    radial = math.sin(distance * 0.35 - time_sec * 1.8)
                    vort = math.atan2(dz, dx) * 2.0
                    elevation = (radial + math.sin(vort + time_sec)) * amplitude
                else:
                    elevation = math.sin(distance * frequency - time_sec) * amplitude

                # Normalize elevation to [0, 1] for color ramp mapping
                norm_height = (elevation + (amplitude * 1.5)) / (amplitude * 3.0)
                norm_height = max(0.0, min(1.0, norm_height))

                r, g, b = ColorRamp.interpolate(
                    self.palette["low"],
                    self.palette["mid"],
                    self.palette["high"],
                    norm_height
                )

                # Height scaling for pillars
                pillar_height = max(0.25, round(elevation + 3.2, 3))

                instances.append({
                    "x": round(x, 3),
                    "y": round(pillar_height / 2.0, 3),  # Align base to ground
                    "z": round(z, 3),
                    "sy": pillar_height,
                    "color": [round(r, 3), round(g, 3), round(b, 3)]
                })

        return instances