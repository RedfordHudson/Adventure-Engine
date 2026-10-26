
/* ═════════ Window manager (generic, content-agnostic) ═════════ */
const Deck = (() => {
    const docks = [...document.querySelectorAll('.dock')];
    const registry = new Map();
    const toggles = document.getElementById('toggles');

    function create({ id, title, sub = '', glyph = '◈', accent = 'cyan', home = 'center', mountId }) {
        const el = document.createElement('article');
        el.className = 'win'; el.dataset.accent = accent; el.dataset.home = home; el.id = 'win-' + id;
        el.innerHTML = `
      <header class="win-head">
        <span class="win-glyph">${glyph}</span>
        <span class="win-title">${title}<small>${sub}</small></span>
        <button class="wbtn" data-act="min" title="Collapse">–</button>
        <button class="wbtn" data-act="float" title="Float / dock">◱</button>
        <button class="wbtn" data-act="close" title="Close">×</button>
      </header>
      <div class="win-body"><div class="mount" id="${mountId}"><span>${title} mount</span></div></div>`;
        registry.set(id, el);
        dockTo(el, home);
        el.querySelector('.win-head').addEventListener('pointerdown', e => startDrag(e, el));
        el.addEventListener('pointerdown', () => raise(el));
        el.querySelector('.win-head').addEventListener('click', e => {
            const a = e.target.dataset.act; if (!a) return;
            if (a === 'min') el.classList.toggle('min');
            if (a === 'float') el.classList.contains('floating') ? dockTo(el, el.dataset.home) : float(el);
            if (a === 'close') setVisible(id, false);
        });
        const chip = document.createElement('button');
        chip.className = 'chip on'; chip.textContent = title; chip.dataset.id = id;
        chip.onclick = () => setVisible(id, el.hidden);
        toggles.appendChild(chip);
        return el;
    }

    function setVisible(id, show) {
        const el = registry.get(id); el.hidden = !show;
        el.style.display = show ? '' : 'none';
        toggles.querySelector(`[data-id="${id}"]`).classList.toggle('on', show);
    }

    function dockTo(el, region, beforeEl = null) {
        const dock = docks.find(d => d.dataset.dock === region);
        el.classList.remove('floating'); el.style.cssText = el.style.display ? 'display:' + el.style.display : '';
        dock.insertBefore(el, beforeEl);
    }

    function float(el, rect = el.getBoundingClientRect()) {
        el.classList.add('floating');
        Object.assign(el.style, {
            left: rect.left + 'px', top: rect.top + 'px',
            width: Math.max(rect.width, 280) + 'px', height: Math.max(Math.min(rect.height, 420), 180) + 'px'
        });
        document.body.appendChild(el); raise(el);
    }

    let z = 200; const raise = el => { if (el.classList.contains('floating')) el.style.zIndex = ++z; };

    function dockAt(x, y) {
        return docks.find(d => { const r = d.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; });
    }

    function startDrag(e, el) {
        if (e.target.closest('.wbtn') || e.button > 0) return;
        const rect = el.getBoundingClientRect();
        const dx = e.clientX - rect.left, dy = e.clientY - rect.top;
        let moved = false, target = null;
        const head = window; e.preventDefault(); // window listeners: reparenting the window mid-drag would drop pointer capture

        const move = ev => {
            if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 5) return;
            if (!moved) { moved = true; float(el, rect); el.classList.add('lifted'); document.body.classList.add('dragging'); }
            el.style.left = ev.clientX - dx + 'px'; el.style.top = ev.clientY - dy + 'px';
            el.style.pointerEvents = 'none';
            const d = dockAt(ev.clientX, ev.clientY);
            if (d !== target) { target?.classList.remove('over'); d?.classList.add('over'); target = d; }
        };
        const up = ev => {
            head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', up);
            head.removeEventListener('pointercancel', up);
            el.style.pointerEvents = ''; el.classList.remove('lifted');
            document.body.classList.remove('dragging');
            docks.forEach(d => d.classList.remove('over'));
            if (moved && target) {
                const sibs = [...target.children].filter(c => c !== el && c.classList.contains('win'));
                const vertical = getComputedStyle(target).flexDirection === 'column';
                const next = sibs.find(s => {
                    const r = s.getBoundingClientRect();
                    return vertical ? ev.clientY < r.top + r.height / 2 : ev.clientX < r.left + r.width / 2;
                });
                dockTo(el, target.dataset.dock, next || null);
                el.dataset.home = target.dataset.dock;
            }
        };
        head.addEventListener('pointermove', move); head.addEventListener('pointerup', up); head.addEventListener('pointercancel', up);
    }

    return { create, setVisible, dockTo, registry };
})();

/* ═════════ Modules ═════════ */
const layout = [
    { id: 'map', title: 'Map', sub: '// where', glyph: '◈', accent: 'cyan', home: 'center', mountId: 'map-mount' },
    { id: 'node', title: 'Node', sub: '// what', glyph: '✦', accent: 'amber', home: 'left', mountId: 'node-mount' },
    { id: 'calendar', title: 'Calendar', sub: '// when', glyph: '⌛', accent: 'magenta', home: 'right', mountId: 'calendar-mount' },
    { id: 'control', title: 'Control', sub: '// how', glyph: '⚙', accent: 'violet', home: 'bottom', mountId: 'control-mount' },
];
layout.forEach(Deck.create);

