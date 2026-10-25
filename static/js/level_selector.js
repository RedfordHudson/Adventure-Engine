/**
 * Dispose geometries, materials, and material textures for an Object3D tree.
 */
function disposeObject3D(root) {
    const disposedGeometries = new Set();
    const disposedMaterials = new Set();
    const disposedTextures = new Set();

    root.traverse((object) => {
        if (object.geometry && !disposedGeometries.has(object.geometry)) {
            object.geometry.dispose();
            disposedGeometries.add(object.geometry);
        }

        const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];

        for (const material of materials) {
            if (!material || disposedMaterials.has(material)) {
                continue;
            }

            // Dispose maps/textures assigned to the material.
            for (const value of Object.values(material)) {
                if (value?.isTexture && !disposedTextures.has(value)) {
                    value.dispose();
                    disposedTextures.add(value);
                }
            }

            material.dispose();
            disposedMaterials.add(material);
        }
    });
}

function toHexColor(color, fallback = 0xffffff) {
    const safeColor = Number.isInteger(color) ? color & 0xffffff : fallback;
    return `#${safeColor.toString(16).padStart(6, "0")}`;
}

function isSafeHttpUrl(value) {
    try {
        const url = new URL(value, window.location.href);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch {
        return false;
    }
}

/**
 * Viewport
 * Base Three.js viewport lifecycle, rendering, controls, sizing, and pointer state.
 */
class Viewport {
    constructor(containerId) {
        this.container = document.getElementById(containerId);

        if (!this.container) {
            throw new Error(`[Viewport Error] Container #${containerId} was not found.`);
        }

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;

        this.clock = new THREE.Clock(false);
        this.pointer = new THREE.Vector2(-2, -2);

        this.isRunning = false;
        this.frameId = null;
        this.resizeObserver = null;

        this.animate = this.animate.bind(this);
        this._onResize = this._onResize.bind(this);
        this._onPointerMove = this._onPointerMove.bind(this);
        this._onPointerLeave = this._onPointerLeave.bind(this);

        this._initializeViewport();
    }

    _initializeViewport() {
        this._initScene();
        this._initRenderer();
        this._initControls();
        this._initListeners();
        this._onResize();
    }

    _initScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x06060c);
        this.scene.fog = new THREE.FogExp2(0x06060c, 0.018);

        this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1000);
        this.camera.position.set(30, 25, 38);
    }

    _initRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: "high-performance"
        });

        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        this.container.appendChild(this.renderer.domElement);
    }

    _initControls() {
        this.controls = new THREE.OrbitControls(
            this.camera,
            this.renderer.domElement
        );

        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
    }

    _initListeners() {
        const canvas = this.renderer.domElement;

        canvas.addEventListener("pointermove", this._onPointerMove);
        canvas.addEventListener("pointerleave", this._onPointerLeave);

        this.resizeObserver = new ResizeObserver(this._onResize);
        this.resizeObserver.observe(this.container);
    }

    _onResize() {
        if (!this.renderer || !this.camera) {
            return;
        }

        const { clientWidth: width, clientHeight: height } = this.container;

        if (!width || !height) {
            return;
        }

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height, false);
    }

    _onPointerMove(event) {
        const bounds = this.renderer.domElement.getBoundingClientRect();

        this.pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
        this.pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    }

    _onPointerLeave() {
        // Ensures no object remains selected when the pointer leaves the canvas.
        this.pointer.set(-2, -2);
    }

    start() {
        if (this.isRunning) {
            return;
        }

        this.isRunning = true;
        this.clock.start();
        this.animate();
    }

    stop() {
        this.isRunning = false;

        if (this.frameId) {
            cancelAnimationFrame(this.frameId);
            this.frameId = null;
        }

        this.clock.stop();
    }

    animate() {
        if (!this.isRunning) {
            return;
        }

        this.frameId = requestAnimationFrame(this.animate);

        const delta = Math.min(this.clock.getDelta(), 0.1);
        const elapsed = this.clock.getElapsedTime();

        this.update(delta, elapsed);
        this.controls?.update();
        this.renderer?.render(this.scene, this.camera);
    }

    /**
     * Subclasses override this for frame-specific work.
     */
    update(_delta, _elapsed) {}

    dispose() {
        this.stop();

        const canvas = this.renderer?.domElement;

        canvas?.removeEventListener("pointermove", this._onPointerMove);
        canvas?.removeEventListener("pointerleave", this._onPointerLeave);

        this.resizeObserver?.disconnect();
        this.controls?.dispose();

        if (this.scene) {
            disposeObject3D(this.scene);
        }

        this.renderer?.dispose();
        canvas?.remove();
    }
}

