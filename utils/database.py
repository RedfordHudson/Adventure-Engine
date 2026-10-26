import uuid
from datetime import datetime
from typing import AsyncGenerator
from sqlalchemy import Column, String, DateTime, Text, ForeignKey, select
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, relationship

# Update connection parameters with your local PostgreSQL credentials
# DATABASE_URL = 'postgresql+asyncpg://postgres:postgres@localhost:5432/event_db'
# SQLite database URL (file-based)
# DATABASE_URL = 'sqlite:///database.db'
DATABASE_URL = 'sqlite+aiosqlite:///./data/database.db'

engine = create_async_engine(DATABASE_URL, echo=True)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

class Base(DeclarativeBase):
    pass

# --- database models ---

class EventSource(Base):
    __tablename__ = 'event_sources'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    url = Column(String, nullable=False, unique=True)
    last_sync_time = Column(DateTime(timezone=True), nullable=True)
    status = Column(String(50), default='idle')  # idle, syncing, failed

    events = relationship('RawEvent', back_populates='source', cascade='all, delete-orphan')


class RawEvent(Base):
    __tablename__ = 'raw_events'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_id = Column(UUID(as_uuid=True), ForeignKey('event_sources.id'), nullable=False)
    title = Column(String(500), nullable=False)
    start_time = Column(DateTime(timezone=True), nullable=False)
    location = Column(String(500), nullable=False)
    link = Column(Text, nullable=False)
    image_link = Column(Text, nullable=False)
    
    # 🌟 Fluid Schema column
    raw_payload = Column(JSONB, nullable=False)

    source = relationship('EventSource', back_populates='events')


# --- db dependency ---

async def get_session() -> AsyncGenerator[AsyncSession, None]:
    # FastAPI dependency to yield db sessions and handle cleanups.
    async with AsyncSessionLocal() as session:
        yield session

from sqlalchemy import update, select, delete
import utils.schemas as schemas

class DB:
    def __init__(self, session: AsyncSession):
        self.session = session
        
    async def get_events(self):

        result = await self.session.execute(select(RawEvent))
        events = result.scalars().all()

        events = [schemas.RawEventRead.model_validate(e).model_dump() for e in events]

        return events
    
    async def delete_events(self):

        # self.session.query(RawEvent).delete()
        await self.session.execute(delete(RawEvent))
        await self.session.commit()