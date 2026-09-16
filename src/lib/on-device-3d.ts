// src/lib/on-device-3d.ts
import * as THREE from "three";

export interface OnDevice3DOptions {
  reliefDepth?: number; // عمق وبروز النقر الحجري (الافتراضي: 0.25)
  roughness?: number; // خشونة سطح الحجر (0.0 إلى 1.0)
  metalness?: number; // لمعان الشوائب المعدنية والكوارتز
  lightIntensity?: number; // شدة ضوء الشمس الافتراضي
}

export class OnDevice3DEngine {
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial> | null = null;
  private dirLight: THREE.DirectionalLight | null = null;
  private animId: number | null = null;

  // إدارة التفاعل باللمس
  private isPointerDown = false;
  private pointerPrev = { x: 0, y: 0 };
  private initialPinchDist = 0;
  private targetCanvas: HTMLCanvasElement | null = null;

  // مستمعات الأحداث للتنظيف
  private boundPointerDown: ((e: PointerEvent) => void) | null = null;
  private boundPointerMove: ((e: PointerEvent) => void) | null = null;
  private boundPointerUp: ((e: PointerEvent) => void) | null = null;
  private boundTouchStart: ((e: TouchEvent) => void) | null = null;
  private boundTouchMove: ((e: TouchEvent) => void) | null = null;

  /**
   * تهيئة وبناء المجسم الصخري ثلاثي الأبعاد محلياً على الهاتف
   */
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

    // 1. إعداد المشهد ومحرك التصيير المعزز بكرت شاشة الهاتف (WebGL)
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    this.camera.position.set(0, 0, 2.4);

    this.renderer = new THREE.WebGLRenderer({
      canvas: targetCanvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    });
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // 2. منظومة الإضاءة المحاكية لشمس الصحراء
    const ambientLight = new THREE.AmbientLight(0xfff7ed, 0.55);
    this.dirLight = new THREE.DirectionalLight(0xffffff, lightIntensity);
    this.dirLight.position.set(1.5, 2.2, 2.0);
    this.scene.add(ambientLight, this.dirLight);

    // 3. استخراج خريطة الارتفاع والنسيج اللوني من الكانفاس الأصلي
    const texture = new THREE.CanvasTexture(sourceCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    // خريطة العمق: تحويل بكسلات الصورة إلى تباين رمادي لتعيين عمق النقر
    const depthTexture = this.generateGrayscaleDepthTexture(sourceCanvas);

    // شبكة مضلعات هندسية عالية الدقة (256x256 = 65,536 رأس هندسي)
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

    // مادة الصخر مع دمج خريطة الإزاحة الهندسية (Displacement Map)
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      displacementMap: depthTexture,
      displacementScale: reliefDepth,
      displacementBias: -reliefDepth * 0.45, // الحفاظ على مركزية الكتلة
      roughness: roughness,
      metalness: metalness,
      side: THREE.FrontSide,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.mesh);

    // 4. ربط اللمس والإيماءات الميدانية
    this.setupInteractions(targetCanvas);

    // 5. حلقة التدوير والعرض (60fps)
    const renderLoop = () => {
      this.animId = requestAnimationFrame(renderLoop);
      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }
    };
    renderLoop();
  }

  /**
   * توليد خريطة تباين للعمق لعزل ضربات الإزميل والتجاويف الحجرية
   */
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
        // حساب السطوع الضوئي (Luminance) لاستنتاج الانخفاض والارتفاع
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

  /**
   * ربط إيماءات اللمس: التدوير بإصبع واحد والتكبير بإصبعين
   */
  private setupInteractions(canvas: HTMLCanvasElement) {
    canvas.style.touchAction = "none";

    this.boundPointerDown = (e: PointerEvent) => {
      this.isPointerDown = true;
      this.pointerPrev = { x: e.clientX, y: e.clientY };
    };

    this.boundPointerMove = (e: PointerEvent) => {
      if (!this.isPointerDown || !this.mesh) return;

      const dx = e.clientX - this.pointerPrev.x;
      const dy = e.clientY - this.pointerPrev.y;

      // تدوير المجسم حول المحورين الأفقي والرأسي
      this.mesh.rotation.y += dx * 0.007;
      this.mesh.rotation.x += dy * 0.007;

      // تحديد أقصى زاوية ميلان لمنع انقلاب الصخرة
      this.mesh.rotation.x = Math.max(-0.7, Math.min(0.7, this.mesh.rotation.x));
      this.pointerPrev = { x: e.clientX, y: e.clientY };
    };

    this.boundPointerUp = () => {
      this.isPointerDown = false;
    };

    // دعم التكبير والتصغير (Pinch-to-Zoom)
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
          this.camera.position.z = Math.max(1.2, Math.min(4.5, this.camera.position.z + delta));
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

  /**
   * تحديث عمق النقر الحجري مباشرة عند تحريك شريط الشدة
   */
  public updateReliefDepth(scale: number) {
    if (this.mesh && this.mesh.material) {
      this.mesh.material.displacementScale = scale;
      this.mesh.material.displacementBias = -scale * 0.45;
      this.mesh.material.needsUpdate = true;
    }
  }

  /**
   * تحريك زاوية الضوء الشمسي الافتراضي ككشاف يدوي لكشف زوايا الحفر
   */
  public updateLightAngle(angleRad: number) {
    if (this.dirLight) {
      this.dirLight.position.x = Math.cos(angleRad) * 2.5;
      this.dirLight.position.y = Math.sin(angleRad) * 2.5;
    }
  }

  /**
   * تنظيف وإفراغ موارد الذاكرة والـ WebGL بالكامل لتفادي استنزاف بطارية الجوال
   */
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

    if (this.mesh) {
      this.mesh.geometry.dispose();
      if (Array.isArray(this.mesh.material)) {
        this.mesh.material.forEach((m) => m.dispose());
      } else {
        if (this.mesh.material.map) this.mesh.material.map.dispose();
        if (this.mesh.material.displacementMap) this.mesh.material.displacementMap.dispose();
        this.mesh.material.dispose();
      }
      this.mesh = null;
    }

    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer = null;
    }

    this.scene = null;
    this.camera = null;
    this.dirLight = null;
    this.targetCanvas = null;
  }
}
