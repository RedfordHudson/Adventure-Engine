/**
 * LevelMap — AR-style level selector on MapLibre + three.js
 *
 * Each event becomes a neon tower with an orb floating above it. A card
 * (node.title + node.image_link) hangs above every orb and always faces the
 * viewer. Cards are HTML overlays projected from the orb's 3D position, so
 * any image URL works (no CORS needed, unlike WebGL textures) and text stays crisp.
 *
 * Node fields (all optional except lng/lat):
 *   id, title | name, image_link | image, lng | lon | longitude,
 *   lat | latitude, height | altitude (tower height in meters), color
 *
 * Emits a "levelselect" CustomEvent on the container with { detail: node }.
 */
class LevelMap {
    static PALETTE = [0x00f0ff, 0xff2bd6, 0xfcee0a, 0x39ff14, 0xb026ff, 0xff6a00];

    constructor(target = "map-container", options = {}) {
        const parent = typeof target === "string" ? document.getElementById(target) : target;

        if (!parent || !window.maplibregl || !window.THREE) {
            throw new Error("[Map] Missing container or dependencies.");
        }

        // Own an inner host that fills the parent (inline style beats MapLibre's CSS)
        if (getComputedStyle(parent).position === "static") parent.style.position = "relative";
        this.container = document.createElement("div");
        this.container.style.cssText = "position:absolute;inset:0;background:#05070d";
        parent.appendChild(this.container);

        this.config = {
            mapStyle: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
            // (wsUrl removed: the Feed owns the socket now)
            // wsUrl: "ws://localhost:8000/ws/levels",
            towerRadius: 28,      // meters
            orbRadius: 36,        // meters
            orbHover: 70,         // meters between tower top and orb centre
            minTowerHeight: 90,   // used when a node has no height
            arcLift: 90,          // meters the connection arcs rise above the orbs
            flyToOnSelect: true,
            ...options
        };

        this.container.classList.add("lm-root");
        // this.container.style.position = "relative";
        // this.container.style.width = "100%";
        // this.container.style.height ||= "600px";
        // this.container.style.background = "#05070d";

        this.entries = [];
        this.pickables = [];
        this.arcs = [];
        this.selectedId = null;
        this.time = 0;
        this._hasFrame = false;
        this._compact = null;

        this.nodes = [
            { id: "A", name: "Origin", lng: -117.1611, lat: 32.7157, height: 0 },
            { id: "B", name: "North", lng: -117.1585, lat: 32.7180, height: 100 },
            { id: "C", name: "East", lng: -117.1570, lat: 32.7138, height: 50 },
            { id: "D", name: "West", lng: -117.1640, lat: 32.7148, height: 150 },
            { id: "E", name: "South", lng: -117.1600, lat: 32.7118, height: 75 }
        ].map((n, i) => this._normalizeNode(n, i));

        this._injectStyles();
        this._createMap();
        this._createOverlay();
        this._createLayer();
        this._bindEvents();
        this._watchSize();
    }

    _watchSize() {
        this._ro = new ResizeObserver(() => this.map.resize());
        this._ro.observe(this.container);
    }

    /* ------------------------------------------------------------------ */
    /*  Data                                                               */
    /* ------------------------------------------------------------------ */

    _normalizeNode(raw, index) {
        const fallback = LevelMap.PALETTE[index % LevelMap.PALETTE.length];
        let color;

        try {
            color = new THREE.Color(raw.color ?? fallback);
        } catch {
            color = new THREE.Color(fallback);
        }

        const title = raw.title ?? raw.name ?? `Node ${index}`;

        return {
            id: String(raw.id ?? index),
            title,
            name: title,
            image: raw.image_link ?? raw.image ?? null,
            lng: Number(raw.lng ?? raw.lon ?? raw.longitude),
            lat: Number(raw.lat ?? raw.latitude),
            height: Number(raw.height ?? raw.altitude ?? 0) || 0,
            color,
            raw
        };
    }

    _hash(str) {
        let h = 5381;
        for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
        return Math.abs(h);
    }

    /* ------------------------------------------------------------------ */
    /*  Map + overlay                                                      */
    /* ------------------------------------------------------------------ */

    _createMap() {
        this.map = new maplibregl.Map({
            container: this.container,
            style: this.config.mapStyle,
            center: [-117.1611, 32.7157],
            zoom: 14.6,
            pitch: 62,
            bearing: -18,
            maxPitch: 80,
            antialias: true,
            canvasContextAttributes: { antialias: true }
        });

        this.map.addControl(new maplibregl.NavigationControl());
    }

