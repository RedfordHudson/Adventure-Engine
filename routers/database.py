import fastapi
router = fastapi.APIRouter()

from utils.database import engine, Base
# from utils.database import engine, Base, get_db, EventSource, RawEvent
# import utils.schemas

# Initialize database tables on startup
@router.on_event('startup')
async def startup_event():
    async with engine.begin() as conn:
        # Warning: For production, use Alembic migrations instead
        await conn.run_sync(Base.metadata.create_all)