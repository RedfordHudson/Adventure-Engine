(() => {
  const mount = document.getElementById('map-mount');
  mount.replaceChildren();          // drop the placeholder text
  mount.classList.add('live');

  const levels = new LevelMap(mount);

  // server -> map (the class itself knows nothing about Feed)
  Feed.on('data_stream', msg => levels.updateNodes(msg.data));

  // map -> other modules
  mount.addEventListener('levelselect', e =>
    document.dispatchEvent(new CustomEvent('node:select', { detail: e.detail })));

  window.levels = levels;           // console handle while developing
})();