import httpx

URL = "https://api.luma.com/discover/get-paginated-events"
PLACE = "discplace-OgfEAh5KgfMzise"   # Los Angeles

async def fetch_page(client: httpx.AsyncClient, **extra) -> dict:
    r = await client.get(URL, params={"discover_place_api_id": PLACE,
                                      "pagination_limit": 25, **extra})
    r.raise_for_status()
    return r.json()

def parse_entry(e: dict) -> dict:
    ev = e["event"]
    geo = ev.get("geo_address_info") or {}
    coord = ev.get("coordinate") or {}
    ti = e.get("ticket_info") or {}
    price = ti.get("price") or {}
    hidden = ev.get("geo_address_visibility") != "public" or geo.get("mode") == "obfuscated"

    return {
        "id": e["api_id"],
        "title": ev["name"],
        "start": ev["start_at"],
        "end": ev.get("end_at"),
        "timezone": ev.get("timezone"),
        "url": f"https://luma.com/{ev['url']}",
        "lat": coord.get("latitude"),
        "lon": coord.get("longitude"),
        "location_approximate": hidden,
        "venue": None if hidden else geo.get("address"),
        "address": None if hidden else geo.get("full_address"),
        "city": geo.get("city"),
        "free": bool(ti.get("is_free")),
        "price_cents": price.get("cents"),
        "price_min_cents": price.get("min_cents"),
        "price_max_cents": (ti.get("max_price") or {}).get("cents"),
        "sold_out": bool(ti.get("is_sold_out")),
        "status": e.get("registration_availability"),
        "hosts": [h["name"] for h in e.get("hosts", [])],
        "guest_count": e.get("guest_count"),
        "cover_url": ev.get("cover_url"),
    }

async def main():
    async with httpx.AsyncClient(timeout=15, headers={
        "User-Agent": "event-crawler/0.1 (your_real_email@domain.com)"}) as client:
        data = await fetch_page(client)
        events = [parse_entry(e) for e in data['entries']]
        return events
        # print(len(events), [k for k in data if k != "entries"])  # look for cursor keys

if __name__=='__main__':
    import asyncio
    # events = await main()
    events = asyncio.run(main())
    # print(events)

    import json
    json.dump(events,open('data/luma_sample.json','w'))