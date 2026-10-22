import fastapi
router = fastapi.APIRouter()

from fastapi import Form, Response

from utils.websocket import ws
from utils.parse_events import interim

from uuid import UUID
import asyncio
from datetime import datetime, timezone
from utils.database import get_db, EventSource, RawEvent, AsyncSessionLocal
from fastapi import FastAPI, Depends, BackgroundTasks, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from typing import List
import utils.schemas as schemas

@router.post('/crawler/sync')
async def test(
    name: str = Form(...)
):
    print(f'starting crawler: {name}')

from fastapi.encoders import jsonable_encoder

@router.post('/crawler/refresh')
async def refresh(
    name: str = Form(...),
    db: AsyncSession = Depends(get_db)
):
    print(f'refreshing crawler: {name}')
    # data = get_events_from_db()


    result = await db.execute(select(RawEvent))
    events = result.scalars().all()


    # print(type(events),type(events[0]))
    # e = events[0]
    # print(e)
    # validated_e = schemas.RawEventRead.model_validate(e)
    # print(validated_e)
    # json_data = validated_e.model_dump_json()
    # dict_data = validated_e.model_dump()
    # print(json_data)
    # print(dict_data)

    events = [schemas.RawEventRead.model_validate(e).model_dump() for e in events]
    # print(events)

    node_levels = interim(events)
    node_levels = [jsonable_encoder(e) for e in node_levels]
    # print(node_levels)

    await ws.broadcast_json(node_levels)


# --- Background Sync Task Simulator ---


@router.post('/crawler/simulate')
async def simulate_crawl_task(source_id: UUID):
    # Simulates background crawling and parsing into the fluid JSONB table.
    # await asyncio.sleep(5)  # Simulate Crawler delay

    async with AsyncSessionLocal() as session:
        try:
            # Create a mock crawled event payload
            new_event = RawEvent(
                source_id=source_id,
                title='Simulated Generative AI Summit',
                start_time=datetime.now(timezone.utc),
                raw_payload={
                    'price': 'Free',
                    'location': 'San Francisco, CA',
                    'tags': ['AI', 'Tech', 'Startup'],
                    'organizer': {
                        'name': 'AI Builders Club',
                        'contact': 'info@builders.club'
                    }
                }
            )
            session.add(new_event)

            # Update source metadata status
            await session.execute(
                update(EventSource)
                .where(EventSource.id == source_id)
                .values(status='idle', last_sync_time=datetime.now(timezone.utc))
            )
            await session.commit()
            print(f'Sync complete for source: {source_id}')
        except Exception as e:
            await session.rollback()
            await session.execute(
                update(EventSource)
                .where(EventSource.id == source_id)
                .values(status='failed')
            )
            await session.commit()
            print(f'Sync failed: {e}')







# --- API Endpoints ---

@router.post("/sources", response_model=schemas.EventSourceRead, status_code=201)
async def create_source(source: schemas.EventSourceCreate, db: AsyncSession = Depends(get_db)):
    """Registers a new event platform source URL."""
    db_source = EventSource(name=source.name, url=str(source.url))
    db.add(db_source)
    await db.commit()
    await db.refresh(db_source)
    return db_source


@router.get("/sources", response_model=List[schemas.EventSourceRead])
async def list_sources(db: AsyncSession = Depends(get_db)):
    """Lists all configured event sources and their connection/sync states."""
    result = await db.execute(select(EventSource))
    return result.scalars().all()


@router.get("/events", response_model=List[schemas.RawEventRead])
async def list_events(db: AsyncSession = Depends(get_db)):
    """Fetches list of parsed events containing the dynamic payloads."""
    result = await db.execute(select(RawEvent))
    return result.scalars().all()


@router.post("/sources/{source_id}/sync")
async def trigger_sync(
    source_id: UUID, 
    background_tasks: BackgroundTasks, 
    db: AsyncSession = Depends(get_db)
):
    """Triggers an async, non-blocking sync pipeline."""
    result = await db.execute(select(EventSource).where(EventSource.id == source_id))
    source = result.scalar_one_or_none()
    
    if not source:
        raise HTTPException(status_code=404, detail="Source platform not registered.")
    
    if source.status == "syncing":
        return {"message": "Crawler is currently active on this source.", "status": "syncing"}
    
    # Update state to syncing immediately
    source.status = "syncing"
    await db.commit()
    
    # Offload crawler execution to FastAPI's asynchronous background runner
    from database import AsyncSessionLocal
    background_tasks.add_task(simulate_crawl_task, source_id, AsyncSessionLocal)
    
    return {"message": "Data pipeline successfully initialized.", "status": "syncing"}
