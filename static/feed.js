// Owns the websocket. Modules subscribe by event_type; nothing else touches the socket.
// Load after deck.js (needs Pods), before module scripts.
const Feed = (() => {
  const subs = new Map();            // event_type -> Set<handler>
  let sock = null, retry = 0, timer = null, wanted = false, url = null;

  const on = (type, fn) => {         // '*' receives everything; returns an unsubscribe fn
    if (!subs.has(type)) subs.set(type, new Set());
    subs.get(type).add(fn);
    return () => subs.get(type)?.delete(fn);
  };
  const bind = (obj, map) =>         // subscribe several methods of a class instance
    Object.entries(map).map(([type, fn]) => on(type, fn.bind(obj)));

  function dispatch(msg) {           // also usable from the console: Feed.emit({...})
    for (const key of [msg?.event_type, '*']) {
      if (!key) continue;
      subs.get(key)?.forEach(fn => {
        try { fn(msg); } catch (e) { console.error(`[feed:${key}]`, e); }  // one bad handler can't break the others
      });
    }
  }

  function open() {
    clearTimeout(timer);
    Pods.ws.set('busy', retry ? 'reconnecting' : 'connecting');
    const s = sock = new WebSocket(url);

    s.onopen = () => { retry = 0; Pods.ws.set('ok', 'linked'); };
    s.onmessage = e => {
      let msg; try { msg = JSON.parse(e.data); } catch { return; }   // ignore non-JSON frames
      Pods.ws.blip();
      dispatch(msg);
    };
    s.onerror = () => Pods.ws.set('err', 'error');
    s.onclose = () => {
      if (s !== sock) return;        // a stale socket closing must not trigger a second reconnect
      sock = null;
      if (!wanted) return Pods.ws.set('idle', 'offline');
      const delay = Math.min(1000 * 2 ** retry++, 15000);            // 1s, 2s, 4s ... capped at 15s
      Pods.ws.set('err', `retry ${Math.round(delay / 1000)}s`);
      timer = setTimeout(open, delay);
    };
  }

  const start = (u) => { url = u || url; wanted = true; if (!sock) open(); };
  const stop = () => { wanted = false; clearTimeout(timer); sock?.close(); };
  const send = obj => sock?.readyState === WebSocket.OPEN && (sock.send(JSON.stringify(obj)), true);

  // every deferred script has run (and subscribed) by DOMContentLoaded, so no early messages are missed
  document.addEventListener('DOMContentLoaded', () =>
    start((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws/levels'));

  return { on, bind, send, start, stop, emit: dispatch };
})();