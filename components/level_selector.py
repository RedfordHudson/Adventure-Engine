from dominate import tags as t

def hud_nav():
    container = t.header(id='hud-nav')

    with container:
        t.h1('LEVEL SELECTOR')
        with t.div(cls='brand-badge'):
            t.span(cls='live-dot', id='ws-indicator')
            t.span('connecting websocket...', cls='badge-text', id='ws-status')
        with t.div(cls='control-row'):
            t.span('Hover orbs')
        t.button('filter',cls='launch-btn')

    return container

def node_card():
    container = t.div(id='node-card')

    with container:
        t.h2(id='node-title')
        t.div(cls='subtitle',id='node-coords')
        t.p(id='node-desc')

        with t.div(id='node-preview-container'):
            t.iframe(id='node-preview-iframe')

        t.button('INITIALIZE DEPLOYMENT',cls='launch-btn',id='node-btn')

    return container