    _addBuildings() {
        try {
            const layers = this.map.getStyle().layers;
            const source = layers.find(l => l["source-layer"] === "building" && l.source);
            if (!source) return;

            const firstSymbol = layers.find(l => l.type === "symbol")?.id;
            const h = ["coalesce", ["get", "render_height"], 10];

            this.map.addLayer({
                id: "lm-buildings",
                type: "fill-extrusion",
                source: source.source,
                "source-layer": "building",
                minzoom: 13,
                paint: {
                    "fill-extrusion-color": ["interpolate", ["linear"], h, 0, "#0a1226", 80, "#14264d", 220, "#22377a"],
                    "fill-extrusion-height": h,
                    "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
                    "fill-extrusion-opacity": 0.9
                }
            }, firstSymbol);
        } catch (error) {
            console.warn("[Map] Skipping 3D buildings:", error);
        }
    }

    _createOverlay() {
        const div = (cls, parent = this.container) => {
            const el = document.createElement("div");
            el.className = cls;
            parent.appendChild(el);
            return el;
        };

        // Scanlines, vignette, corner brackets.
        this.fx = div("lm-fx");
        ["tl", "tr", "bl", "br"].forEach(pos => div(`lm-corner ${pos}`, this.fx));

        // Cards live here, above the canvas.
        this.labelLayer = div("lm-labels");

        // HUD.
        this.panel = div("lm-hud");
        this.panel.innerHTML = `
            <div class="lm-hud-title">Level select</div>
            <div class="lm-row"><span>Events</span><b id="node-count">0</b></div>
            <div class="lm-row"><span>Target</span><b id="selected-node">None</b></div>
            <div class="lm-hint">Click a beacon to lock on</div>
        `;

        this.nodeCount = this.panel.querySelector("#node-count");
        this.selectedLabel = this.panel.querySelector("#selected-node");
    }

