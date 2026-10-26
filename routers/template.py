import fastapi
router = fastapi.APIRouter()

from fastapi.templating import Jinja2Templates
templates = Jinja2Templates(directory="templates")

from fastapi import Request

from utils.config import DOCKS, MODULES

@router.get('/', response_class=fastapi.responses.HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse(
        request, 'base.html', {'modules': MODULES, 'docks': DOCKS}
    )