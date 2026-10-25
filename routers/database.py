import fastapi
router = fastapi.APIRouter()

from utils.database import engine, Base, DB, get_session
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession


# Initialize database tables on startup
@router.on_event('startup')
async def startup_event():
    async with engine.begin() as conn:
        # Warning: For production, use Alembic migrations instead
        await conn.run_sync(Base.metadata.create_all)

@router.delete('/events/delete')
async def delete(  
    session: AsyncSession = Depends(get_session)
):
    await DB(session).delete_events()