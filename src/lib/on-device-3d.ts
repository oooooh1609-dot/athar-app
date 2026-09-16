import * as THREE from "three";

export interface OnDevice3DOptions {
  reliefDepth?: number;
  roughness?: number;
  metalness?: number;
  lightIntensity?: number;
}

export class OnDevice3DEngine {
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private currentObject: THREE.Object3D | null = null;
  private reliefMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial> | null = null;
  private dirLight: THREE.DirectionalLight | null = null;
  private animId: number | null = null;

  private isPointerDown = false;
  private pointerPrev = { x: 0, y: 0 };
  private initialPinchDist = 0;
  private targetCanvas: HTMLCanvasElement | null = null;

  private boundPointerDown: ((e: PointerEvent) => void) | null = null;
  private boundPointerMove: ((e: PointerEvent) => void) | null = null;
  private boundPointerUp: ((e: PointerEvent) => void) | null = null;
  private boundTouchStart: ((e: TouchEvent) => void) | null = null;
  private boundTouchMove: ((e: TouchEvent) => void) | null = null;

  public async init(
    targetCanvas: HTMLCanvasElement,
    sourceCanvas: HTMLCanvasElement | HTMLImageElement,
    options: OnDevice3DOptions = {},
  ): Promise<void> {
    this.dispose();
    this.targetCanvas = targetCanvas;

    const {
      reliefDepth = 0.25,
      roughness = 0.86,
      metalness = 0.12,
      lightIntensity = 1.8,
    } = options;

    const width = targetCanvas.clientWidth || 320;
    const height = targetCanvas.clientHeight || 320;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    this.camera.position.set(0, 0, 2.4);

    this.renderer = new THREE.WebGLRenderer({
      canvas: targetCanvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const ambientLight = new THREE.AmbientLight(0xfff7ed, 0.55);
    this.dirLight = new THREE.DirectionalLight(0xffffff, lightIntensity);
    this.dirLight.position.set(1.5, 2.2, 2.0);
    this.scene.add(ambientLight, this.dirLight);

    const texture = new THREE.CanvasTexture(sourceCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    const depthTexture = this.generateGrayscaleDepthTexture(sourceCanvas);

    const sourceWidth =
      "videoWidth" in sourceCanvas
        ? (sourceCanvas as HTMLVideoElement).videoWidth
        : (sourceCanvas as HTMLImageElement).naturalWidth || sourceCanvas.width || 1;
    const sourceHeight =
      "videoHeight" in sourceCanvas
        ? (sourceCanvas as HTMLVideoElement).videoHeight
        : (sourceCanvas as HTMLImageElement).naturalHeight || sourceCanvas.height || 1;
    const aspect = sourceHeight / sourceWidth;

    const planeWidth = 1.3;
    const planeHeight = planeWidth * aspect;
    const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight, 256, 256);

    const material = new THREE.MeshStandardMaterial({
      map: texture,
      displacementMap: depthTexture,
      displacementScale: reliefDepth,
      displacementBias: -reliefDepth * 0.45,
      roughness: roughness,
      metalness: metalness,
      side: THREE.FrontSide,
    });

    this.reliefMesh = new THREE.Mesh(geometry, material);
    this.currentObject = this.reliefMesh;
    this.scene.add(this.reliefMesh);

    this.setupInteractions(targetCanvas, false);
    this.startLoop();
  }

  public async loadArtifactModel(targetCanvas: HTMLCanvasElement, modelUrl: string): Promise<void> {
    this.dispose();
    this.targetCanvas = targetCanvas;

    const width = targetCanvas.clientWidth || 320;
    const height = targetCanvas.clientHeight || 320;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    this.camera.position.set(0, 0.5, 2.5);

    this.renderer = new THREE.WebGLRenderer({
      canvas: targetCanvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.6);
    dirLight.position.set(2, 4, 3);
    this.scene.add(hemiLight, dirLight);

    const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
    const loader = new GLTFLoader();

    loader.load(
      modelUrl,
      (gltf) => {
        const root = gltf.scene;

        const box = new THREE.Box3().setFromObject(root);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);

        const scale = 1.2 / (maxDim || 1);
        root.scale.setScalar(scale);
        root.position.sub(center.multiplyScalar(scale));

        this.scene?.add(root);
        this.currentObject = root;

        this.setupInteractions(targetCanvas, true);
      },
      undefined,
      (err) => console.error("خطأ أثناء تحميل ملف GLB:", err),
    );

    this.startLoop();
  }

  private generateGrayscaleDepthTexture(
    source: HTMLCanvasElement | HTMLImageElement,
  ): THREE.CanvasTexture {
    const tempCanvas = document.createElement("canvas");
    const w = "naturalWidth" in source ? source.naturalWidth : source.width;
    const h = "naturalHeight" in source ? source.naturalHeight : source.height;
    tempCanvas.width = Math.min(w, 1024);
    tempCanvas.height = Math.min(h, 1024);

    const ctx = tempCanvas.getContext("2d", { willReadFrequently: true });
    if (ctx) {
      ctx.drawImage(source, 0, 0, tempCanvas.width, tempCanvas.height);
      const imgData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
      const d = imgData.data;

      for (let i = 0; i < d.length; i += 4) {
        const gray = 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
        d[i] = gray;
        d[i + 1] = gray;
        d[i + 2] = gray;
      }
      ctx.putImageData(imgData, 0, 0);
    }

    const depthTex = new THREE.CanvasTexture(tempCanvas);
    depthTex.generateMipmaps = false;
    depthTex.minFilter = THREE.LinearFilter;
    return depthTex;
  }

  private setupInteractions(canvas: HTMLCanvasElement, allowFull360: boolean) {
    canvas.style.touchAction = "none";

    this.boundPointerDown = (e: PointerEvent) => {
      this.isPointerDown = true;
      this.pointerPrev = { x: e.clientX, y: e.clientY };
    };

    this.boundPointerMove = (e: PointerEvent) => {
      if (!this.isPointerDown || !this.currentObject) return;

      const dx = e.clientX - this.pointerPrev.x;
      const dy = e.clientY - this.pointerPrev.y;

      this.currentObject.rotation.y += dx * 0.007;
      this.currentObject.rotation.x += dy * 0.007;

      if (!allowFull360) {
        this.currentObject.rotation.x = Math.max(
          -0.7,
          Math.min(0.7, this.currentObject.rotation.x),
        );
      }

      this.pointerPrev = { x: e.clientX, y: e.clientY };
    };

    this.boundPointerUp = () => {
      this.isPointerDown = false;
    };

    this.boundTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        this.isPointerDown = false;
        const dx = e.touches[0]!.clientX - e.touches[1]!.clientX;
        const dy = e.touches[0]!.clientY - e.touches[1]!.clientY;
        this.initialPinchDist = Math.hypot(dx, dy);
      }
    };

    this.boundTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && this.camera) {
        const dx = e.touches[0]!.clientX - e.touches[1]!.clientX;
        const dy = e.touches[0]!.clientY - e.touches[1]!.clientY;
        const currentDist = Math.hypot(dx, dy);

        if (this.initialPinchDist > 0) {
          const delta = (this.initialPinchDist - currentDist) * 0.003;
          this.camera.position.z = Math.max(1.2, Math.min(5.0, this.camera.position.z + delta));
        }
        this.initialPinchDist = currentDist;
      }
    };

    canvas.addEventListener("pointerdown", this.boundPointerDown);
    window.addEventListener("pointermove", this.boundPointerMove);
    window.addEventListener("pointerup", this.boundPointerUp);
    canvas.addEventListener("touchstart", this.boundTouchStart, { passive: true });
    canvas.addEventListener("touchmove", this.boundTouchMove, { passive: true });
  }

  public updateReliefDepth(scale: number) {
    if (this.reliefMesh && this.reliefMesh.material) {
      this.reliefMesh.material.displacementScale = scale;
      this.reliefMesh.material.displacementBias = -scale * 0.45;
      this.reliefMesh.material.needsUpdate = true;
    }
  }

  private startLoop() {
    const renderLoop = () => {
      this.animId = requestAnimationFrame(renderLoop);
      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }
    };
    renderLoop();
  }

  public dispose() {
    if (this.animId !== null) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }

    if (this.targetCanvas) {
      if (this.boundPointerDown)
        this.targetCanvas.removeEventListener("pointerdown", this.boundPointerDown);
      if (this.boundTouchStart)
        this.targetCanvas.removeEventListener("touchstart", this.boundTouchStart);
      if (this.boundTouchMove)
        this.targetCanvas.removeEventListener("touchmove", this.boundTouchMove);
    }
    if (this.boundPointerMove) window.removeEventListener("pointermove", this.boundPointerMove);
    if (this.boundPointerUp) window.removeEventListener("pointerup", this.boundPointerUp);

    if (this.reliefMesh) {
      this.reliefMesh.geometry.dispose();
      if (this.reliefMesh.material.map) this.reliefMesh.material.map.dispose();
      if (this.reliefMesh.material.displacementMap)
        this.reliefMesh.material.displacementMap.dispose();
      this.reliefMesh.material.dispose();
      this.reliefMesh = null;
    }

    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer = null;
    }

    this.scene = null;
    this.camera = null;
    this.dirLight = null;
    this.currentObject = null;
    this.targetCanvas = null;
  }
}