/**
 * LevelSelector
 * Scene-specific rendering, node selection, HUD updates, and interaction.
 */
class LevelSelector extends Viewport {
    constructor(containerId) {
        super(containerId);

        this.nodes = [];
        this.nodesById = new Map();

        this.orbObjects = [];
        this.currentlyHoveredNode = null;

        this.raycaster = new THREE.Raycaster();
        this.textureLoader = new THREE.TextureLoader();

        // Incremented every time node content is rebuilt.
        // Prevents late texture callbacks from updating obsolete objects.
        this.nodeGeneration = 0;

        this.nodeGroup = new THREE.Group();
        this.nodeGroup.name = "DynamicLevelNodes";
        this.scene.add(this.nodeGroup);

        this.hud = {
            card: document.getElementById("node-card"),
            title: document.getElementById("node-title"),
            coords: document.getElementById("node-coords"),
            desc: document.getElementById("node-desc"),
            btn: document.getElementById("node-btn"),
            iframe: document.getElementById("node-preview-iframe")
        };

        this._onCanvasClick = this._onCanvasClick.bind(this);

        this._initLevelSelector();
    }

    _initLevelSelector() {
        this._initLighting();
        this._initEnvironment();

        this.renderer.domElement.addEventListener("click", this._onCanvasClick);
    }

    _initLighting() {
        const ambientLight = new THREE.AmbientLight(0xffebd9, 1.8);
        this.scene.add(ambientLight);

        const sunLight = new THREE.DirectionalLight(0xffaa44, 2.5);
        sunLight.position.set(40, 50, 30);
        sunLight.castShadow = true;
        sunLight.shadow.mapSize.set(2048, 2048);
        sunLight.shadow.bias = -0.001;
        this.scene.add(sunLight);

        const shadowFill = new THREE.DirectionalLight(0xff00aa, 0.8);
        shadowFill.position.set(-40, 20, -30);
        this.scene.add(shadowFill);

        this.scene.background = new THREE.Color(0x2b1025);
        this.scene.fog = new THREE.FogExp2(0x2b1025, 0.012);
    }

    _initEnvironment() {
        const gridHelper = new THREE.GridHelper(90, 45, 0xff7b00, 0xff0055);
        gridHelper.position.y = -0.05;

        // GridHelper can use either one material or an array depending on version.
        const gridMaterials = Array.isArray(gridHelper.material)
            ? gridHelper.material
            : [gridHelper.material];

        gridMaterials.forEach((material) => {
            material.opacity = 0.15;
            material.transparent = true;
        });

        this.scene.add(gridHelper);

        const terrainSize = 100;
        const segments = 60;

        const terrainGeometry = new THREE.PlaneGeometry(
            terrainSize,
            terrainSize,
            segments,
            segments
        );

        terrainGeometry.rotateX(-Math.PI / 2);

        const positions = terrainGeometry.attributes.position;

        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i);
            const z = positions.getZ(i);

            let height = Math.sin(x * 0.08) * Math.cos(z * 0.08) * 3.5;
            height += Math.sin(x * 0.03) * 2.0;

            const distanceFromCenter = Math.hypot(x, z);

            if (distanceFromCenter < 25) {
                height *= distanceFromCenter / 25;
            }

