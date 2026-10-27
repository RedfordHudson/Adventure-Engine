# Dock regions must match the CSS/JS: data-dock='left|center|right|bottom'
DOCKS = ['left', 'center', 'right', 'bottom']

MODULES = [
    dict(id='map',      title='Map',      sub='// where', glyph='◈', accent='cyan',    home='center',   script='modules/map.js'),
    dict(id='node',     title='Node',     sub='// what',  glyph='✦', accent='amber',   home='left'),
    dict(id='calendar', title='Calendar', sub='// when',  glyph='⌛', accent='magenta', home='right'),
    dict(id='control',  title='Control',  sub='// utility',   glyph='⚙', accent='violet',  home='bottom', script='modules/crawler_controller.js'),
]
# accents available in deck.css: cyan | magenta | amber | violet