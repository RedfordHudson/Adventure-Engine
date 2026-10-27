(() => {
  const mount = document.getElementById('map-mount');
  mount.replaceChildren();
  mount.classList.add('live');

  const levels = new LevelMap(mount);
  NodeHub.set(levels.nodes.map(n => n.raw));        // seed the hub with the demo nodes until the first feed message

  Feed.on('data_stream', msg => levels.updateNodes(msg.data));

  // map -> hub
  mount.addEventListener('levelselect', e => NodeHub.select(e.detail.id, 'map'));
  mount.addEventListener('levelhover',  e => NodeHub.hover(e.detail?.id ?? null, 'map'));

  // hub -> map (ignore our own events)
  NodeHub.on('select', e => e.source !== 'map' && levels.select(e.id, {emit: false}));
  NodeHub.on('hover',  e => e.source !== 'map' && levels.highlight(e.id));

  window.levels = levels;
})();