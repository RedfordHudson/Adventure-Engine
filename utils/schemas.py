from pydantic import BaseModel, HttpUrl
from datetime import datetime
from typing import Optional, Dict, Any, List
from uuid import UUID

# --- Source Schemas ---

class EventSourceBase(BaseModel):
    name: str
    url: HttpUrl

class EventSourceCreate(EventSourceBase):
    pass

class EventSourceRead(EventSourceBase):
    id: UUID
    last_sync_time: Optional[datetime] = None
    status: str

    class Config:
        from_attributes = True

# --- Event Schemas ---

class RawEventRead(BaseModel):
    id: UUID
    source_id: UUID
    title: str
    start_time: datetime
    location: str
    link: str
    image_link: str
    raw_payload: Dict[str, Any]  # Matches JSONB structure dynamically

    class Config:
        from_attributes = True
