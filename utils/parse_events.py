import json

TEMPLATE = {
    'id': 1,
    'title': 'null',
    'coords': 'null',
    'desc': 'null',
    'pos': [0, 0, 0],
    'towerHeight': 0,
    'color': 61695,  # 0x00f0ff in decimal integer format for clean JSON transport
    'imageUrl': 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=256&q=80',
    'url':'https://fastapi.tiangolo.com/'
}

def hydrate_template(i,event):
    node = TEMPLATE.copy()

    node |= {
        'id':i,
        'title':event['title'],
        # 'coords':event['location'],
        'desc':event['start_time'],
        'pos':[0,i+1,i*3],
        'towerHeight':i
    }

    return node

# def get_events():
#     data = json.load(open('./crawlers/luma.json','r'))
#     level_nodes = [hydrate_template(i,event) for i,event in enumerate(data)]
#     return level_nodes

def interim(raw):

    level_nodes = [hydrate_template(i,event) for i,event in enumerate(raw)]

    return level_nodes