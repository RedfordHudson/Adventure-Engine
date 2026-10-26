
class MapTest {
    constructor(containerId = "viewport-container") {
        this.container = document.getElementById(containerId);

        if (!this.container || !window.maplibregl || !window.THREE) {
            throw new Error("[MapTest] Missing container or dependencies.");
        }

        this.container.style.position = "relative";
        this.container.style.width = "100%";
        this.container.style.height ||= "600px";

        this.nodes = [
            { id: "A", name: "Origin", lng: -117.1611, lat: 32.7157, height: 0, color: 0xff3366 },
            { id: "B", name: "North", lng: -117.1585, lat: 32.7180, height: 100, color: 0x33ccff },
            { id: "C", name: "East", lng: -117.1570, lat: 32.7138, height: 50, color: 0xffcc33 },
            { id: "D", name: "West", lng: -117.1640, lat: 32.7148, height: 150, color: 0x66ff99 },
            { id: "E", name: "South", lng: -117.1600, lat: 32.7118, height: 75, color: 0xcc66ff }
        ];

        this._createMap();
        this._createOverlay();
        this._createLayer();
        this._bindEvents();

        window.mapTest = this;

        this.connectWebSocket("ws://localhost:8000/ws/levels");
    }

    _createMap() {
        this.map = new maplibregl.Map({
            container: this.container,
            style: "https://demotiles.maplibre.org/style.json",
            center: [-117.1611, 32.7157],
            zoom: 14,
            pitch: 55,
            antialias: true
        });

        this.map.addControl(new maplibregl.NavigationControl());
    }

    _createOverlay() {
        this.panel = document.createElement("div");

        Object.assign(this.panel.style, {
            position: "absolute",
            zIndex: "1000",
            top: "12px",
            left: "12px",
            padding: "12px",
            background: "#111e",
            color: "white",
            font: "13px monospace",
            border: "1px solid #555",
            borderRadius: "6px",
            pointerEvents: "none",
            lineHeight: "1.6"
        });

        this.panel.innerHTML = `
            <strong>3D NODE TEST</strong><br>
            Nodes: <span id="node-count">0</span><br>
            Selected: <span id="selected-node">None</span><br>
            <span style="color:#aaa">Click a sphere to select it</span>
        `;

        this.container.appendChild(this.panel);

        this.nodeCount = this.panel.querySelector("#node-count");
        this.selectedLabel = this.panel.querySelector("#selected-node");
    }

    _createLayer() {
        this.layer = {
            id: "threejs-nodes",
            type: "custom",
            renderingMode: "3d",

            onAdd: (mapInstance, gl) => {
                this.camera = new THREE.PerspectiveCamera();
                this.scene = new THREE.Scene();
                this.nodeMeshes = [];
                this.lineObjects = [];

                const origin = maplibregl.MercatorCoordinate.fromLngLat(
                    [-117.1611, 32.7157],
                    0
                );

                this.meterScale = origin.meterInMercatorCoordinateUnits();

                const sphereGeometry = new THREE.SphereGeometry(1, 24, 16);

                for (const node of this.nodes) {
                    const mercator = maplibregl.MercatorCoordinate.fromLngLat(
                        [node.lng, node.lat],
                        node.height
                    );

                    const sphere = new THREE.Mesh(
                        sphereGeometry,
                        new THREE.MeshBasicMaterial({ color: node.color })
                    );

                    sphere.position.set(
                        mercator.x,
                        mercator.y,
                        mercator.z
                    );

                    sphere.scale.setScalar(180 * this.meterScale);
                    sphere.userData.node = node;

                    this.scene.add(sphere);
                    this.nodeMeshes.push(sphere);
                }

                // Connect each node to node A.
                const anchor = this.nodeMeshes[0].position;

                for (const sphere of this.nodeMeshes.slice(1)) {
                    const geometry = new THREE.BufferGeometry().setFromPoints([
                        anchor.clone(),
                        sphere.position.clone()
                    ]);

                    const line = new THREE.Line(
                        geometry,
                        new THREE.LineBasicMaterial({
                            color: sphere.userData.node.color,
                            transparent: true,
                            opacity: 0.8
                        })
                    );

                    this.scene.add(line);
                    this.lineObjects.push(line);
                }

                this.renderer = new THREE.WebGLRenderer({
                    canvas: mapInstance.getCanvas(),
                    context: gl
                });

                this.renderer.autoClear = false;
                this.raycaster = new THREE.Raycaster();
                this.pointer = new THREE.Vector2();

                this.nodeCount.textContent = String(this.nodes.length);

                console.log("[MapTest] Nodes and connections initialized.");
            },

            render: (gl, args) => {
                const matrix = args?.defaultProjectionData?.mainMatrix;
                if (!matrix) return;

                this.camera.projectionMatrix.fromArray(matrix);
                this.camera.projectionMatrixInverse
                    .copy(this.camera.projectionMatrix)
                    .invert();

                this.renderer.resetState();
                this.renderer.render(this.scene, this.camera);
            },

            onRemove: () => {
                this._disposeLayer();
            }
        };

        this.map.on("load", () => {
            this.map.addLayer(this.layer);
        });
    }

