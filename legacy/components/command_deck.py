from dominate import tags as t

def control_panel():
    container = t.header(id='bar')

    with container:
        t.div('adventure engine',cls='brand')
        t.nav(cls='chips', id='toggles')
        t.div(cls='spacer')
        t.button('⟲ reset layout',cls='chip ghost', id='reset')
        t.div('--:--:--',id='clock')

    return container

def dock_regions():
    container = t.main(id='deck')

    with container:
        for location in ['left','center','right','bottom']:
            t.section(cls='dock',data_dock=location)
            # t.section(cls='dock')

    return container

def footer():
    container = t.footer(id='status')

    with container:
        with t.span():
            t.i(cls='ok')
            t.span('deck online')
        with t.span():
            t.i(id='feed-led')
            t.span('feed: online',id='feed-text')
        t.span(cls='spacer')
        t.span('drag title bars to re-dock')
    
    return container