    _injectStyles() {
        if (document.getElementById("lm-style")) return;

        if (!document.getElementById("lm-fonts")) {
            const link = document.createElement("link");
            link.id = "lm-fonts";
            link.rel = "stylesheet";
            link.href = "https://fonts.googleapis.com/css2?family=Orbitron:wght@600;800&family=Rajdhani:wght@500;700&display=swap";
            document.head.appendChild(link);
        }

        const style = document.createElement("style");
        style.id = "lm-style";
        style.textContent = `
        .lm-root{--lm-cyan:#00f0ff;--lm-pink:#ff2bd6;--lm-yellow:#fcee0a;--lm-ink:#070a14;
            font-family:'Rajdhani','Segoe UI',system-ui,sans-serif;overflow:hidden}

        .lm-fx{position:absolute;inset:0;z-index:4;pointer-events:none}
        .lm-fx::before{content:"";position:absolute;inset:0;
            background:repeating-linear-gradient(0deg,rgba(0,240,255,.04) 0 1px,transparent 1px 3px)}
        .lm-fx::after{content:"";position:absolute;inset:0;
            background:radial-gradient(ellipse at center,transparent 55%,rgba(20,0,40,.7) 100%)}
        .lm-corner{position:absolute;width:26px;height:26px;border:2px solid var(--lm-pink);
            filter:drop-shadow(0 0 4px var(--lm-pink));z-index:1}
        .lm-corner.tl{top:8px;left:8px;border-right:0;border-bottom:0}
        .lm-corner.tr{top:8px;right:8px;border-left:0;border-bottom:0}
        .lm-corner.bl{bottom:8px;left:8px;border-right:0;border-top:0}
        .lm-corner.br{bottom:8px;right:8px;border-left:0;border-top:0}

        .lm-labels{position:absolute;inset:0;z-index:10;pointer-events:none;overflow:hidden}

        .lm-hud{position:absolute;z-index:20;top:22px;left:22px;min-width:210px;padding:12px 16px 12px;
            pointer-events:none;color:#c8f7ff;font-size:14px;line-height:1.7;letter-spacing:.04em;
            background:linear-gradient(135deg,rgba(7,10,20,.9),rgba(24,8,44,.82));
            border-left:3px solid var(--lm-cyan);
            clip-path:polygon(0 0,calc(100% - 16px) 0,100% 16px,100% 100%,0 100%)}
        .lm-hud-title{font:800 15px 'Orbitron',monospace;letter-spacing:.18em;text-transform:uppercase;
            color:var(--lm-cyan);text-shadow:0 0 10px var(--lm-cyan);margin-bottom:6px}
        .lm-row{display:flex;justify-content:space-between;gap:20px}
        .lm-row span{color:#7a8fb3}
        .lm-row b{color:var(--lm-yellow);font-weight:700;max-width:170px;overflow:hidden;
            text-overflow:ellipsis;white-space:nowrap}
        .lm-hint{margin-top:6px;color:#6d7ba0;font-size:12px}

        .lm-root .maplibregl-ctrl-group{background:rgba(7,10,20,.88)!important;border-radius:0!important;
            border:1px solid rgba(0,240,255,.45);box-shadow:0 0 12px rgba(0,240,255,.25)!important}
        .lm-root .maplibregl-ctrl-group button+button{border-top:1px solid rgba(0,240,255,.3)!important}
        .lm-root .maplibregl-ctrl-icon{filter:invert(1) hue-rotate(150deg) saturate(3)}

        .lm-card{--c:#00f0ff;position:absolute;left:0;top:0;width:200px;pointer-events:auto;cursor:pointer;
            transform-origin:50% 100%;will-change:transform;color:#eafcff;
            filter:drop-shadow(0 0 6px var(--c));animation:lm-in .55s ease-out}
        .lm-card.compact{width:150px}
        .lm-card.selected,.lm-card.hover{filter:drop-shadow(0 0 14px var(--c)) brightness(1.18)}

        .lm-frame{padding:1px;background:var(--c);
            clip-path:polygon(0 0,calc(100% - 16px) 0,100% 16px,100% 100%,16px 100%,0 calc(100% - 16px))}
        .lm-inner{background:linear-gradient(180deg,rgba(10,17,36,.94),rgba(5,8,16,.97));padding:7px 9px 8px;
            clip-path:polygon(0 0,calc(100% - 15px) 0,100% 15px,100% 100%,15px 100%,0 calc(100% - 15px))}

        .lm-head{display:flex;align-items:flex-start;gap:7px;margin-bottom:6px}
        .lm-tag{flex:none;padding:1px 5px;background:var(--c);color:#04060c;
            font:800 10px/16px 'Orbitron',monospace;letter-spacing:.06em}
        .lm-title{font:700 15px/1.15 'Rajdhani',sans-serif;letter-spacing:.05em;text-transform:uppercase;
            text-shadow:0 0 8px var(--c);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;
            overflow:hidden;word-break:break-word}

        .lm-img{position:relative;height:100px;background:#02030a;border:1px solid var(--c);overflow:hidden}
        .lm-card.compact .lm-img{display:none}
        .lm-img img{width:100%;height:100%;object-fit:cover;display:block;filter:saturate(1.25) contrast(1.08)}
        .lm-img::after{content:"";position:absolute;inset:0;pointer-events:none;
            background:repeating-linear-gradient(0deg,rgba(0,0,0,.28) 0 1px,transparent 1px 3px),
            linear-gradient(135deg,transparent 55%,var(--c));mix-blend-mode:screen;opacity:.55}
        .lm-img.empty{display:flex;align-items:center;justify-content:center;
            background:repeating-linear-gradient(45deg,#070a14 0 8px,#0d1226 8px 16px)}
        .lm-img.empty::before{content:"No signal";font:600 11px 'Orbitron',monospace;letter-spacing:.16em;
            color:var(--c);opacity:.8;animation:lm-blink 1.6s steps(2) infinite}

        .lm-foot{display:flex;justify-content:space-between;margin-top:6px;font-size:12px;
            letter-spacing:.06em;color:#8fa3c9}
        .lm-foot b{color:var(--c);font-weight:700}

        .lm-stem{width:2px;height:26px;margin:0 auto;
            background:linear-gradient(var(--c),transparent);box-shadow:0 0 8px var(--c)}

        @keyframes lm-in{0%{opacity:0;filter:brightness(4)}25%{opacity:.9}40%{opacity:.15}100%{opacity:1}}
        @keyframes lm-blink{50%{opacity:.25}}
        @media (prefers-reduced-motion:reduce){.lm-card,.lm-img.empty::before{animation:none}}
        `;
        document.head.appendChild(style);
    }

    /* ------------------------------------------------------------------ */
    /*  three.js layer                                                     */
    /* ------------------------------------------------------------------ */