            positions.setY(i, height);
        }

        terrainGeometry.computeVertexNormals();

        const terrainMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a0f18,
            roughness: 0.85,
            metalness: 0.1,
            flatShading: true
        });

        const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
        terrain.receiveShadow = true;
        this.scene.add(terrain);

        const landmarkPositions = [
            [-25, -20],
            [28, 22],
            [-30, 15]
        ];

        landmarkPositions.forEach(([x, z], index) => {
            const geometry = new THREE.ConeGeometry(2, 12, 4);
            const material = new THREE.MeshStandardMaterial({
                color: 0x2e0854,
                emissive: index % 2 === 0 ? 0xff3300 : 0xff0055,
                emissiveIntensity: 0.15,
                roughness: 0.1,
                metalness: 0.9,
                flatShading: true
            });

            const obelisk = new THREE.Mesh(geometry, material);
            obelisk.position.set(x, 5, z);
            obelisk.rotation.y = index * 0.5;
            obelisk.castShadow = true;

            this.scene.add(obelisk);
        });
    }

    _onCanvasClick() {
        if (!this.currentlyHoveredNode) {
            return;
        }

        const nodeId = this.currentlyHoveredNode.userData.nodeId;
        const node = this.nodesById.get(nodeId);

        if (!node) {
            return;
        }

        this._triggerSelectionFlash();

        console.log(
            `>>> INITIALIZING TACTICAL TRANSPORTS: ${node.title.toUpperCase()}`
        );

        // Replace this with your navigation/selection handler.
        alert(`>>> INITIALIZING TACTICAL TRANSPORTS TO: ${node.title.toUpperCase()}`);
    }

    _triggerSelectionFlash() {
        const orb = this.currentlyHoveredNode;

        if (!orb) {
            return;
        }

        const originalIntensity = orb.material.emissiveIntensity;
        orb.material.emissiveIntensity = 3.0;

        window.setTimeout(() => {
            // Ensure the same orb is still active and attached to the current scene.
            if (orb.parent) {
                orb.material.emissiveIntensity =
                    orb === this.currentlyHoveredNode ? 1.8 : originalIntensity;
            }
        }, 120);
    }

    _createFloatingTextTexture(text, color) {
        const canvas = document.createElement("canvas");
        canvas.width = 512;
        canvas.height = 128;

        const context = canvas.getContext("2d");

        context.clearRect(0, 0, canvas.width, canvas.height);
        context.font = "bold 36px monospace";
        context.fillStyle = color;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.shadowColor = color;
        context.shadowBlur = 10;
        context.fillText(String(text).toUpperCase(), 256, 64);

        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;

        return texture;
    }

    _clearLevelNodes() {
        this.nodeGeneration += 1;
        this.currentlyHoveredNode = null;
        this.orbObjects = [];
        this.nodes = [];
        this.nodesById.clear();

        this.hud.card?.classList.remove("active");

        disposeObject3D(this.nodeGroup);
        this.nodeGroup.clear();
    }

    updateLevelNodes(incomingNodes) {
        if (!Array.isArray(incomingNodes)) {
            console.warn("[LevelSelector] Ignored node update: expected an array.");
            return;
        }

        this._clearLevelNodes();

        this.nodes = incomingNodes.filter((node) => {
            return (
                node &&
                node.id !== undefined &&
                Array.isArray(node.pos) &&
                node.pos.length >= 3
            );
        });

        this.nodesById = new Map(this.nodes.map((node) => [node.id, node]));

        const activeGeneration = this.nodeGeneration;

        this.nodes.forEach((node, index) => {
            const [x, y, z] = node.pos.map(Number);
            const towerHeight = Math.max(1, Number(node.towerHeight) || 8);
            const color = Number.isInteger(node.color) ? node.color : 0xffffff;
            const hexColor = toHexColor(color);

            const tower = this._createTower(x, z, towerHeight, color);
            const ring = this._createTowerRing(x, z, towerHeight, color);
            const text = this._createNodeLabel(node.title, x, z, towerHeight, hexColor);
            const orb = this._createOrb(node, index, x, y, z, color);

            this.nodeGroup.add(tower, ring, text, orb);
            this.orbObjects.push(orb);

            if (node.imageUrl) {
                const banner = this._createImageBanner(
                    node,
                    x,
                    z,
                    towerHeight,
                    color,
                    activeGeneration
                );

                this.nodeGroup.add(banner);
            }
        });
    }

    _createTower(x, z, height, color) {
        const geometry = new THREE.CylinderGeometry(0.8, 1.6, height, 4);
        const material = new THREE.MeshStandardMaterial({
            color: 0x3d2538,
            roughness: 0.3,
            metalness: 0.7,
            flatShading: true,
            emissive: color,
            emissiveIntensity: 0.15
        });

        const tower = new THREE.Mesh(geometry, material);
        tower.position.set(x, height / 2, z);
        tower.castShadow = true;
        tower.receiveShadow = true;

        return tower;
    }

    _createTowerRing(x, z, height, color) {
        const geometry = new THREE.TorusGeometry(1.6, 0.08, 8, 16);
        const material = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.8
        });

        const ring = new THREE.Mesh(geometry, material);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(x, height - 0.2, z);

        return ring;
    }

    _createNodeLabel(title, x, z, height, hexColor) {
        const geometry = new THREE.PlaneGeometry(8, 2);
        const material = new THREE.MeshBasicMaterial({
            map: this._createFloatingTextTexture(title, hexColor),
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        const label = new THREE.Mesh(geometry, material);
        label.position.set(x, height + 4.2, z);
        label.userData.isBillboard = true;

        return label;
    }

    _createImageBanner(node, x, z, height, color, generation) {
        const geometry = new THREE.PlaneGeometry(3.5, 4.5);
        const material = new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0.95,
            side: THREE.DoubleSide,
            color: 0xffffff,
            depthWrite: false
        });

        const banner = new THREE.Mesh(geometry, material);
        banner.position.set(x - 2.8, height + 1.5, z);
        banner.userData.isBillboard = true;

        this.textureLoader.load(
            node.imageUrl,
            (texture) => {
                // Ignore and dispose textures loaded after this scene was replaced.
                if (generation !== this.nodeGeneration || !banner.parent) {
                    texture.dispose();
                    return;
                }

                material.map = texture;
                material.needsUpdate = true;
            },
            undefined,
            () => {
                // Use a colored fallback if the remote image does not load.
                material.color.setHex(color);
                material.needsUpdate = true;
            }
        );

        return banner;
    }

    _createOrb(node, index, x, y, z, color) {
        const geometry = new THREE.IcosahedronGeometry(1.0, 1);
        const material = new THREE.MeshStandardMaterial({
            color,
            emissive: color,
            emissiveIntensity: 1.0,
            roughness: 0.1,
            transparent: true,
            opacity: 0.9,
            flatShading: true
        });

        const orb = new THREE.Mesh(geometry, material);
        orb.position.set(x, y, z);

        orb.userData = {
            nodeId: node.id,
            baseY: y,
            phase: index * 0.75
        };

        return orb;
    }

    _setHoveredNode(nextOrb) {
        if (this.currentlyHoveredNode === nextOrb) {
            return;
        }

        if (this.currentlyHoveredNode) {
            this.currentlyHoveredNode.material.emissiveIntensity = 1.0;
            this.currentlyHoveredNode.scale.setScalar(1);
        }

        this.currentlyHoveredNode = nextOrb;

        if (!nextOrb) {
            this.hud.card?.classList.remove("active");
            return;
        }

        nextOrb.material.emissiveIntensity = 1.8;
        nextOrb.scale.setScalar(1.4);

        const node = this.nodesById.get(nextOrb.userData.nodeId);

        if (node) {
            this._updateHUD(node);
        }
    }

    _updateHUD(node) {
        if (!this.hud.card) {
            return;
        }

        const hexColor = toHexColor(node.color);

        if (this.hud.title) {
            this.hud.title.textContent = node.title ?? "Untitled Node";
            this.hud.title.style.color = hexColor;
            this.hud.title.style.textShadow = `0 0 8px ${hexColor}`;
        }

        if (this.hud.coords) {
            this.hud.coords.textContent = node.coords ?? "";
        }

        if (this.hud.desc) {
            this.hud.desc.textContent = node.desc ?? "";
        }

        this.hud.card.style.borderColor = hexColor;
        this.hud.card.style.boxShadow = `0 0 25px ${hexColor}44`;

        if (this.hud.btn) {
            this.hud.btn.style.borderColor = hexColor;
            this.hud.btn.style.color = hexColor;
        }

        // Do not automatically load arbitrary iframe URLs.
        // Ideally, enforce an application-specific allowlist here.
        if (this.hud.iframe && isSafeHttpUrl(node.url)) {
            this.hud.iframe.src = node.url;
        }

        this.hud.card.classList.add("active");
    }

    update(delta, elapsed) {
        for (const orb of this.orbObjects) {
            orb.position.y =
                orb.userData.baseY +
                Math.sin(elapsed * 2 + orb.userData.phase) * 0.35;

            orb.rotation.y += delta * 0.72;
            orb.rotation.x += delta * 0.36;
        }

        this.nodeGroup.traverse((object) => {
            if (object.userData?.isBillboard) {
                object.quaternion.copy(this.camera.quaternion);
            }
        });

        this.raycaster.setFromCamera(this.pointer, this.camera);

        const [intersection] = this.raycaster.intersectObjects(
            this.orbObjects,
            false
        );

        this._setHoveredNode(intersection?.object ?? null);
    }

    dispose() {
        this.renderer?.domElement.removeEventListener("click", this._onCanvasClick);
        super.dispose();
    }
}

