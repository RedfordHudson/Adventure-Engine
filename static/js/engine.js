/**
 * engine.js
 * Hardware-accelerated WebGL renderer responding to Python-generated DOM elements.
 */
const VIEW_EXTENT = 24;
const LERP_FACTOR = 0.18;

class IsometricViewer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.instances = [];
    this.targetData = null;
    this.currentScales = [];
    this.currentColors = [];

    this.lastFrameTime = performance.now();
    this.frameCount = 0;
    this.fpsCounterEl = document.getElementById("fps-counter");

    this.initThree();
    this.initLights();
    this.initMesh();
    this.initEvents();
    this.initWebSocket();
  }

  initThree() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x080a0f);
    this.scene.fog = new THREE.FogExp2(0x080a0f, 0.015);

    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.OrthographicCamera(
      -VIEW_EXTENT * aspect,
      VIEW_EXTENT * aspect,
      VIEW_EXTENT,
      -VIEW_EXTENT,
      -200,
      500
    );

    const d = 50;
    this.camera.position.set(d, d, d);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: "high-performance"
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  initLights() {
    const ambient = new THREE.AmbientLight(0x1e293b, 1.2);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(35, 60, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -30;
    sun.shadow.camera.right = 30;
    sun.shadow.camera.top = 30;
    sun.shadow.camera.bottom = -30;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);

    const rim = new THREE.DirectionalLight(0x38bdf8, 1.5);
    rim.position.set(-30, 25, -20);
    this.scene.add(rim);
  }

  initMesh() {
    const GRID_SIZE = 32;
    this.count = GRID_SIZE * GRID_SIZE;
    const geometry = new THREE.BoxGeometry(0.9, 1.0, 0.9);
    const material = new THREE.MeshStandardMaterial({
      roughness: 0.28,
      metalness: 0.15
    });

    this.instancedMesh = new THREE.InstancedMesh(geometry, material, this.count);
    this.instancedMesh.castShadow = true;
    this.instancedMesh.receiveShadow = true;
    this.scene.add(this.instancedMesh);

    this.dummy = new THREE.Object3D();
    this.tmpColor = new THREE.Color();

    for (let i = 0; i < this.count; i++) {
      this.currentScales[i] = 1.0;
      this.currentColors[i] = [0.1, 0.15, 0.25];
    }
  }

  initWebSocket() {
    const statusDot = document.getElementById("ws-indicator");
    const statusText = document.getElementById("ws-status");
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    this.socket = new WebSocket(`${protocol}//${window.location.host}/ws/stream`);

    this.socket.onopen = () => {
      statusDot?.classList.add("connected");
      if (statusText) statusText.innerText = "Python Stream Active (35 Hz)";
    };

    this.socket.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      this.targetData = payload.instances;
    };

    this.socket.onclose = () => {
      statusDot?.classList.remove("connected");
      if (statusText) statusText.innerText = "Reconnecting to Python...";
      setTimeout(() => this.initWebSocket(), 2000);
    };
  }

  initEvents() {
    window.addEventListener("resize", () => {
      const aspect = window.innerWidth / window.innerHeight;
      this.camera.left = -VIEW_EXTENT * aspect;
      this.camera.right = VIEW_EXTENT * aspect;
      this.camera.top = VIEW_EXTENT;
      this.camera.bottom = -VIEW_EXTENT;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFrameTime >= 1000) {
      if (this.fpsCounterEl) this.fpsCounterEl.innerText = this.frameCount;
      this.frameCount = 0;
      this.lastFrameTime = now;
    }

    if (this.targetData) {
      const len = Math.min(this.count, this.targetData.length);
      for (let i = 0; i < len; i++) {
        const t = this.targetData[i];
        this.currentScales[i] += (t.sy - this.currentScales[i]) * LERP_FACTOR;
        const curY = this.currentScales[i] / 2.0;

        this.dummy.position.set(t.x, curY, t.z);
        this.dummy.scale.set(1.0, this.currentScales[i], 1.0);
        this.dummy.updateMatrix();
        this.instancedMesh.setMatrixAt(i, this.dummy.matrix);

        const [cr, cg, cb] = this.currentColors[i];
        const [tr, tg, tb] = t.color;
        const nr = cr + (tr - cr) * LERP_FACTOR;
        const ng = cg + (tg - cg) * LERP_FACTOR;
        const nb = cb + (tb - cb) * LERP_FACTOR;
        this.currentColors[i] = [nr, ng, nb];

        this.tmpColor.setRGB(nr, ng, nb);
        this.instancedMesh.setColorAt(i, this.tmpColor);
      }
      this.instancedMesh.instanceMatrix.needsUpdate = true;
      if (this.instancedMesh.instanceColor) this.instancedMesh.instanceColor.needsUpdate = true;
    }

    this.renderer.render(this.scene, this.camera);
  }
}

const viewer = new IsometricViewer("stage");
viewer.animate();