    _createLayer() {
        this.layer = {
            id: "threejs-nodes",
            type: "custom",
            renderingMode: "3d",

            onAdd: (mapInstance, gl) => {
                this.camera = new THREE.PerspectiveCamera();
                this.scene = new THREE.Scene();
                this.raycaster = new THREE.Raycaster();

                this._white = new THREE.Color(0xffffff);
                this._bq = new THREE.Quaternion();
                this._m4 = new THREE.Matrix4();
                this._v4 = new THREE.Vector4();
                this._pv1 = new THREE.Vector3();
                this._pv2 = new THREE.Vector3();

                this._buildShared();
                this._buildNodes();

                this.renderer = new THREE.WebGLRenderer({
                    canvas: mapInstance.getCanvas(),
                    context: gl
                });
                this.renderer.autoClear = false;

                console.log("[Map] Towers, orbs and connections initialized.");
            },

            render: (gl, args) => {
                const matrix = args?.defaultProjectionData?.mainMatrix
                    ?? (Array.isArray(args) || ArrayBuffer.isView(args) ? args : null);
                if (!matrix) return;

                const now = performance.now() / 1000;
                const dt = Math.min(now - (this._last ?? now), 0.1);
                this._last = now;
                this.time += dt;

                this.camera.projectionMatrix.fromArray(matrix);
                this.camera.projectionMatrixInverse
                    .copy(this.camera.projectionMatrix)
                    .invert();
                this._hasFrame = true;

                this._animate(this.time, dt);

                this.renderer.resetState();
                this.renderer.render(this.scene, this.camera);

                this._updateLabels();

                // Keep animating.
                this.map.triggerRepaint();
            },

            onRemove: () => {
                this._disposeLayer();
            }
        };

        this.map.on("load", () => {
            this._addBuildings();
            this.map.addLayer(this.layer);
        });
    }

    /** Geometries and textures shared by every node. Units are meters. */
    _buildShared() {
        const R = this.config.towerRadius;
        const rotUp = (geo, lift = 0) => {
            geo.rotateX(Math.PI / 2); // cylinder axis Y -> Z (up)
            if (lift) geo.translate(0, 0, lift);
            return geo;
        };

        const tower = rotUp(new THREE.CylinderGeometry(R, R * 1.3, 1, 6, 1, true), 0.5);
        const hexRing = new THREE.RingGeometry(R * 0.97, R * 1.07, 6, 1);
        hexRing.rotateZ(-Math.PI / 2); // align with the hex tower

        const glowCanvas = document.createElement("canvas");
        glowCanvas.width = glowCanvas.height = 128;
        const g = glowCanvas.getContext("2d");
        const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        grad.addColorStop(0, "rgba(255,255,255,1)");
        grad.addColorStop(0.25, "rgba(255,255,255,.45)");
        grad.addColorStop(0.6, "rgba(255,255,255,.1)");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = grad;
        g.fillRect(0, 0, 128, 128);
        const glowTex = new THREE.CanvasTexture(glowCanvas);
        if (THREE.SRGBColorSpace) glowTex.colorSpace = THREE.SRGBColorSpace;

        this.shared = {
            tower,
            towerEdges: new THREE.EdgesGeometry(tower),
            cap: rotUp(new THREE.CylinderGeometry(R * 1.1, R * 1.1, 3, 6)),
            beam: rotUp(new THREE.CylinderGeometry(1.6, 1.6, 1, 8, 1, true), 0.5),
            hexRing,
            sphere: new THREE.SphereGeometry(1, 32, 20),
            ico: new THREE.IcosahedronGeometry(1, 1),
            torus: new THREE.TorusGeometry(1, 0.025, 8, 96),
            plane: new THREE.PlaneGeometry(1, 1),
            disc: new THREE.CircleGeometry(1, 48),
            ring: new THREE.RingGeometry(0.97, 1, 64),
            glowTex,
            hitMat: new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
        };
    }

