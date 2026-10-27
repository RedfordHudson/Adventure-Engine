const Calendar = (() => {
  const host = document.getElementById('calendar-mount');
  host.className = 'mount calview';
  host.replaceChildren();

  // Node date-times are unreliable right now, so sample times are derived from each id.
  // Flip to false when the real ones are fixed (falls back to samples if a node's times are invalid).
  const SYNTHETIC = true;
  const H0 = 7, H1 = 22, HOUR = 26;                 // visible hours, px per hour
  host.style.setProperty('--hour', HOUR + 'px');

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const startOfWeek = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };  // Monday
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  const hash = s => { let h = 5381; for (const c of String(s)) h = ((h << 5) + h + c.charCodeAt(0)) | 0; return Math.abs(h); };
  const fmtTime = d => d.toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'});
  const fmtDay = d => d.toLocaleDateString([], {month: 'short', day: 'numeric'});

  const baseWeek = startOfWeek(new Date());
  let week = baseWeek, selectedId = null, hoveredId = null;
  const blocks = new Map();                         // id -> block element (current week only)

  // node -> calendar event
  const eventOf = n => {
    const base = {id: n.id, title: n.title, color: n.color};
    if (!SYNTHETIC) {
      const s = new Date(n.raw.start ?? n.raw.start_time), e = new Date(n.raw.end ?? n.raw.end_time);
      if (!isNaN(s) && !isNaN(e) && e > s) return {...base, start: s, end: e};
    }
    const h = hash(n.id);
    const day = h % 14;                                                  // spread over two weeks
    const startH = H0 + 1 + (h >> 4) % 12 + ((h >> 9) % 2) * 0.5;        // 08:00 - 19:30
    const dur = 1 + ((h >> 11) % 4) * 0.5;                               // 1 - 2.5 h
    const start = addDays(baseWeek, day);
    start.setMinutes(Math.round(startH * 60));
    return {...base, start, end: new Date(start.getTime() + dur * 36e5)};
  };

  // ---- static skeleton ----
  const prev = el('button', 'pbtn', '‹'), next = el('button', 'pbtn', '›'), today = el('button', 'pbtn', 'Today');
  const range = el('div', 'cal-range');
  const bar = el('div', 'cal-bar'); bar.append(prev, range, next, today);

  const head = el('div', 'cal-head');
  const dayLabels = Array.from({length: 7}, () => el('div'));
  head.append(el('div'), ...dayLabels);

  const gutter = el('div', 'cal-gutter');
  for (let h = H0; h < H1; h++) {
    const s = el('span', '', `${String(h).padStart(2, '0')}`);
    s.style.top = (h - H0) * HOUR + 1 + 'px';
    gutter.append(s);
  }
  const cols = Array.from({length: 7}, () => el('div', 'cal-col'));
  const grid = el('div', 'cal-grid'); grid.style.height = (H1 - H0) * HOUR + 'px';
  grid.append(gutter, ...cols);
  const scroll = el('div', 'cal-scroll'); scroll.append(grid);
  host.append(bar, head, scroll);

  // ---- blocks ----
  const block = e => {
    const b = el('div', 'cal-block');
    b.style.setProperty('--c', e.color);
    const top = (e.start.getHours() + e.start.getMinutes() / 60 - H0) * HOUR;
    Object.assign(b.style, {
      top: top + 'px',
      height: Math.max((e.end - e.start) / 36e5 * HOUR, 16) + 'px',
      left: (e.lane / e.lanes * 100) + '%',
      width: (100 / e.lanes) + '%',
    });
    b.title = `${e.title}\n${fmtTime(e.start)} – ${fmtTime(e.end)}`;
    b.append(el('b', '', e.title), el('span', '', fmtTime(e.start)));
    b.addEventListener('mouseenter', () => NodeHub.hover(e.id, 'calendar'));
    b.addEventListener('mouseleave', () => NodeHub.hover(null, 'calendar'));
    b.addEventListener('click', ev => { ev.stopPropagation(); NodeHub.select(e.id, 'calendar'); });
    blocks.set(e.id, b);
    return b;
  };

  const paint = () => blocks.forEach((b, id) => {
    b.classList.toggle('sel', id === selectedId);
    b.classList.toggle('hov', id === hoveredId);
  });

  function render() {
    const events = NodeHub.list().map(eventOf);
    blocks.clear();
    const now = new Date();
    cols.forEach((col, i) => {
      const day = addDays(week, i);
      col.replaceChildren();
      dayLabels[i].textContent = day.toLocaleDateString([], {weekday: 'short'}).slice(0, 2) + ' ' + day.getDate();
      dayLabels[i].classList.toggle('today', sameDay(day, now));

      const evs = events.filter(e => sameDay(e.start, day)).sort((a, b) => a.start - b.start);
      const laneEnds = [];                          // simple lane packing for overlaps
      evs.forEach(e => {
        let l = laneEnds.findIndex(end => end <= e.start);
        if (l < 0) l = laneEnds.length;
        laneEnds[l] = e.end; e.lane = l;
      });
      evs.forEach(e => { e.lanes = laneEnds.length; col.append(block(e)); });

      const nowH = now.getHours() + now.getMinutes() / 60;
      if (sameDay(day, now) && nowH >= H0 && nowH <= H1) {
        const line = el('div', 'cal-now'); line.style.top = (nowH - H0) * HOUR + 'px'; col.append(line);
      }
    });
    range.textContent = `${fmtDay(week)} – ${fmtDay(addDays(week, 6))}`;
    paint();
  }

  // jump to the week containing a node's event and scroll it into view
  function reveal(id) {
    const n = NodeHub.get(id); if (!n) return;
    const ws = startOfWeek(eventOf(n).start);
    if (+ws !== +week) { week = ws; render(); }
    const b = blocks.get(id); if (!b) return;
    const top = parseFloat(b.style.top), h = b.offsetHeight;
    if (top < scroll.scrollTop || top + h > scroll.scrollTop + scroll.clientHeight)
      scroll.scrollTo({top: Math.max(0, top - HOUR), behavior: 'smooth'});
  }

  // ---- wiring ----
  prev.onclick  = () => { week = addDays(week, -7); render(); };
  next.onclick  = () => { week = addDays(week, 7);  render(); };
  today.onclick = () => { week = baseWeek;          render(); };
  scroll.addEventListener('click', () => NodeHub.select(null, 'calendar'));    // empty space deselects

  NodeHub.on('nodes', render);
  NodeHub.on('select', ({id}) => { selectedId = id; if (id != null) reveal(id); paint(); });
  NodeHub.on('hover',  ({id}) => { hoveredId = id; paint(); });

  render();
  return {render, get week() { return week; }};
})();