document.getElementById('reset').onclick = () => {
    // layout.forEach(m => { const el = Deck.registry.get(m.id); el.classList.remove('min'); Deck.dockTo(el, m.home); el.dataset.home = m.home; Deck.setVisible(m.id, true); });
    const layout = JSON.parse(document.getElementById('layout').textContent)
        .map(m => ({ ...m, mountId: m.id + '-mount' }));
};

/* Dock edge grips: drag to resize, double-click to reset */
document.querySelectorAll('.dock').forEach(d => {
    const cfg = { left: ['e', '--left-w'], right: ['w', '--right-w'], bottom: ['n', '--bottom-h'] }[d.dataset.dock];
    if (!cfg) return;
    const [edge, prop] = cfg, root = document.documentElement;
    const g = document.createElement('div'); g.className = 'grip'; g.dataset.edge = edge; d.prepend(g);
    g.addEventListener('dblclick', () => root.style.removeProperty(prop));
    g.addEventListener('pointerdown', e => {
        e.preventDefault(); g.classList.add('active'); document.body.classList.add('resizing');
        const move = ev => {
            const r = d.getBoundingClientRect();
            const v = edge === 'e' ? ev.clientX - r.left : edge === 'w' ? r.right - ev.clientX : r.bottom - ev.clientY;
            const max = edge === 'n' ? innerHeight * .6 : innerWidth * .5;
            root.style.setProperty(prop, Math.round(Math.min(Math.max(v, 140), max)) + 'px');
        };
        const up = () => {
            window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
            g.classList.remove('active'); document.body.classList.remove('resizing');
        };
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    });
});

/* Control-panel pods: small mounts in the top bar */
const Pods = (() => {
    const host = document.getElementById('control-mount'); // now lives inside the Control window
    host.className = 'mount pods'; host.innerHTML = '';
    const add = (id, label) => {
        const el = document.createElement('div'); el.className = 'pod'; el.id = 'pod-' + id;
        el.innerHTML = `<span class="pod-label">${label}</span><span class="pod-mount" id="${id}-mount"></span>`;
        host.appendChild(el); return el.querySelector('.pod-mount');
    };
    // lamp: LED + text. states: idle | ok | busy | err
    const lamp = m => {
        m.insertAdjacentHTML('afterbegin', '<i class="led" data-s="idle"></i><span class="pod-text"></span>');
        const led = m.querySelector('.led'), txt = m.querySelector('.pod-text');
        return { set(state, text) { led.dataset.s = state; if (text != null) txt.textContent = text; } };
    };

    // websocket status (also drives the footer feed LED)
    const wsL = lamp(add('ws', 'Socket')); wsL.set('idle', 'offline');
    const feedLed = document.getElementById('feed-led'), feedTxt = document.getElementById('feed-text');
    let blipT;
    const ws = {
        set(state, text) {
            wsL.set(state, text);
            feedLed.dataset.s = state;
            feedTxt.textContent = 'Feed: ' + (text || state);
        },
        blip() {                       // brief flash on each incoming message
            feedLed.classList.add('blip');
            clearTimeout(blipT);
            blipT = setTimeout(() => feedLed.classList.remove('blip'), 120);
        },
    };

    // crawler controller: status lamp + run/pause + sync
    const cM = add('crawler', 'Crawler'), cL = lamp(cM); cL.set('idle', 'paused');
    cM.insertAdjacentHTML('beforeend', '<button class="pbtn" data-a="toggle" title="Start / pause">▶</button><button class="pbtn" data-a="sync">⟳ Sync</button>');
    let running = false;
    const rest = () => cL.set(running ? 'ok' : 'idle', running ? 'crawling' : 'paused');
    cM.addEventListener('click', e => {
        const a = e.target.dataset.a; if (!a) return;
        if (a === 'toggle') {
            running = !running; e.target.textContent = running ? '❚❚' : '▶'; rest();
            document.dispatchEvent(new CustomEvent('crawler:toggle', { detail: { running } }));
        }
        if (a === 'sync') {
            cL.set('busy', 'syncing'); document.dispatchEvent(new CustomEvent('crawler:sync'));
            setTimeout(rest, 1400); // demo only: call Pods.crawler.set(...) from your real sync handler instead
        }
    });
    const crawler = { set: cL.set, get running() { return running; } };

    // spare slot
    add('aux', 'Aux').innerHTML = '<span class="pod-text" style="color:var(--dim)">slot</span>';

    return { add, lamp, ws, crawler };
})();

/* Clock */
const clock = document.getElementById('clock');
setInterval(() => clock.textContent = new Date().toLocaleTimeString([], { hour12: false }), 1000);
clock.textContent = new Date().toLocaleTimeString([], { hour12: false });

/* Hook points for your implemented code:
   new LevelMap({container: document.getElementById('map-mount')}) etc.
   Mount points: #map-mount  #calendar-mount  #node-mount
   Status: Pods.ws.set('ok','linked')   Pods.crawler.set('busy','crawling')
   Events (on document): 'crawler:sync', 'crawler:toggle'   Extra pod: Pods.add(id,label) → mount element */