    _buildNodes() {
        this._clearNodes();

        const S = this.shared;
        const cfg = this.config;
        const R = cfg.towerRadius;
        const orbR = cfg.orbRadius;
        const additive = THREE.AdditiveBlending;

        this.nodes.forEach((node, index) => {
            const mc = maplibregl.MercatorCoordinate.fromLngLat([node.lng, node.lat], 0);
            const m = mc.meterInMercatorCoordinateUnits();
            const hash = this._hash(node.id);
            const towerH = node.height > 0
                ? Math.max(node.height, 40)
                : cfg.minTowerHeight + (hash % 80);
            const orbZ = towerH + cfg.orbHover;
            const bright = node.color.clone().lerp(this._white, 0.45);

            // Group local space: meters, x = east, y = north, z = up.
            // Mercator y points south, so y is flipped to keep winding correct.
            const group = new THREE.Group();
            group.position.set(mc.x, mc.y, 0);
            group.scale.set(m, -m, m);

            const glowMat = (opacity, color = node.color) => new THREE.MeshBasicMaterial({
                color, transparent: true, opacity, depthWrite: false,
                blending: additive, side: THREE.DoubleSide
            });
            const add = (parent, geo, mat) => {
                const mesh = new THREE.Mesh(geo, mat);
                parent.add(mesh);
                return mesh;
            };

            // --- Tower ---------------------------------------------------
            const towerBody = add(group, S.tower, glowMat(0.14));
            towerBody.scale.z = towerH;

            const edges = new THREE.LineSegments(S.towerEdges, new THREE.LineBasicMaterial({
                color: bright, transparent: true, opacity: 0.7, blending: additive, depthWrite: false
            }));
            edges.scale.z = towerH;
            group.add(edges);

            const cap = add(group, S.cap, glowMat(0.9, bright));
            cap.position.z = towerH;

            const scan = add(group, S.hexRing, glowMat(0.8, bright));
            const beam = add(group, S.beam, glowMat(0.6, bright));
            beam.position.z = towerH;
            beam.scale.z = cfg.orbHover;

            // --- Ground markings ----------------------------------------
            const floor = add(group, S.disc, glowMat(0.1));
            floor.scale.setScalar(R * 2.6);
            const floorRing = add(group, S.ring, glowMat(0.8, bright));
            floorRing.scale.setScalar(R * 2.6);
            const pulse = add(group, S.ring, glowMat(0.5));

            // --- Orb -----------------------------------------------------
            const orb = new THREE.Group();
            orb.position.z = orbZ;
            group.add(orb);

            const core = add(orb, S.sphere, new THREE.MeshBasicMaterial({ color: node.color }));
            core.scale.setScalar(orbR);

            const shell = add(orb, S.sphere, glowMat(0.22));
            shell.scale.setScalar(orbR * 1.35);

            const wire = add(orb, S.ico, new THREE.MeshBasicMaterial({
                color: bright, wireframe: true, transparent: true, opacity: 0.7,
                blending: additive, depthWrite: false
            }));
            wire.scale.setScalar(orbR * 1.75);

            const tilt = new THREE.Group();
            tilt.rotation.x = 1.15;
            orb.add(tilt);
            const spinner = new THREE.Group();
            tilt.add(spinner);
            add(spinner, S.torus, glowMat(0.9, bright)).scale.setScalar(orbR * 2.3);
            const satellite = add(spinner, S.sphere, new THREE.MeshBasicMaterial({ color: this._white }));
            satellite.scale.setScalar(orbR * 0.2);
            satellite.position.x = orbR * 2.3;

            const halo = add(orb, S.plane, new THREE.MeshBasicMaterial({
                map: S.glowTex, color: node.color, transparent: true, opacity: 0.6,
                blending: additive, depthWrite: false, side: THREE.DoubleSide
            }));

            // --- Picking proxies ----------------------------------------
            const orbHit = add(orb, S.sphere, S.hitMat);
            orbHit.scale.setScalar(orbR * 2);
            const towerHit = add(group, S.tower, S.hitMat);
            towerHit.scale.set(1.25, 1.25, towerH);

            group.traverse(o => { o.frustumCulled = false; });
            this.scene.add(group);

            const entry = {
                node, group, m, towerH, orbZ, index,
                phase: (hash % 997) / 997,
                sel: 0, hov: 0,
                selected: false, hoverPick: false, hoverCard: false,
                parts: { orb, core, wire, spinner, halo, scan, pulse, beam, edges }
            };

            orbHit.userData.entry = entry;
            towerHit.userData.entry = entry;
            this.pickables.push(orbHit, towerHit);

            entry.card = this._makeCard(entry);
            this.entries.push(entry);
        });

        this._buildArcs();

        this.nodeCount.textContent = String(this.nodes.length);
    }

