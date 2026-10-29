SOURCES = {
    'luma':{},
    # '19hz':{},
    # 'fl':{},
    # 'resident advisor':{},
}

import os
os.system('cls' if os.name == 'nt' else 'clear')
print(os.getcwd())
print('IMPORTING LIBRARIES')

import random, time, uuid, httpx, asyncio, json
from datetime import datetime, timezone
from sqlalchemy import create_engine, select, update
from sqlalchemy.orm import sessionmaker

# Import your database tables from your database module
from utils.database import EventSource, RawEvent
from utils.schemas import RawEventRead, RawEventIn
from utils.geospatial import address2coordinates

print('DONE IMPORTING LIBRARIES')

# 🌟 Configure the clean synchronous DB Engine (Using standard sqlite driver)
DATABASE_URL = 'sqlite:///./data/database.db'
engine = create_engine(DATABASE_URL, connect_args={'check_same_thread': False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class DB:
    def __init__(self, source_id: uuid.UUID):
        self.source_id = source_id
        self.session = None

    def __enter__(self):
        # Allows using DB inside a 'with' block to automate session lifespan.
        self.session = SessionLocal()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        # Ensures sessions cleanly commit on success, or rollback on crashes.
        if exc_type is not None:
            print(f'⚠️ Rolling back transaction due to error: {exc_val}')
            self.session.rollback()
        self.session.close()

    def update_status(self, new_status='syncing'):
        # Synchronously updates crawler metadata status in DB.
        self.session.execute(
            update(EventSource)
            .where(EventSource.id == self.source_id)
            .values(status=new_status)
        )
        self.session.commit()

    def update_sync_time(self):
        # Sets the exact timezone-aware time of completion.
        now = datetime.now(timezone.utc)
        self.session.execute(
            update(EventSource)
            .where(EventSource.id == self.source_id)
            .values(last_sync_time=now)
        )
        self.session.commit()

    def fetch_url(self) -> str:
        # Queries the source platform's target scraping URL.
        res = self.session.execute(
            select(EventSource).where(EventSource.id == self.source_id)
        )
        source = res.scalar_one()
        return source.url

    def to_raw_event(self,e) -> RawEvent:
        data = RawEventIn(
            source_id=self.source_id,
            api_id=e['id'],
            url=e['url'],
            title=e['title'],
            start_time=e['start'],          # ISO string; pydantic parses to aware datetime
            address=e['address'],
            lat=e['lat'], lon=e['lon'],
            location_approximate=e['location_approximate'],
            cover_url=e['cover_url'],
            raw_payload=e,
        )
        
        raw_event = RawEvent(**data.model_dump())

        return raw_event

    def push_events(self, events):
        rows = []

        for e in events:
            e = self.to_raw_event(e)
            self.session.add(e)
            rows.append(e)

        self.session.flush()

        for e in rows:
            RawEventRead.model_validate(e)

        self.session.commit()

    def add_new_events(self, events: list[dict]) -> list[RawEvent]:
        # dedupe within the batch as well
        candidates: dict[str, RawEvent] = {}
        for raw in events:
            obj = self.to_raw_event(raw)
            candidates.setdefault(obj.api_id, obj)

        if not candidates:
            return []

        existing = set(self.session.scalars(
            select(RawEvent.api_id).where(
                RawEvent.source_id == self.source_id,
                RawEvent.api_id.in_(list(candidates)),
            )
        ))

        new = [obj for api_id, obj in candidates.items() if api_id not in existing]
        if new:
            self.session.add_all(new)
            self.session.commit()
        return new


class Crawler:
    def __init__(self, source_id: str):
        self.source_id = uuid.UUID(str(source_id))

    def main(self):
        with DB(self.source_id) as db:
            self.process(db)
        return

        # 🌟 Leverage the 'with' context manager to safely execute transactions [source: 3, 5]
        with DB(self.source_id) as db:
            try:
                self.process(db)
                print('🎉 Sync completed successfully.')

            except Exception as e:
                # Set DB state to failed
                db.update_status('failed')
                self.notify('failed')
                print(f'❌ Sync failed: {e}')
    
    def process(self,db):
        # 1. Update status to syncing
        db.update_status('syncing')
        self.notify('syncing')

        # 2. Get URL & Run Scraper
        # url = db.fetch_url()
        # result = self.crawl(url)
        events = self.crawl()
        # events = json.loads(result['extracted_content'])

        # 3. Save Events
        # db.push_events(events)
        db.add_new_events(events)

        # 4. Success Completion Hooks
        db.update_status('idle')
        db.update_sync_time()
        self.notify('idle')

    def crawl(self):

        from crawlers.luma import main
        return asyncio.run(main())
    
        # SURROGATE = False

        # if not SURROGATE:
        #     from utils.crawler import main
        #     return asyncio.run(main(url))
        
        # return self.surrogate(url)

    def surrogate(self, url):
        # 🌟 Synchronous time block (no asyncio required) [source: 4]
        time.sleep(5)  # Simulate network latency [source: 4]

        new_event = RawEvent(
            source_id=None,  # Handled automatically by push_events()
            title=f'test{random.randint(0, 100000)}',
            start_time=datetime.now(timezone.utc),
            raw_payload={
                'payload': '...',
                'url': url
            }
        )
        return [new_event]

    def notify(self, status):
        # Triggers direct, non-proxied visual socket feedback to the web server.
        try:
            # trust_env=False ensures corporate proxies on restricted networks are bypassed
            with httpx.Client(trust_env=False, timeout=5.0) as client:
                response = client.post(
                    'http://127.0.0.1:8000/internal/notify-status',
                    params={'source_id': str(self.source_id), 'status': status}
                )
                print(f'Notified web server ({status}) -> Code: {response.status_code}')
        except Exception as e:
            print(f'Failed to notify web server: {e}')


if __name__ == '__main__':

    # Hardcoded test UUID for local development validation
    test_source_id = '592f314e-38a1-4034-ae1f-a232c77264bf'
    
    # Run fully synchronous execution pipeline! No asyncio loop setup required.
    Crawler(test_source_id).main()
    # Crawler(test_source_id).notify('finally')