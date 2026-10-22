/**
 * Viewport - Base 3D Render Engine
 * Handles scene initialization, rendering, sizing, and generic controls.
 */
class Viewport {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error(`[Viewport Error] Container element #${containerId} not found.`);
            return;
        }

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.clock = new THREE.Clock();

        this.mouse = new THREE.Vector2(-9999, -9999); // Default off-screen

        // Bind core lifecycle methods to maintain correct lexical 'this'
        this.animate = this.animate.bind(this);
        this._onWindowResize = this._onWindowResize.bind(this);
        this._onMouseMove = this._onMouseMove.bind(this);

        this.init();
    }

    /**
     * Initializes the core Three.js components.
     * Can be overridden by subclasses, but super.init() should be called.
     */
    init() {
        this._initScene();
        this._initRenderer();
        this._initControls();
        this._initListeners();
    }

    _initScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x06060c);
        this.scene.fog = new THREE.FogExp2(0x06060c, 0.018);

        this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(30, 25, 38);
    }

    _initRenderer() {
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);
    }

    _initControls() {
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.maxPolarAngle = Math.PI / 2 - 0.02; // Keep camera above horizon
    }

    _initListeners() {
        window.addEventListener('resize', this._onWindowResize);
        window.addEventListener('mousemove', this._onMouseMove);
    }

    _onWindowResize() {
        if (!this.camera || !this.renderer) return;
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    _onMouseMove(event) {
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    }

    /**
     * Core Render Loop
     * Subclasses should override update() instead of animate() to insert logic.
     */
    animate() {
        requestAnimationFrame(this.animate);
        
        const delta = this.clock.getDelta();
        const elapsed = this.clock.getElapsedTime();

        // Subclass-specific updates
        this.update(delta, elapsed);

        if (this.controls) this.controls.update();
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    /**
     * Optional update hook designed for subclasses to inject continuous frame calculations.
     */
    update(delta, elapsed) {
        // To be implemented by subclasses
    }
}

/**
 * LevelSelector - Game-Specific Level Selection Viewport
 * Handles network updates, tower rendering, target selection, and HUD binding.
 */
class LevelSelector extends Viewport {
    constructor(containerId, webSocketUrl) {
        // Initialize base viewport system first
        super(containerId);

        this.wsUrl = webSocketUrl;
        this.nodes = [];           // Raw database level nodes
        this.orbObjects = [];      // Floating interactive mesh targets
        this.sceneObjects = [];    // Non-interactive structural tower meshes
        
        this.currentlyHoveredNode = null;
        this.raycaster = new THREE.Raycaster();

        // HUD DOM Bindings
        this.hud = {
            card: document.getElementById('node-card'),
            title: document.getElementById('node-title'),
            coords: document.getElementById('node-coords'),
            desc: document.getElementById('node-desc'),
            btn: document.getElementById('node-btn')
        };

        // Initialize Level Specific components
        this.initLevelSelector();
    }

    /**
     * Set up tactical gameplay layers & connections
     */
    initLevelSelector() {
        this._initLighting();
        this._initEnvironment();
        this._initInteractivity();
        this._initWebSocket();   
    }

    _initLighting() {
        const ambientLight = new THREE.AmbientLight(0x1a1a3a, 1.2);
        this.scene.add(ambientLight);

        const blueRim = new THREE.DirectionalLight(0x00f0ff, 0.6);
        blueRim.position.set(-30, 10, -30);
        this.scene.add(blueRim);

        const pinkRim = new THREE.DirectionalLight(0xff007f, 0.6);
        pinkRim.position.set(30, 15, 30);
        this.scene.add(pinkRim);
    }

    _initEnvironment() {
        // Cybernetic floor grid
        const gridHelper = new THREE.GridHelper(80, 50, 0xff007f, 0x00f0ff);
        gridHelper.position.y = -0.05;
        gridHelper.material.opacity = 0.25;
        gridHelper.material.transparent = true;
        this.scene.add(gridHelper);

        // Low-Poly Terrain Geo
        const terrainSize = 75;
        const segments = 45;
        const terrainGeo = new THREE.PlaneGeometry(terrainSize, terrainSize, segments, segments);
        terrainGeo.rotateX(-Math.PI / 2);

        const posAttr = terrainGeo.attributes.position;
        for (let i = 0; i < posAttr.count; i++) {
            const x = posAttr.getX(i);
            const z = posAttr.getZ(i);
            let height = Math.cos(x * 0.12) * Math.sin(z * 0.12) * 1.8;
            height += Math.sin(x * 0.05) * 1.2;
            posAttr.setY(i, height);
        }
        terrainGeo.computeVertexNormals();

        const terrainMat = new THREE.MeshStandardMaterial({
            color: 0x0f0f1f,
            roughness: 0.9,
            metalness: 0.2,
            flatShading: true
        });
        const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
        terrainMesh.receiveShadow = true;
        this.scene.add(terrainMesh);

        // Target Interactive Group
        this.interactiveGroup = new THREE.Group();
        this.scene.add(this.interactiveGroup);
    }

    _initInteractivity() {
        // Add viewport click interactions
        window.addEventListener('click', () => {
            if (this.currentlyHoveredNode) {
                const nodeData = this.nodes.find(n => n.id === this.currentlyHoveredNode.userData.nodeId);
                if (nodeData) {
                    this._triggerSelectionFlash();
                    console.log(`>>> INITIALIZING TACTICAL TRANSPORTS: ${nodeData.title.toUpperCase()}`);
                    alert(`>>> INITIALIZING TACTICAL TRANSPORTS TO: ${nodeData.title.toUpperCase()}`);
                }
            }
        });
    }

    _triggerSelectionFlash() {
        this.currentlyHoveredNode.material.emissiveIntensity = 3.0;
        setTimeout(() => {
            if (this.currentlyHoveredNode) {
                this.currentlyHoveredNode.material.emissiveIntensity = 1.8;
            }
        }, 120);
    }

    _initWebSocket() {
        console.log(`[Socket] Uplink targeting: ${this.wsUrl}`);
        this.socket = new WebSocket(this.wsUrl);

        const statusDot = document.getElementById("ws-indicator");
        const statusText = document.getElementById("ws-status");
    
        this.socket.onopen = () => {
          statusDot?.classList.add("connected");
          if (statusText) statusText.innerText = "websocket connected";
        };


        this.socket.onmessage = (event) => {
            try {
                const payload = JSON.parse(event.data);
                const incomingNodes = Array.isArray(payload) ? payload : payload.level_nodes;
                
                if (incomingNodes) {
                    this.updateLevelNodes(incomingNodes);
                }
            } catch (err) {
                console.error("[Socket Error] Frame parsing failure:", err);
            }
        };

        this.socket.onclose = () => {
            console.warn("[Socket Down] Telemetry lost. Re-linking in 5s...");
            setTimeout(() => this._initWebSocket(), 5000);
        };
    }

    /**
     * Clean old structures and build newly arrived Level towers
     */
    updateLevelNodes(newNodesList) {
        this.nodes = newNodesList;
        this.currentlyHoveredNode = null;
        if (this.hud.card) this.hud.card.classList.remove('active');

        // Clean interactive Orbs
        this.orbObjects.forEach(orb => {
            this.interactiveGroup.remove(orb);
            orb.geometry.dispose();
            orb.material.dispose();
        });
        this.orbObjects = [];

        // Clean static Towers
        this.sceneObjects.forEach(obj => {
            this.scene.remove(obj);
            obj.geometry.dispose();
            obj.material.dispose();
        });
        this.sceneObjects = [];

        // Rebuild structures
        this.nodes.forEach(node => {
            const towerHeight = node.towerHeight;

            // Tower Base mesh
            const towerGeo = new THREE.CylinderGeometry(0.8, 1.6, towerHeight, 4);
            const towerMat = new THREE.MeshStandardMaterial({
                color: 0x141426,
                roughness: 0.5,
                metalness: 0.8,
                flatShading: true,
                emissive: node.color,
                emissiveIntensity: 0.08
            });
            const tower = new THREE.Mesh(towerGeo, towerMat);
            tower.position.set(node.pos[0], towerHeight / 2, node.pos[2]);
            this.scene.add(tower);
            this.sceneObjects.push(tower);

            // Tech Accent Ring
            const ringGeo = new THREE.TorusGeometry(1.5, 0.1, 8, 16);
            const ringMat = new THREE.MeshBasicMaterial({ color: node.color, transparent: true, opacity: 0.6 });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.rotation.x = Math.PI / 2;
            ring.position.set(node.pos[0], towerHeight - 0.5, node.pos[2]);
            this.scene.add(ring);
            this.sceneObjects.push(ring);

            // Floating Core Orb
            const orbGeo = new THREE.IcosahedronGeometry(0.9, 1);
            const orbMat = new THREE.MeshStandardMaterial({
                color: node.color,
                emissive: node.color,
                emissiveIntensity: 1.0,
                roughness: 0.2,
                transparent: true,
                opacity: 0.9,
                flatShading: true
            });
            const orb = new THREE.Mesh(orbGeo, orbMat);
            orb.position.set(node.pos[0], node.pos[1], node.pos[2]);

            orb.userData = {
                nodeId: node.id,
                originalColor: node.color,
                baseY: node.pos[1]
            };

            this.interactiveGroup.add(orb);
            this.orbObjects.push(orb);
        });
    }

    /**
     * Frame calculations specifically for Level Selection UI and Animations
     */
    update(delta, elapsed) {
        // 1. Core mesh hover movements
        this.orbObjects.forEach((orb) => {
            orb.position.y = orb.userData.baseY + Math.sin(elapsed * 2 + orb.userData.nodeId) * 0.35;
            orb.rotation.y += 0.012;
            orb.rotation.x += 0.006;
        });

        // 2. Interface Raycasting
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.orbObjects);

        if (intersects.length > 0) {
            const hoveredOrb = intersects[0].object;

            if (this.currentlyHoveredNode !== hoveredOrb) {
                if (this.currentlyHoveredNode) {
                    this.currentlyHoveredNode.material.emissiveIntensity = 1.0;
                    this.currentlyHoveredNode.scale.set(1, 1, 1);
                }

                this.currentlyHoveredNode = hoveredOrb;
                this.currentlyHoveredNode.material.emissiveIntensity = 1.8;
                this.currentlyHoveredNode.scale.set(1.4, 1.4, 1.4);

                const info = this.nodes.find(n => n.id === hoveredOrb.userData.nodeId);
                if (info) this._updateHUD(info);
            }
        } else {
            if (this.currentlyHoveredNode) {
                this.currentlyHoveredNode.material.emissiveIntensity = 1.0;
                this.currentlyHoveredNode.scale.set(1, 1, 1);
                this.currentlyHoveredNode = null;
                if (this.hud.card) this.hud.card.classList.remove('active');
            }
        }
    }

    _updateHUD(info) {
        if (!this.hud.card) return;
        
        this.hud.title.innerText = info.title;
        this.hud.coords.innerText = info.coords;
        this.hud.desc.innerText = info.desc;

        const hexColor = `#${info.color.toString(16).padStart(6, '0')}`;
        this.hud.card.style.borderColor = hexColor;
        this.hud.card.style.boxShadow = `0 0 25px ${hexColor}44`;
        this.hud.title.style.color = hexColor;
        this.hud.title.style.textShadow = `0 0 8px ${hexColor}`;
        
        if (this.hud.btn) {
            this.hud.btn.style.borderColor = hexColor;
            this.hud.btn.style.color = hexColor;
        }

        this.hud.card.classList.add('active');
    }
}


const viewer = new LevelSelector('viewport-container', 'ws://localhost:8000/ws/levels');
viewer.animate();