    /** Curved data links from the first orb to every other orb, with travelling packets. */
    _buildArcs() {
        const anchor = this.entries[0];
        if (!anchor) return;

        const orbWorld = e => new THREE.Vector3(e.group.position.x, e.group.position.y, e.orbZ * e.m);

        for (const e of this.entries.slice(1)) {
            const a = orbWorld(anchor);
            const b = orbWorld(e);
            const control = a.clone().add(b).multiplyScalar(0.5);
            control.z = Math.max(a.z, b.z) + this.config.arcLift * 2 * anchor.m;

            const curve = new THREE.QuadraticBezierCurve3(a, control, b);
            const line = new THREE.Line(
                new THREE.BufferGeometry().setFromPoints(curve.getPoints(48)),
                new THREE.LineBasicMaterial({
                    color: e.node.color, transparent: true, opacity: 0.6,
                    blending: THREE.AdditiveBlending, depthWrite: false
                })
            );
            line.frustumCulled = false;
            this.scene.add(line);

            const packets = [0, 0.5].map(off => {
                const mesh = new THREE.Mesh(
                    this.shared.sphere,
                    new THREE.MeshBasicMaterial({ color: e.node.color.clone().lerp(this._white, 0.6) })
                );
                mesh.scale.setScalar(9 * e.m);
                mesh.frustumCulled = false;
                this.scene.add(mesh);
                return { mesh, off, speed: 0.12 + (e.phase * 0.08) };
            });

            this.arcs.push({ curve, line, packets });
        }
    }

    _clearNodes() {
        const S = this.shared;

        for (const e of this.entries) {
            this.scene.remove(e.group);
            e.group.traverse(o => {
                if (o.material && o.material !== S.hitMat) o.material.dispose();
            });
            e.card.remove();
        }

        for (const a of this.arcs) {
            this.scene.remove(a.line);
            a.line.geometry.dispose();
            a.line.material.dispose();
            for (const p of a.packets) {
                this.scene.remove(p.mesh);
                p.mesh.material.dispose();
            }
        }

        this.entries = [];
        this.pickables = [];
        this.arcs = [];
    }

    /* ------------------------------------------------------------------ */
    /*  Cards (title + image, billboarded via screen-space projection)     */
    /* ------------------------------------------------------------------ */

    _makeCard(entry) {
        const { node } = entry;
        const el = (tag, cls, text) => {
            const n = document.createElement(tag);
            if (cls) n.className = cls;
            if (text !== undefined) n.textContent = text;
            return n;
        };

        const card = el("div", "lm-card");
        card.style.setProperty("--c", "#" + node.color.getHexString());

        const frame = el("div", "lm-frame");
        const inner = el("div", "lm-inner");

        const head = el("div", "lm-head");
        head.append(
            el("span", "lm-tag", `LV.${String(entry.index + 1).padStart(2, "0")}`),
            el("span", "lm-title", node.title)
        );

        const imgBox = el("div", "lm-img");
        const src = this._safeImageUrl(node.image);
        if (src) {
            const img = document.createElement("img");
            img.alt = "";
            img.loading = "lazy";
            img.decoding = "async";
            img.referrerPolicy = "no-referrer";
            img.onerror = () => { img.remove(); imgBox.classList.add("empty"); };
            img.src = src;
            imgBox.appendChild(img);
        } else {
            imgBox.classList.add("empty");
        }

        const foot = el("div", "lm-foot");
        const alt = el("span", "", "Alt ");
        alt.appendChild(el("b", "", `${Math.round(entry.towerH)}m`));
        const id = el("span", "", "ID ");
        id.appendChild(el("b", "", node.id));
        foot.append(alt, id);

        inner.append(head, imgBox, foot);
        frame.appendChild(inner);
        card.append(frame, el("div", "lm-stem"));

        card.addEventListener("click", e => {
            e.stopPropagation();
            this.select(node.id);
        });
        card.addEventListener("mouseenter", () => { entry.hoverCard = true; card.classList.add("hover"); });
        card.addEventListener("mouseleave", () => { entry.hoverCard = false; card.classList.remove("hover"); });

        card.style.visibility = "hidden";
        this.labelLayer.appendChild(card);
        return card;
    }

    _safeImageUrl(link) {
        if (!link || typeof link !== "string") return null;
        try {
            const url = new URL(link, window.location.href);
            const ok = url.protocol === "http:" || url.protocol === "https:"
                || (url.protocol === "data:" && link.startsWith("data:image/"));
            return ok ? url.href : null;
        } catch {
            return null;
        }
    }

