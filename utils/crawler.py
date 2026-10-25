from crawl4ai import (
    AsyncWebCrawler,
    CrawlerRunConfig,
    LLMConfig, 
    LLMExtractionStrategy, 
    CacheMode
)

from pydantic import BaseModel, Field
import time
import asyncio
from datetime import datetime
# from utils.database import RawEvent

class Event(BaseModel):
    title: str
    start_time: datetime


class EventList(BaseModel):
    events: list[Event]

strategy = LLMExtractionStrategy(
    llm_config=LLMConfig(
        provider="ollama/dolphin3:latest",
    ),
    schema=EventList.model_json_schema(),
    extraction_type="schema",
    instruction="""
Extract every individual event listing from the supplied Markdown table.

For each event:
- Extract the event's title and start time from its corresponding columns.
""",
    input_format="markdown",
    apply_chunking=False,
    extra_args={"temperature": 0},
    verbose=True,
)

async def main(url: str):
    config = CrawlerRunConfig(
        cache_mode=CacheMode.BYPASS,
        word_count_threshold=5,
        page_timeout=80000,
        extraction_strategy=strategy,
    )

    start = time.perf_counter()

    async with AsyncWebCrawler() as crawler:
        print("Starting crawl...")
        crawl_start = time.perf_counter()

        result = await crawler.arun(url=url, config=config)

        print(f"Total elapsed: {time.perf_counter() - start:.1f}s")
        print(f"Result success: {result.success}")

        # if result.extracted_content:
        #     print(result.extracted_content)

        return result.model_dump()