    _bindEvents() {
        this._onClick = (event) => {
            if (!this.nodeMeshes?.length) return;

            const rect = this.map.getCanvas().getBoundingClientRect();

            this.pointer.x = (event.point.x / rect.width) * 2 - 1;
            this.pointer.y = -(event.point.y / rect.height) * 2 + 1;

            this.raycaster.setFromCamera(this.pointer, this.camera);

            const hits = this.raycaster.intersectObjects(
                this.nodeMeshes,
                false
            );

            if (!hits.length) return;

            const node = hits[0].object.userData.node;
            this.selectedLabel.textContent = `${node.id} — ${node.name}`;

            for (const mesh of this.nodeMeshes) {
                mesh.material.color.set(
                    mesh.userData.node.id === node.id
                        ? 0xffffff
                        : mesh.userData.node.color
                );
            }

            this.map.triggerRepaint();
            console.log("[MapTest] Selected node:", node);
        };

        this._onError = (event) => {
            console.error("[MapTest] Map error:", event.error || event);
        };

        this.map.on("click", this._onClick);
        this.map.on("error", this._onError);
    }

    _disposeLayer() {
        if (this.nodeMeshes) {
            // Shared sphere geometry: dispose it only once.
            this.nodeMeshes[0]?.geometry.dispose();

            for (const mesh of this.nodeMeshes) {
                mesh.material.dispose();
            }
        }

        for (const line of this.lineObjects || []) {
            line.geometry.dispose();
            line.material.dispose();
        }

        this.renderer?.dispose();

        this.nodeMeshes = [];
        this.lineObjects = [];
    }

    dispose() {
        this.map.off("click", this._onClick);
        this.map.off("error", this._onError);
        this.map.remove();
        this.panel.remove();

        if (window.mapTest === this) {
            delete window.mapTest;
        }

        this.ws?.close();
    }


    connectWebSocket(url = "ws://localhost:8000/ws/levels") {
        this.wsUrl = url;
        this.ws?.close();

        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
            console.log("[MapTest] WebSocket connected.");
        };

        this.ws.onmessage = (event) => {
            let message;

            try {
                message = JSON.parse(event.data);
                console.log(message)
            } catch (error) {
                console.error("[MapTest] Invalid WebSocket JSON:", error);
                return;
            }

            if (message.event_type === "data_stream") {
                this.updateNodes(message.data);
            }
        };

        this.ws.onerror = (error) => {
            console.error("[MapTest] WebSocket error:", error);
        };

        this.ws.onclose = () => {
            console.log("[MapTest] WebSocket disconnected.");
        };
    }

    updateNodes(data) {
        if (!Array.isArray(data)) {
            console.warn("[MapTest] Expected an array of nodes.", data);
            return;
        }

        console.log(data)

        this.nodes = data.map((node, index) => ({
            id: String(node.id ?? index),
            name: node.name ?? node.title ?? `Node ${index}`,
            lng: Number(node.lng ?? node.lon ?? node.longitude),
            lat: Number(node.lat ?? node.latitude),
            height: Number(node.height ?? node.altitude ?? 0),
            color: node.color ?? 0x33ccff
        })).filter(node =>
            Number.isFinite(node.lng) &&
            Number.isFinite(node.lat) &&
            node.lng >= -180 && node.lng <= 180 &&
            node.lat >= -90 && node.lat <= 90
        );

        this._rebuildNodes();
    }

    _rebuildNodes() {
        if (!this.scene || !this.nodeMeshes) return;

        // Remove old node meshes and connections.
        for (const mesh of this.nodeMeshes) {
            this.scene.remove(mesh);
            mesh.material.dispose();
        }

        for (const line of this.lineObjects) {
            this.scene.remove(line);
            line.geometry.dispose();
            line.material.dispose();
        }

        this.nodeMeshes = [];
        this.lineObjects = [];

        const sphereGeometry = new THREE.SphereGeometry(1, 24, 16);

        for (const node of this.nodes) {
            const mercator = maplibregl.MercatorCoordinate.fromLngLat(
                [node.lng, node.lat],
                node.height
            );

            const sphere = new THREE.Mesh(
                sphereGeometry,
                new THREE.MeshBasicMaterial({ color: node.color })
            );

            sphere.position.set(mercator.x, mercator.y, mercator.z);
            sphere.scale.setScalar(180 * this.meterScale);
            sphere.userData.node = node;

            this.scene.add(sphere);
            this.nodeMeshes.push(sphere);
        }

        // Connect all nodes to the first node.
        const anchor = this.nodeMeshes[0]?.position;

        if (anchor) {
            for (const sphere of this.nodeMeshes.slice(1)) {
                const line = new THREE.Line(
                    new THREE.BufferGeometry().setFromPoints([
                        anchor.clone(),
                        sphere.position.clone()
                    ]),
                    new THREE.LineBasicMaterial({
                        color: sphere.userData.node.color,
                        transparent: true,
                        opacity: 0.8
                    })
                );

                this.scene.add(line);
                this.lineObjects.push(line);
            }
        }

        this.nodeCount.textContent = String(this.nodes.length);
        this.selectedLabel.textContent = "None";

        this.map.triggerRepaint();
    }

}

// Initialize
const mapTest = new MapTest();

// Cleanup when needed:
// mapTest.dispose();