/**
 * Updates one or more crawler status indicators.
 *
 * Suggested HTML:
 * <span data-crawler-status="crawler-a"></span>
 * <span data-crawler-status="crawler-b"></span>
 */
class CrawlerController {
    updateStatus(crawlerId, status) {
        // const selector = `[data-crawler-status="${CSS.escape(String(crawlerId))}"]`;
        // const indicator = document.querySelector(selector);

        const indicator = document.getElementById('status-indicator-luma')

        if (!indicator) {
            console.warn(`[Crawler] No status indicator found for: ${crawlerId}`);
            return;
        }

        const normalizedStatus = String(status ?? "unknown").toLowerCase();

        indicator.textContent = normalizedStatus;
        indicator.dataset.status = normalizedStatus;
        indicator.setAttribute("aria-label", `${crawlerId}: ${normalizedStatus}`);
    }
}

/**
 * Master
 * Owns application lifecycle and the single WebSocket connection.
 */
class Master {
    constructor(webSocketUrl) {
        this.wsUrl = webSocketUrl;

        this.levelSelector = new LevelSelector("viewport-container");
        this.crawlerController = new CrawlerController();

        this.socket = null;
        this.reconnectTimer = null;
        this.reconnectAttempt = 0;
        this.isDisposed = false;

        this.statusDot = document.getElementById("ws-indicator");
        this.statusText = document.getElementById("ws-status");

        this._connectWebSocket();
    }

