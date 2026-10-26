from utils.schemas import RawEventRead

def interim(events):
    
    processor = lambda e: RawEventRead.model_validate(e).model_dump()
    nodes = [processor(e) for e in events]

    nodes = [e for e in nodes if e['lat']]

    return nodes