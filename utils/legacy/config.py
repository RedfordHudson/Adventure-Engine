from pydantic import BaseModel

# UI Configuration defined entirely in Python
SLIDERS_SCHEMA = [
    {'id': 'freq', 'label': 'Wave Frequency', 'min': 0.05, 'max': 0.60, 'step': 0.01, 'default': 0.22},
    {'id': 'amp', 'label': 'Elevation Amplitude', 'min': 0.5, 'max': 5.0, 'step': 0.1, 'default': 2.80},
]
MODES_SCHEMA = ['radial', 'simplex', 'peaks']

GRID_SIZE = 32

class EngineConfig(BaseModel):
    frequency: float = 0.22
    amplitude: float = 2.8
    mode: str = 'radial'