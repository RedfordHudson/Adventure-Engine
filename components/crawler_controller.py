from dominate import tags as t

from utils.crawler_controller import SOURCES

def crawler_controller():
    container = t.header(id='crawler-controller')

    with container:
        t.h1('crawler controller')
        
        for name in SOURCES.keys():
            crawler_thing(name)

        # t.button('sync all',
        #     cls='launch-btn'
        # )

    return container

import json

def crawler_thing(name):
    container = t.div()

    with container:
        t.span(cls='live-dot')
        t.span(name, cls='badge-text')
        # t.span('synced', cls='badge-text')
        # t.span('idle', id=f'status-indicator-{name}',cls='status-indicator')
        t.span('idle', id=f'status-indicator-{name}',cls='status-indicator')

        t.button('sync',
            cls='launch-btn',
            **{
                'hx-post': '/crawler/sync',
                'hx-trigger': 'click',
                'hx-vals': json.dumps({'name': name}),
                'hx-swap': 'none'
            },
        )

        # t.button('refresh',
        #     cls='launch-btn',
        #     **{
        #         'hx-post': '/crawler/refresh',
        #         'hx-trigger': 'click',
        #         'hx-vals': json.dumps({'name': name}),
        #         'hx-swap': 'none'
        #     },
        # )
        
    return container