    _updateLabels() {
        const canvas = this.map.getCanvas();
        const W = canvas.clientWidth;
        const H = canvas.clientHeight;
        const zoom = this.map.getZoom();
        const base = THREE.MathUtils.clamp(0.55 + (zoom - 13) * 0.22, 0.5, 1.15);
        const compact = zoom < 13.6;
        const lift = this.config.orbRadius * 2.5;
        const visible = [];

        for (const e of this.entries) {
            const z = (e.parts.orb.position.z + lift) * e.m;
            this._v4.set(e.group.position.x, e.group.position.y, z, 1)
                .applyMatrix4(this.camera.projectionMatrix);

            const w = this._v4.w;
            const nx = this._v4.x / w;
            const ny = this._v4.y / w;
            const card = e.card;

            if (w <= 0 || Math.abs(nx) > 1.3 || Math.abs(ny) > 1.3) {
                card.style.visibility = "hidden";
                continue;
            }

            const px = (nx * 0.5 + 0.5) * W;
            const py = (1 - (ny * 0.5 + 0.5)) * H;
            const s = base * (1 + e.sel * 0.12);

            card.style.visibility = "visible";
            card.style.transform =
                `translate3d(${px.toFixed(1)}px,${py.toFixed(1)}px,0) translate(-50%,-100%) scale(${s.toFixed(3)})`;
            visible.push({ card, w, boost: e.selected ? 10000 : 0 });
        }

        // Nearer cards render on top.
        visible.sort((a, b) => b.w - a.w);
        visible.forEach((v, i) => { v.card.style.zIndex = String(i + v.boost); });

        if (compact !== this._compact) {
            this._compact = compact;
            for (const e of this.entries) e.card.classList.toggle("compact", compact);
        }
    }

    /* ------------------------------------------------------------------ */
    /*  Animation                                                          */
    /* ------------------------------------------------------------------ */

    _animate(t, dt) {
        const R = this.config.towerRadius;
        const TAU = Math.PI * 2;

        // Billboard orientation from the map camera. Local axes: x east, y north, z up.
        const b = THREE.MathUtils.degToRad(this.map.getBearing());
        const p = THREE.MathUtils.degToRad(this.map.getPitch());
        const back = new THREE.Vector3(-Math.sin(b) * Math.sin(p), -Math.cos(b) * Math.sin(p), Math.cos(p));
        const right = new THREE.Vector3(Math.cos(b), -Math.sin(b), 0);
        const up = new THREE.Vector3().crossVectors(back, right);
        this._m4.makeBasis(right, up, back);
        this._bq.setFromRotationMatrix(this._m4);

        const k = Math.min(1, dt * 6);

        for (const e of this.entries) {
            const p = e.parts;
            const ph = e.phase * TAU;

            e.sel += ((e.selected ? 1 : 0) - e.sel) * k;
            e.hov += ((e.hoverPick || e.hoverCard ? 1 : 0) - e.hov) * k;

            p.orb.position.z = e.orbZ + Math.sin(t * 1.4 + ph) * 4 + e.sel * 14 + e.hov * 6;
            p.orb.scale.setScalar(1 + e.sel * 0.3 + e.hov * 0.12);

            p.core.material.color.copy(e.node.color)
                .lerp(this._white, Math.min(1, e.sel * 0.7 + e.hov * 0.3));
            p.wire.rotation.set(t * 0.5 + ph, t * 0.8, 0);
            p.spinner.rotation.z = t * (0.9 + e.sel * 1.6);

            const hs = R * (5 + Math.sin(t * 2 + ph) * 0.5 + e.sel * 1.6 + e.hov * 0.6);
            p.halo.quaternion.copy(this._bq);
            p.halo.scale.set(hs, hs, 1);
            p.halo.material.opacity = 0.5 + 0.2 * Math.sin(t * 2.3 + ph) + e.sel * 0.25;

            // Scan ring climbing the tower.
            const f = (t * 0.3 + e.phase) % 1;
            p.scan.position.z = f * e.towerH;
            p.scan.scale.setScalar(1.3 - 0.3 * f);
            p.scan.material.opacity = Math.sin(Math.PI * f) * (0.7 + e.sel * 0.3);

            // Ground pulse.
            const pf = (t * 0.45 + e.phase) % 1;
            p.pulse.scale.setScalar(R * (1.2 + pf * 3.4));
            p.pulse.material.opacity = (1 - pf) * 0.6;

            p.beam.material.opacity = 0.45 + 0.2 * Math.sin(t * 9 + ph * 3);
            p.edges.material.opacity = 0.6 + e.sel * 0.4 + e.hov * 0.2;
        }

        for (const a of this.arcs) {
            for (const pk of a.packets) {
                a.curve.getPoint((t * pk.speed + pk.off) % 1, pk.mesh.position);
            }
        }
    }

