SOURCES = {
    'luma':{},
    '19hz':{},
    'fl':{},
    'resident advisor':{},
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
from utils.schemas import RawEventRead

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

    def format_event(self,e):
        return RawEvent(
            source_id=None,  # Handled automatically by push_events()
            title=e['title'],
            # start_time=e['start_time'],
            start_time=datetime.now(timezone.utc),
            raw_payload={
                'payload':e,
            }
        )

    def push_events(self, events):
        rows = []

        for e in events:
            e = self.format_event(e)
            e.source_id = self.source_id
            self.session.add(e)
            rows.append(e)

        self.session.flush()

        for e in rows:
            validated = RawEventRead.model_validate(e)

        self.session.commit()


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
        url = db.fetch_url()
        result = self.crawl(url)
        events = json.loads(result['extracted_content'])

        # 3. Save Events
        db.push_events(events)

        # 4. Success Completion Hooks
        db.update_status('idle')
        db.update_sync_time()
        self.notify('idle')

    def crawl(self, url):
        SURROGATE = False

        if not SURROGATE:
            from utils.crawler import main
            return asyncio.run(main(url))
        
        return self.surrogate(url)

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