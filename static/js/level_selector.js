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
            btn: document.getElementById('node-btn'),
            iframe: document.getElementById('node-preview-iframe')
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
        // High-intensity warm ambient light to illuminate dark faces
        const ambientLight = new THREE.AmbientLight(0xffebd9, 1.8); 
        this.scene.add(ambientLight);

        // Blazing Golden Key Sunlight
        const sunLight = new THREE.DirectionalLight(0xffaa44, 2.5);
        sunLight.position.set(40, 50, 30);
        sunLight.castShadow = true;
        
        // Optimize shadows for bright environment
        sunLight.shadow.mapSize.width = 2048;
        sunLight.shadow.mapSize.height = 2048;
        sunLight.shadow.bias = -0.001;
        this.scene.add(sunLight);

        // Cyber Magenta Fill Light (for warm neon shadows)
        const shadowFill = new THREE.DirectionalLight(0xff00aa, 0.8);
        shadowFill.position.set(-40, 20, -30);
        this.scene.add(shadowFill);

        // Brighten up the scene background and fog to match daylight sunset
        this.scene.background = new THREE.Color(0x2b1025); 
        this.scene.fog = new THREE.FogExp2(0x2b1025, 0.012);
    }

    _initEnvironment() {
        // 1. Warm Cyber Grid
        const gridHelper = new THREE.GridHelper(90, 45, 0xff7b00, 0xff0055);
        gridHelper.position.y = -0.05;
        gridHelper.material.opacity = 0.15;
        gridHelper.material.transparent = true;
        this.scene.add(gridHelper);

        // 2. Rugged RPG Fantasy Landscape Plane
        const terrainSize = 100;
        const segments = 60;
        const terrainGeo = new THREE.PlaneGeometry(terrainSize, terrainSize, segments, segments);
        terrainGeo.rotateX(-Math.PI / 2);

        const posAttr = terrainGeo.attributes.position;
        for (let i = 0; i < posAttr.count; i++) {
            const x = posAttr.getX(i);
            const z = posAttr.getZ(i);
            
            // Higher, more organic mountain ridges combined with low valleys
            let height = Math.sin(x * 0.08) * Math.cos(z * 0.08) * 3.5;
            height += Math.sin(x * 0.03) * 2.0; // Broad topography layers
            
            // Flatten the center play area slightly so towers sit naturally
            const distFromCenter = Math.sqrt(x*x + z*z);
            if (distFromCenter < 25) {
                height *= (distFromCenter / 25);
            }
            posAttr.setY(i, height);
        }
        terrainGeo.computeVertexNormals();

        const terrainMat = new THREE.MeshStandardMaterial({
            color: 0x1a0f18, // Deep warm obsidian/mulberry soil
            roughness: 0.85,
            metalness: 0.1,
            flatShading: true
        });
        const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
        terrainMesh.receiveShadow = true;
        this.scene.add(terrainMesh);

        // 3. Spawning arbitrary natural/cyber landmarks (e.g., giant glowing crystal obelisks)
        const landmarkPositions = [[-25, -20], [28, 22], [-30, 15]];
        landmarkPositions.forEach(([lx, lz], idx) => {
            const obeliskGeo = new THREE.ConeGeometry(2, 12, 4);
            const obeliskMat = new THREE.MeshStandardMaterial({
                color: 0x2e0854,
                emissive: idx % 2 === 0 ? 0xff3300 : 0xff0055,
                emissiveIntensity: 0.15,
                roughness: 0.1,
                metalness: 0.9,
                flatShading: true
            });
            const obelisk = new THREE.Mesh(obeliskGeo, obeliskMat);
            obelisk.position.set(lx, 5, lz);
            obelisk.rotation.y = idx * 0.5;
            this.scene.add(obelisk);
        });

        // Group for updating nodes dynamically
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
     * Helper to render dynamic text onto a canvas texture for 3D viewport titles
     */
    _createFloatingTextTexture(text, colorHex) {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        // Transparent background
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Cyber font style
        ctx.font = 'bold 36px monospace';
        ctx.fillStyle = colorHex;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Add cyber glow shadow
        ctx.shadowColor = colorHex;
        ctx.shadowBlur = 10;
        ctx.fillText(text.toUpperCase(), 256, 64);

        const texture = new THREE.CanvasTexture(canvas);
        return texture;
    }

    updateLevelNodes(newNodesList) {
        this.nodes = newNodesList;
        this.currentlyHoveredNode = null;
        if (this.hud.card) this.hud.card.classList.remove('active');

        // Cleanup previous meshes to protect VRAM
        this.orbObjects.forEach(orb => {
            this.interactiveGroup.remove(orb);
            orb.geometry.dispose();
            orb.material.dispose();
        });
        this.orbObjects = [];

        this.sceneObjects.forEach(obj => {
            this.scene.remove(obj);
            obj.geometry.dispose();
            if (Array.isArray(obj.material)) {
                obj.material.forEach(m => m.dispose());
            } else {
                obj.material.dispose();
            }
        });
        this.sceneObjects = [];

        const textureLoader = new THREE.TextureLoader();

        this.nodes.forEach(node => {
            const towerHeight = node.towerHeight;
            const hexColorStr = `#${node.color.toString(16).padStart(6, '0')}`;

            // A. Base Cyber-Tower
            const towerGeo = new THREE.CylinderGeometry(0.8, 1.6, towerHeight, 4);
            const towerMat = new THREE.MeshStandardMaterial({
                color: 0x3d2538, // Lighter, warmer metallic alloy base
                roughness: 0.3,
                metalness: 0.7,
                flatShading: true,
                emissive: node.color,
                emissiveIntensity: 0.15
            });
            const tower = new THREE.Mesh(towerGeo, towerMat);
            tower.position.set(node.pos[0], towerHeight / 2, node.pos[2]);
            this.scene.add(tower);
            this.sceneObjects.push(tower);

            // B. Tech Glow Ring
            const ringGeo = new THREE.TorusGeometry(1.6, 0.08, 8, 16);
            const ringMat = new THREE.MeshBasicMaterial({ color: node.color, transparent: true, opacity: 0.8 });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.rotation.x = Math.PI / 2;
            ring.position.set(node.pos[0], towerHeight - 0.2, node.pos[2]);
            this.scene.add(ring);
            this.sceneObjects.push(ring);

            // C. 2D Hologram Image Banner (Positioned directly next to the tower top)
            if (node.imageUrl) {
                const imageGeo = new THREE.PlaneGeometry(3.5, 4.5);
                const imageMat = new THREE.MeshBasicMaterial({
                    transparent: true,
                    opacity: 0.95,
                    side: THREE.DoubleSide,
                    color: 0xffffff
                });

                textureLoader.load(node.imageUrl, (texture) => {
                    imageMat.map = texture;
                    imageMat.needsUpdate = true;
                }, undefined, () => {
                    imageMat.color.setHex(node.color);
                });

                const imagePlane = new THREE.Mesh(imageGeo, imageMat);
                // Positioned on the left side of the tower, floating slightly
                imagePlane.position.set(node.pos[0] - 2.8, towerHeight + 1.5, node.pos[2]);
                
                // Flag this plane as a billboard target
                imagePlane.userData = { isBillboard: true };
                this.scene.add(imagePlane);
                this.sceneObjects.push(imagePlane);
            }

            // D. Floating Title Canvas Plane Above Node
            const textTexture = this._createFloatingTextTexture(node.title, hexColorStr);
            const textGeo = new THREE.PlaneGeometry(8, 2);
            const textMat = new THREE.MeshBasicMaterial({
                map: textTexture,
                transparent: true,
                side: THREE.DoubleSide
            });
            const textMesh = new THREE.Mesh(textGeo, textMat);
            // Positioned high above the tower
            textMesh.position.set(node.pos[0], towerHeight + 4.2, node.pos[2]);
            
            // Flag this text plane as a billboard target
            textMesh.userData = { isBillboard: true };
            this.scene.add(textMesh);
            this.sceneObjects.push(textMesh);

            // E. Floating Core Orb
            const orbGeo = new THREE.IcosahedronGeometry(1.0, 1);
            const orbMat = new THREE.MeshStandardMaterial({
                color: node.color,
                emissive: node.color,
                emissiveIntensity: 1.4,
                roughness: 0.1,
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

    update(delta, elapsed) {
        // 1. Smooth levitation and spinning core orbs
        this.orbObjects.forEach((orb) => {
            orb.position.y = orb.userData.baseY + Math.sin(elapsed * 2 + orb.userData.nodeId) * 0.35;
            orb.rotation.y += 0.012;
            orb.rotation.x += 0.006;
        });

        // 2. Billboard alignment: Force both images and text planes to face the viewport viewer
        this.sceneObjects.forEach((obj) => {
            if (obj.userData && obj.userData.isBillboard) {
                obj.quaternion.copy(this.camera.quaternion);
            }
        });

        // 3. Update Intersections / Selection
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

        // this.hud.iframe.src = `https://image.thum.io/get/width/400/crop/800/${info.url}`;
        // this.hud.iframe.src = `${info.url}`;
        this.hud.iframe.src = info.url;
        
        if (this.hud.btn) {
            this.hud.btn.style.borderColor = hexColor;
            this.hud.btn.style.color = hexColor;
        }

        this.hud.card.classList.add('active');
    }
}


const viewer = new LevelSelector('viewport-container', 'ws://localhost:8000/ws/levels');
viewer.animate();