    start() {
        this.levelSelector.start();
    }

    _setSocketStatus(status, text) {
        this.statusDot?.classList.toggle("connected", status === "connected");
        this.statusDot?.classList.toggle("disconnected", status !== "connected");

        if (this.statusText) {
            this.statusText.textContent = text;
        }
    }

    _connectWebSocket() {
        if (this.isDisposed) {
            return;
        }

        if (
            this.socket &&
            (this.socket.readyState === WebSocket.OPEN ||
                this.socket.readyState === WebSocket.CONNECTING)
        ) {
            return;
        }

        console.log(`[Socket] Connecting: ${this.wsUrl}`);
        this._setSocketStatus("connecting", "websocket connecting");

        try {
            this.socket = new WebSocket(this.wsUrl);
        } catch (error) {
            console.error("[Socket Error] Connection initialization failed:", error);
            this._scheduleReconnect();
            return;
        }

        this.socket.addEventListener("open", () => {
            this.reconnectAttempt = 0;
            this._setSocketStatus("connected", "websocket connected");
        });

        this.socket.addEventListener("message", (event) => {
            this._handleSocketMessage(event);
        });

        this.socket.addEventListener("error", () => {
            this._setSocketStatus("error", "websocket error");
        });

        this.socket.addEventListener("close", () => {
            this._setSocketStatus("disconnected", "websocket disconnected");
            this._scheduleReconnect();
        });
    }

    _handleSocketMessage(event) {
        let payload;

        try {
            payload = JSON.parse(event.data);
        } catch (error) {
            console.error("[Socket Error] Invalid JSON frame:", error);
            return;
        }

        this.routeEvent(payload);
    }

    routeEvent(payload) {
        if (!payload || typeof payload.event_type !== "string") {
            console.warn("[Socket] Ignored malformed payload:", payload);
            return;
        }

        switch (payload.event_type) {
            case "status_change": {
                if (payload.source_id == null || payload.status == null) {
                    console.warn("[Socket] Invalid status_change payload:", payload);
                    return;
                }

                this.crawlerController.updateStatus(
                    payload.source_id,
                    payload.status
                );
                break;
            }

            case "data_stream": {
                if (!Array.isArray(payload.data)) {
                    console.warn("[Socket] Invalid data_stream payload:", payload);
                    return;
                }

                this.levelSelector.updateLevelNodes(payload.data);
                break;
            }

            default:
                console.warn(`[Socket] Unknown event type: ${payload.event_type}`);
        }
    }

    _scheduleReconnect() {
        if (this.isDisposed || this.reconnectTimer) {
            return;
        }

        // Exponential backoff capped at 30 seconds.
        const delay = Math.min(1000 * 2 ** this.reconnectAttempt, 30000);
        this.reconnectAttempt += 1;

        console.warn(`[Socket] Reconnecting in ${Math.round(delay / 1000)} seconds.`);

        this.reconnectTimer = window.setTimeout(() => {
            this.reconnectTimer = null;
            this._connectWebSocket();
        }, delay);
    }

    dispose() {
        this.isDisposed = true;

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }

        this.levelSelector.dispose();
    }
}

const master = new Master("ws://localhost:8000/ws/levels");
master.start();

// Optional cleanup for a single-page application or page teardown:
// window.addEventListener("beforeunload", () => master.dispose());