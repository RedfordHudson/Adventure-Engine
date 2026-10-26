import json

test_coordinates = [
    {"lat": 32.7157, "lon": -117.1611},  # Downtown San Diego
    {"lat": 32.7328, "lon": -117.1961},  # Point Loma
    {"lat": 32.8328, "lon": -117.2713},  # La Jolla
    {"lat": 32.6401, "lon": -117.0842},  # Chula Vista
    {"lat": 33.1959, "lon": -117.3795},  # Oceanside
]



TEMPLATE = {
    'id': 1,
    # 'title': 'null',
    # 'coords': 'null',
    # 'desc': 'null',
    # 'pos': [0, 0, 0],
    'towerHeight': 5,
    'color': 61695,  # 0x00f0ff in decimal integer format for clean JSON transport
    'imageUrl': 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=256&q=80',
    'url':'https://fastapi.tiangolo.com/'
} |     {"lat": 32.7157, "lon": -117.1611}  # Downtown San Diego

TEMPLATE =     {
      "id": "node-1",
      "title": "San Diego",
      "lat": 32.7157,
      "lon": -117.1611,
      "altitude": 0,
      "color": 16711935,
      "towerHeight": 8,
      "desc": "Test node"
    }

from utils.geospatial import address2coordinates

def hydrate_template(i,e):
    node = TEMPLATE.copy()

    lat,lon = address2coordinates(e['location'])

    node |= {
        'id':i,
        'title':e['title'],
        # 'coords':e['location'],
        'description':e['start_time'],
        # 'pos':[0,i+1,i*3],
        # 'towerHeight':5,
        # 'lat':lat,
        # 'lon':lon,
        'imageURL':e['image_link'],
    }

    return node

# def get_events():
#     data = json.load(open('./crawlers/luma.json','r'))
#     level_nodes = [hydrate_template(i,event) for i,event in enumerate(data)]
#     return level_nodes

def interim(raw):

    level_nodes = [hydrate_template(i,event) for i,event in enumerate(raw)][:2]

    return level_nodes