    /* ------------------------------------------------------------------ */
    /*  Interaction                                                        */
    /* ------------------------------------------------------------------ */

    _bindEvents() {
        this._onClick = (event) => {
            const entry = this._pick(event.point);
            if (entry) this.select(entry.node.id);
        };

        this._onMove = (event) => {
            const hit = this._pick(event.point);
            for (const e of this.entries) e.hoverPick = e === hit;
            this.map.getCanvas().style.cursor = hit ? "pointer" : "";
        };

        this._onError = (event) => {
            console.error("[Map] Map error:", event.error || event);
        };

        this.map.on("click", this._onClick);
        this.map.on("mousemove", this._onMove);
        this.map.on("error", this._onError);
    }

    /** Ray from the near to far plane of the map's own projection matrix. */
    _pick(point) {
        if (!this._hasFrame || !this.pickables.length) return null;

        const canvas = this.map.getCanvas();
        const x = (point.x / canvas.clientWidth) * 2 - 1;
        const y = -(point.y / canvas.clientHeight) * 2 + 1;

        const near = this._pv1.set(x, y, -1).unproject(this.camera);
        const far = this._pv2.set(x, y, 1).unproject(this.camera);

        this.raycaster.ray.origin.copy(near);
        this.raycaster.ray.direction.copy(far).sub(near).normalize();

        const hit = this.raycaster.intersectObjects(this.pickables, false)[0];
        return hit ? hit.object.userData.entry : null;
    }

    select(id, { fly = this.config.flyToOnSelect, emit = true } = {}) {
        const entry = this.entries.find(e => e.node.id === String(id));
        this.selectedId = entry ? entry.node.id : null;

        for (const e of this.entries) {
            e.selected = e === entry;
            e.card.classList.toggle("selected", e.selected);
        }

        this.selectedLabel.textContent = entry ? `${entry.node.id} — ${entry.node.title}` : "None";
        if (!entry) return;

        if (fly) {
            this.map.easeTo({
                center: [entry.node.lng, entry.node.lat],
                zoom: Math.max(this.map.getZoom(), 15.4),
                pitch: 62,
                offset: [0, 110],
                duration: 1400
            });
        }

        if (emit) {
            this.container.dispatchEvent(new CustomEvent("levelselect", { detail: entry.node, bubbles: true }));
        }

        this.map.triggerRepaint();
        console.log("[Map] Selected node:", entry.node);
    }

    /* ------------------------------------------------------------------ */
    /*  Lifecycle                                                          */
    /* ------------------------------------------------------------------ */

    _disposeLayer() {
        if (this.scene) this._clearNodes();

        if (this.shared) {
            for (const value of Object.values(this.shared)) value.dispose?.();
            this.shared = null;
        }

        this.renderer?.dispose();
    }

    dispose() {
        this._ro?.disconnect();
        this.map.off("click", this._onClick);
        this.map.off("mousemove", this._onMove);
        this.map.off("error", this._onError);
        this.map.remove();

        this.panel.remove();
        this.labelLayer.remove();
        this.fx.remove();
        this.container.remove();   // the host we created
    }

    /* ------------------------------------------------------------------ */
    /*  WebSocket                                                          */
    /* ------------------------------------------------------------------ */

    updateNodes(data) {
        if (!Array.isArray(data)) {
            console.warn("[Map] Expected an array of nodes.", data);
            return;
        }

        this.nodes = data
            .map((node, index) => this._normalizeNode(node, index))
            .filter(node =>
                Number.isFinite(node.lng) &&
                Number.isFinite(node.lat) &&
                node.lng >= -180 && node.lng <= 180 &&
                node.lat >= -90 && node.lat <= 90
            );

        this._rebuildNodes();
    }

    _rebuildNodes() {
        if (!this.scene) return; // layer not added yet; onAdd will build from this.nodes

        const keep = this.selectedId;
        this._buildNodes();
        this._compact = null;

        // Keep the current target locked if it still exists in the new data.
        this.select(keep, { fly: false, emit: false });

        this.map.triggerRepaint();
    }
}