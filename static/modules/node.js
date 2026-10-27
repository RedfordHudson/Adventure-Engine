const NodeCard = (() => {
  const host = document.getElementById('node-mount');
  host.className = 'mount nodecard';
  host.replaceChildren();                         // drop the placeholder

  // fields rendered explicitly; everything else on the event is listed generically
  const KNOWN = new Set(['id', 'title', 'name', 'image_link', 'image', 'lng', 'lon', 'longitude',
    'lat', 'latitude', 'height', 'altitude', 'color']);
  let selectedId = null, lastSig = '';

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;   // textContent only: event data is never parsed as HTML
    return n;
  };

  const safeImg = link => {                         // http(s) and data:image only
    if (!link || typeof link !== 'string') return null;
    try {
      const u = new URL(link, location.href);
      return (u.protocol === 'http:' || u.protocol === 'https:' || link.startsWith('data:image/')) ? u.href : null;
    } catch { return null; }
  };

  const toColor = c => {                            // THREE.Color | css string | 0xRRGGBB
    let v = c?.getHexString ? '#' + c.getHexString()
      : typeof c === 'number' ? '#' + c.toString(16).padStart(6, '0')
        : c;
    return typeof v === 'string' && CSS.supports('color', v) ? v : '#ffb830';
  };

  const fmt = v => {
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return s.length > 300 ? s.slice(0, 300) + '…' : s;
  };

  // accepts the map's normalized node or a raw event object from the feed
  const toView = (n, id, color) => {
    const src = n.raw ?? n;
    return {
      id: String(id ?? n.id ?? ''),
      title: n.title ?? n.name ?? 'Untitled',
      image: safeImg(n.image ?? n.image_link),
      lng: Number(n.lng ?? n.lon ?? n.longitude),
      lat: Number(n.lat ?? n.latitude),
      height: Number(n.height ?? n.altitude ?? 0) || 0,
      color: toColor(color ?? n.color ?? src.color),
      extras: Object.entries(src).filter(([k, v]) => !KNOWN.has(k) && v != null),
    };
  };

  function clear() {
    selectedId = null; lastSig = '';
    host.style.removeProperty('--c');
    host.replaceChildren(el('div', 'nc-empty', 'No target locked'));
  }

  function show(n, id, color) {
    const v = toView(n, id, color);
    selectedId = v.id;
    lastSig = JSON.stringify(n.raw ?? n);
    host.style.setProperty('--c', v.color);

    const head = el('div', 'nc-head');
    head.append(el('span', 'nc-tag', 'LOCKED'), el('span', 'nc-title', v.title));

    const img = el('div', 'nc-img');
    if (v.image) {
      const i = document.createElement('img');
      i.alt = ''; i.loading = 'lazy'; i.referrerPolicy = 'no-referrer';
      i.onerror = () => { i.remove(); img.classList.add('empty'); };
      i.src = v.image;
      img.append(i);
    } else img.classList.add('empty');

    const rows = el('dl', 'nc-rows');
    const row = (k, val) => rows.append(el('dt', '', k), el('dd', '', val));
    row('ID', v.id);
    if (Number.isFinite(v.lat) && Number.isFinite(v.lng)) row('Coords', `${v.lat.toFixed(5)}, ${v.lng.toFixed(5)}`);
    row('Altitude', v.height ? `${Math.round(v.height)} m` : '—');
    v.extras.forEach(([k, val]) => row(k, fmt(val)));

    host.replaceChildren(head, img, rows);
    host.scrollTop = 0;
  }

  // map -> card
  // document.addEventListener('node:select', e => show(e.detail));

  NodeHub.on('select', ({ id }) => {
    const n = id == null ? null : NodeHub.get(id);
    n ? show(n.raw, n.id, n.color) : clear();
  });
  host.addEventListener('pointerenter', () => selectedId != null && NodeHub.hover(selectedId, 'node'));
  host.addEventListener('pointerleave', () => NodeHub.hover(null, 'node'));

  // feed -> card: refresh the selected event if its data changed, clear it if it disappeared
  Feed.on('data_stream', msg => {
    if (selectedId == null || !Array.isArray(msg.data)) return;
    const fresh = msg.data.find((n, i) => String(n.id ?? i) === selectedId);
    if (!fresh) return clear();
    if (JSON.stringify(fresh) !== lastSig) show(fresh, selectedId, NodeHub.get(selectedId)?.color);
  });

  clear();
  return { show, clear, get selected() { return selectedId; } };
})();

// IIFE : immediately invoked function expression
