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

from typing import Any
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID

class RawEventIn(BaseModel):                 # validates data before it touches the DB
    source_id: UUID
    api_id: str = Field(max_length=500)
    url: str
    title: str = Field(min_length=1, max_length=500)
    start_time: AwareDatetime                # rejects naive datetimes
    address: str | None = Field(None, max_length=500)
    lat: float | None = Field(None, ge=-90, le=90)
    lon: float | None = Field(None, ge=-180, le=180)
    location_approximate: bool = False
    cover_url: str | None = None
    raw_payload: dict[str, Any]


class RawEventRead(RawEventIn):              # same fields, plus id, built from ORM rows
    id: UUID
    model_config = ConfigDict(from_attributes=True)
