// Shared state for all node "lenses": node list, hovered id, selected id.
// Load after feed.js, before module scripts.
const NodeHub = (() => {
  const PALETTE = ['#00f0ff', '#ff2bd6', '#fcee0a', '#39ff14', '#b026ff', '#ff6a00'];   // same order as LevelMap.PALETTE
  const bus = new EventTarget();
  let items = new Map(), selected = null, hovered = null, sig = '';

  const emit = (type, detail) => bus.dispatchEvent(new CustomEvent(type, {detail}));
  const on = (type, fn) => {                       // 'nodes' | 'select' | 'hover'; returns an unsubscribe fn
    const h = e => fn(e.detail);
    bus.addEventListener(type, h);
    return () => bus.removeEventListener(type, h);
  };

  const toColor = (c, i) => {
    const v = typeof c === 'number' ? '#' + c.toString(16).padStart(6, '0') : c;
    return typeof v === 'string' && CSS.supports('color', v) ? v : PALETTE[i % PALETTE.length];
  };

  const get = id => items.get(String(id));
  const list = () => [...items.values()];

  function set(data) {
    if (!Array.isArray(data)) return;
    const s = JSON.stringify(data);
    if (s === sig) return;                         // identical feed message: nothing to do
    sig = s;
    items = new Map(data.map((raw, i) => {         // same id fallback (array index) as LevelMap
      const id = String(raw.id ?? i);
      return [id, {id, index: i, title: raw.title ?? raw.name ?? `Node ${i}`, color: toColor(raw.color, i), raw}];
    }));
    if (selected != null && !items.has(selected)) select(null, 'hub');
    if (hovered != null && !items.has(hovered)) hover(null, 'hub');
    emit('nodes', {});
  }

  function select(id, source) {
    id = id == null ? null : String(id);
    if (id === selected) return;
    selected = id; emit('select', {id, source});
  }
  function hover(id, source) {
    id = id == null ? null : String(id);
    if (id === hovered) return;
    hovered = id; emit('hover', {id, source});
  }

  Feed.on('data_stream', m => set(m.data));

  return {on, get, list, set, select, hover,
          get selected() { return selected; }, get hovered() { return hovered; }};
})();