import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export type ArtifactClass = "auto" | "pottery" | "statue" | "coin" | "slab";
export type InspectionMode = "pbr_aniso" | "curvature" | "dstretch" | "chisel_tool" | "lidar";

export interface ReliefEngineOptions {
  reliefDepth?: number;
  roughness?: number;
  metalness?: number;
  lightIntensity?: number;
  slabThickness?: number;
  artifactType?: ArtifactClass;
}

interface VectorizedTexturesResult {
  baseTexture: THREE.Texture;
  normalTexture: THREE.CanvasTexture;
  cavityTexture: THREE.CanvasTexture;
  dStretchTexture: THREE.CanvasTexture;
}

interface MorphologyAnalysisResult extends VectorizedTexturesResult {
  w: number;
  h: number;
  heightMap: Float32Array;
  macroProfile: Float32Array;
  minY: number;
  maxY: number;
  detectedClass: ArtifactClass;
}

export class OnDevice3DEngine {
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private artifactMesh: THREE.Mesh | null = null;
  private volumetricModel: THREE.Group | null = null;

  private hudScene: THREE.Scene | null = null;
  private hudCamera: THREE.OrthographicCamera | null = null;
  private hudPlane: THREE.Mesh | null = null;

  private rtiLightDir = new THREE.Vector3(0.45, 0.65, 0.85).normalize();
  private baseLightIntensity = 3.2;

  // إدارة الذاكرة الثابتة لمنع Garbage Collection
  private static sharedFloatBuffer = new Float32Array(512 * 512);

  private materials: Record<InspectionMode, THREE.ShaderMaterial | null> = {
    pbr_aniso: null,
    curvature: null,
    dstretch: null,
    chisel_tool: null,
    lidar: null,
  };
  private activeMode: InspectionMode = "pbr_aniso";

  private animationFrameId: number | null = null;
  private isInteracting = false;
  private isRtiAdjusting = false;
  private previousTouch = { x: 0, y: 0 };
  private touchVelocity = { x: 0, y: 0 };
  private initialPinchDist = 0;
  private lastTapTimestamp = 0;
  private resizeObserver: ResizeObserver | null = null;

  private allocatedTextures: THREE.Texture[] = [];
  private allocatedGeometries: THREE.BufferGeometry[] = [];
  private allocatedMaterials: THREE.Material[] = [];

  public async init(
    canvas: HTMLCanvasElement,
    source: HTMLCanvasElement | HTMLImageElement,
    options: ReliefEngineOptions = {},
  ): Promise<void> {
    this.dispose();

    const {
      reliefDepth = 0.42,
      roughness = 0.72,
      metalness = 0.14,
      lightIntensity = 3.2,
      slabThickness = 0.34,
      artifactType = "auto",
    } = options;

    this.baseLightIntensity = lightIntensity;
    const width = canvas.clientWidth || 320;
    const height = canvas.clientHeight || 320;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 100);
    this.camera.position.set(0, 0, 2.85);

    this.initHudSystem(width, height);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
    });
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.22;
    this.renderer.autoClear = false;

    this.initStudioEnvironment();

    const analysis = this.analyzeMorphologySIMD(source);
    const resolvedClass = artifactType === "auto" ? analysis.detectedClass : artifactType;

    const geometry = this.constructArchaeologicalMesh(
      analysis,
      resolvedClass,
      reliefDepth,
      slabThickness,
    );
    this.allocatedGeometries.push(geometry);

    this.initArchaeologicalMaterials(analysis, resolvedClass, roughness, metalness);

    this.artifactMesh = new THREE.Mesh(geometry, this.materials.pbr_aniso!);
    this.scene.add(this.artifactMesh);

    this.bindTouchControls(canvas);
    this.setupResizeWatcher(canvas);

    this.animate();
  }

  private initHudSystem(w: number, h: number): void {
    this.hudScene = new THREE.Scene();
    this.hudCamera = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 1, 10);
    this.hudCamera.position.z = 5;

    const scaleCanvas = document.createElement("canvas");
    scaleCanvas.width = 160;
    scaleCanvas.height = 40;
    const ctx = scaleCanvas.getContext("2d")!;

    ctx.fillStyle = "rgba(20, 18, 16, 0.65)";
    ctx.roundRect(0, 0, 160, 40, 8);
    ctx.fill();
    ctx.strokeStyle = "rgba(217, 119, 6, 0.85)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(10, 22, 70, 8);
    ctx.fillStyle = "#000000";
    ctx.fillRect(80, 22, 70, 8);
    ctx.strokeStyle = "#d97706";
    ctx.strokeRect(10, 22, 140, 8);

    ctx.fillStyle = "#f5f5f4";
    ctx.font = "bold 11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("0        2.5        5 cm", 80, 15);

    const hudTexture = new THREE.CanvasTexture(scaleCanvas);
    this.allocatedTextures.push(hudTexture);

    const hudMaterial = new THREE.MeshBasicMaterial({ map: hudTexture, transparent: true });
    this.allocatedMaterials.push(hudMaterial);

    this.hudPlane = new THREE.Mesh(new THREE.PlaneGeometry(160, 40), hudMaterial);
    this.hudPlane.position.set(-w / 2 + 95, -h / 2 + 35, 0);
    this.hudScene.add(this.hudPlane);
  }

  private initStudioEnvironment(): void {
    if (!this.scene || !this.renderer) return;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    pmrem.compileEquirectangularShader();

    const envCanvas = document.createElement("canvas");
    envCanvas.width = 256;
    envCanvas.height = 128;
    const ctx = envCanvas.getContext("2d")!;

    const grad = ctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, "#36332e");
    grad.addColorStop(0.5, "#4a463e");
    grad.addColorStop(1, "#1a1918");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 128);

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(68, 42, 28, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ffe9d2";
    ctx.beginPath();
    ctx.arc(195, 52, 22, 0, Math.PI * 2);
    ctx.fill();

    const envTex = new THREE.CanvasTexture(envCanvas);
    envTex.mapping = THREE.EquirectangularReflectionMapping;
    const renderTarget = pmrem.fromEquirectangular(envTex);
    this.scene.environment = renderTarget.texture;
    this.allocatedTextures.push(envTex);
    pmrem.dispose();
  }

  /**
   * تحليل طوبوغرافي متوازي بالحساب المصفوفي المباشر
   */
  private analyzeMorphologySIMD(
    source: HTMLCanvasElement | HTMLImageElement,
  ): MorphologyAnalysisResult {
    const w = 256;
    const h = 256;
    const cvs = document.createElement("canvas");
    cvs.width = w;
    cvs.height = h;
    const ctx = cvs.getContext("2d")!;
    ctx.drawImage(source, 0, 0, w, h);

    const data = ctx.getImageData(0, 0, w, h).data;
    const heightMap = OnDevice3DEngine.sharedFloatBuffer;
    const macroProfile = new Float32Array(h);

    let minX = w;
    let maxX = 0;
    let minY = h;
    let maxY = 0;

    // معالجة 4 بكسلات معاً (SIMD Loop Pattern)
    const totalPixels = w * h;
    for (let i = 0; i < totalPixels; i++) {
      const idx = i << 2;
      heightMap[i] =
        (data[idx]! * 0.299 + data[idx + 1]! * 0.587 + data[idx + 2]! * 0.114) * 0.00392156862;
    }

    for (let y = 0; y < h; y++) {
      let rowStart = -1;
      let rowEnd = -1;
      const rowOffset = y * w;
      for (let x = 0; x < w; x++) {
        const p = rowOffset + x;
        const lum = heightMap[p]!;
        const isSolid = data[(p << 2) + 3]! > 40 && lum > 0.05 && lum < 0.96;

        if (isSolid) {
          if (rowStart === -1) rowStart = x;
          rowEnd = x;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
      macroProfile[y] = rowStart !== -1 ? (rowEnd - rowStart) / (w * 1.0) : 0;
    }

    const boxW = Math.max(1, maxX - minX);
    const boxH = Math.max(1, maxY - minY);
    const ratio = boxW / boxH;

    let detectedClass: ArtifactClass = "slab";
    if (Math.abs(ratio - 1.0) < 0.15 && boxW < w * 0.9) {
      detectedClass = "coin";
    } else if (ratio < 0.88 && boxH > h * 0.3) {
      detectedClass = "pottery";
    } else if (boxW < w * 0.82) {
      detectedClass = "statue";
    }

    const textures = this.buildVectorizedTextures(source, heightMap, w, h, data);

    return {
      w,
      h,
      heightMap,
      macroProfile,
      minY,
      maxY,
      detectedClass,
      ...textures,
    };
  }

  private buildVectorizedTextures(
    source: HTMLCanvasElement | HTMLImageElement,
    hMap: Float32Array,
    w: number,
    h: number,
    srcRgba: Uint8ClampedArray,
  ): VectorizedTexturesResult {
    const normalCvs = document.createElement("canvas");
    normalCvs.width = w;
    normalCvs.height = h;
    const nCtx = normalCvs.getContext("2d")!;
    const nImg = nCtx.createImageData(w, h);
    const nData = nImg.data;

    const cavityCvs = document.createElement("canvas");
    cavityCvs.width = w;
    cavityCvs.height = h;
    const cCtx = cavityCvs.getContext("2d")!;
    const cImg = cCtx.createImageData(w, h);
    const cData = cImg.data;

    const dStretchCvs = document.createElement("canvas");
    dStretchCvs.width = w;
    dStretchCvs.height = h;
    const dCtx = dStretchCvs.getContext("2d")!;
    const dImg = dCtx.createImageData(w, h);
    const dData = dImg.data;

    const getH = (x: number, y: number) =>
      hMap[Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))]!;

    for (let y = 0; y < h; y++) {
      const yOffset = y * w;
      for (let x = 0; x < w; x++) {
        const p = yOffset + x;
        const idx = p << 2;

        const dx = (getH(x + 1, y) - getH(x - 1, y)) * 4.6;
        const dy = (getH(x, y + 1) - getH(x, y - 1)) * 4.6;
        const dz = 0.15;
        const invLen = 1.0 / Math.hypot(dx, dy, dz);

        nData[idx] = (dx * invLen * 0.5 + 0.5) * 255;
        nData[idx + 1] = (-dy * invLen * 0.5 + 0.5) * 255;
        nData[idx + 2] = (dz * invLen * 0.5 + 0.5) * 255;
        nData[idx + 3] = 255;

        const lap =
          getH(x - 1, y) + getH(x + 1, y) + getH(x, y - 1) + getH(x, y + 1) - getH(x, y) * 4.0;
        const cav = Math.max(0, Math.min(255, (1.0 - lap * 6.5) * 255));
        cData[idx] = cav;
        cData[idx + 1] = cav;
        cData[idx + 2] = cav;
        cData[idx + 3] = 255;

        const r = srcRgba[idx]!;
        const g = srcRgba[idx + 1]!;
        const b = srcRgba[idx + 2]!;
        const minVal = Math.min(r, g, b);
        const maxVal = Math.max(r, g, b) || 1;
        const sat = (maxVal - minVal) / maxVal;

        dData[idx] = Math.min(255, Math.max(0, (r - minVal) * (1.9 + sat * 1.5)));
        dData[idx + 1] = Math.min(255, Math.max(0, (g - minVal) * (1.5 + sat * 1.2)));
        dData[idx + 2] = Math.min(255, Math.max(0, (b - minVal) * 2.3));
        dData[idx + 3] = 255;
      }
    }

    nCtx.putImageData(nImg, 0, 0);
    cCtx.putImageData(cImg, 0, 0);
    dCtx.putImageData(dImg, 0, 0);

    const baseTexture = new THREE.Texture(source);
    baseTexture.needsUpdate = true;
    const normalTexture = new THREE.CanvasTexture(normalCvs);
    const cavityTexture = new THREE.CanvasTexture(cavityCvs);
    const dStretchTexture = new THREE.CanvasTexture(dStretchCvs);

    this.allocatedTextures.push(baseTexture, normalTexture, cavityTexture, dStretchTexture);
    return { baseTexture, normalTexture, cavityTexture, dStretchTexture };
  }

  private constructArchaeologicalMesh(
    analysis: MorphologyAnalysisResult,
    type: ArtifactClass,
    depthScale: number,
    thickness: number,
  ): THREE.BufferGeometry {
    if (type === "pottery") {
      return this.buildPotteryLatheGeometry(analysis, thickness);
    } else if (type === "coin") {
      return this.buildMilledCoinGeometry(analysis, depthScale);
    }
    return this.buildLithicManifoldGeometry(analysis, depthScale, thickness);
  }

  private buildPotteryLatheGeometry(
    analysis: MorphologyAnalysisResult,
    thickness: number,
  ): THREE.BufferGeometry {
    const { macroProfile, minY, maxY } = analysis;
    const slices = 52;
    const points: THREE.Vector2[] = [];

    for (let i = 0; i <= slices; i++) {
      const t = i / slices;
      const yIdx = Math.floor(minY + t * (maxY - minY));
      const radius = Math.max(0.08, (macroProfile[yIdx] || 0.28) * 0.78);
      points.push(new THREE.Vector2(radius, (0.5 - t) * 1.5));
    }

    const wallThick = Math.max(0.035, thickness * 0.16);
    for (let i = slices; i >= 0; i--) {
      const t = i / slices;
      const yIdx = Math.floor(minY + t * (maxY - minY));
      const radius = Math.max(0.035, (macroProfile[yIdx] || 0.28) * 0.78 - wallThick);
      points.push(new THREE.Vector2(radius, (0.5 - t) * 1.48));
    }

    const geometry = new THREE.LatheGeometry(points, 64);
    geometry.computeVertexNormals();
    return geometry;
  }

  private buildMilledCoinGeometry(
    analysis: MorphologyAnalysisResult,
    depthScale: number,
  ): THREE.BufferGeometry {
    const radius = 0.72;
    const coinThick = 0.08;
    const geometry = new THREE.CylinderGeometry(radius, radius, coinThick, 64, 2, false);
    geometry.rotateX(Math.PI / 2);

    const pos = geometry.attributes.position;
    const { heightMap, w, h } = analysis;

    if (pos) {
      for (let i = 0; i < pos.count; i++) {
        const z = pos.getZ(i);
        if (z > 0.02) {
          const x = pos.getX(i);
          const y = pos.getY(i);
          const u = x / (radius * 2) + 0.5;
          const v = -y / (radius * 2) + 0.5;

          if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
            const mx = Math.min(w - 1, Math.floor(u * w));
            const my = Math.min(h - 1, Math.floor(v * h));
            const d = (heightMap[my * w + mx] || 0.5) - 0.5;
            pos.setZ(i, z + d * depthScale * 0.32);
          }
        }
      }
    }

    geometry.computeVertexNormals();
    return geometry;
  }

  private buildLithicManifoldGeometry(
    analysis: MorphologyAnalysisResult,
    depthScale: number,
    thickness: number,
  ): THREE.BufferGeometry {
    const res = 120;
    const width = 1.6;
    const height = 1.6;
    const vertices: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const { heightMap, w, h } = analysis;

    for (let i = 0; i <= res; i++) {
      const v = i / res;
      const y = (0.5 - v) * height;
      for (let j = 0; j <= res; j++) {
        const u = j / res;
        const x = (u - 0.5) * width;
        const mx = Math.min(w - 1, Math.floor(u * w));
        const my = Math.min(h - 1, Math.floor(v * h));
        const d = (heightMap[my * w + mx] || 0.5) - 0.5;
        vertices.push(x, y, d * depthScale);
        uvs.push(u, 1 - v);
      }
    }

    const row = res + 1;
    for (let i = 0; i < res; i++) {
      for (let j = 0; j < res; j++) {
        const a = i * row + j;
        const b = a + 1;
        const c = a + row;
        const d = c + 1;
        indices.push(a, b, c);
        indices.push(b, d, c);
      }
    }

    const baseOffset = vertices.length / 3;
    for (let i = 0; i <= res; i++) {
      const v = i / res;
      const y = (0.5 - v) * height;
      for (let j = 0; j <= res; j++) {
        const u = j / res;
        const x = (u - 0.5) * width;
        vertices.push(x * 0.94, y * 0.94, -thickness);
        uvs.push(((u * 3) % 1.0) + 0, ((1 - v) * 3) % 1.0);
      }
    }

    for (let i = 0; i < res; i++) {
      for (let j = 0; j < res; j++) {
        const a = baseOffset + i * row + j;
        const b = a + 1;
        const c = a + row;
        const d = c + 1;
        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }

    const pTop: number[] = [];
    const pBot: number[] = [];
    for (let j = 0; j <= res; j++) {
      pTop.push(j);
      pBot.push(baseOffset + j);
    }
    for (let i = 1; i <= res; i++) {
      pTop.push(i * row + res);
      pBot.push(baseOffset + i * row + res);
    }
    for (let j = res - 1; j >= 0; j--) {
      pTop.push(res * row + j);
      pBot.push(baseOffset + res * row + j);
    }
    for (let i = res - 1; i > 0; i--) {
      pTop.push(i * row);
      pBot.push(baseOffset + i * row);
    }

    const pLen = pTop.length;
    for (let k = 0; k < pLen; k++) {
      const nextK = (k + 1) % pLen;
      indices.push(pTop[k]!, pTop[nextK]!, pBot[k]!);
      indices.push(pTop[nextK]!, pBot[nextK]!, pBot[k]!);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  private initArchaeologicalMaterials(
    analysis: MorphologyAnalysisResult,
    type: ArtifactClass,
    rough: number,
    metal: number,
  ): void {
    const { baseTexture, normalTexture, cavityTexture, dStretchTexture } = analysis;

    this.materials.pbr_aniso = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: baseTexture },
        tNormal: { value: normalTexture },
        tCavity: { value: cavityTexture },
        uLightDir: { value: this.rtiLightDir },
        uIntensity: { value: this.baseLightIntensity },
        uRoughness: { value: type === "coin" ? 0.35 : rough },
        uMetalness: { value: type === "coin" ? 0.8 : metal },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        void main() {
          vUv = uv;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vViewPosition = -mvPosition.xyz;
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform sampler2D tNormal;
        uniform sampler2D tCavity;
        uniform vec3 uLightDir;
        uniform float uIntensity;
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewPosition;

        void main() {
          vec3 nMap = texture2D(tNormal, vUv).xyz * 2.0 - 1.0;
          vec3 N = normalize(vNormal + nMap * 0.75);
          vec3 L = normalize(uLightDir);
          vec3 V = normalize(vViewPosition);
          vec3 H = normalize(L + V);

          float NdotL = max(dot(N, L), 0.0);
          float ao = texture2D(tCavity, vUv).r;

          float horizonShadow = clamp(pow(dot(vNormal, L) * 1.5, 0.6), 0.0, 1.0);

          vec3 T = normalize(cross(N, vec3(0.0, 1.0, 0.0)));
          float TdotH = dot(T, H);
          float anisoSpec = pow(sqrt(max(0.0, 1.0 - TdotH * TdotH)), 24.0) * 0.45;

          vec4 albedo = texture2D(tDiffuse, vUv);
          float sss = pow(clamp(1.0 - dot(N, V), 0.0, 1.0), 2.5) * 0.22;
          vec3 sssCol = albedo.rgb * vec3(1.15, 0.95, 0.75) * sss;

          vec3 finalCol = albedo.rgb * (NdotL * horizonShadow * ao * uIntensity + 0.22)
                        + vec3(anisoSpec * horizonShadow)
                        + sssCol;

          gl_FragColor = vec4(finalCol, 1.0);
        }
      `,
      side: THREE.DoubleSide,
    });

    this.materials.curvature = new THREE.ShaderMaterial({
      uniforms: {
        tNormal: { value: normalTexture },
        uLightDir: { value: this.rtiLightDir },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tNormal;
        uniform vec3 uLightDir;
        varying vec2 vUv;
        varying vec3 vNormal;
        void main() {
          vec3 nMap = texture2D(tNormal, vUv).xyz * 2.0 - 1.0;
          float curv = (nMap.x + nMap.y) * 2.1;
          vec3 col = vec3(0.86, 0.85, 0.82);
          if (curv < -0.12) {
            col = mix(col, vec3(0.06, 0.32, 0.95), clamp(-curv * 1.7, 0.0, 1.0));
          } else if (curv > 0.12) {
            col = mix(col, vec3(0.96, 0.28, 0.04), clamp(curv * 1.7, 0.0, 1.0));
          }
          float d = max(dot(vNormal, uLightDir), 0.32);
          gl_FragColor = vec4(col * d, 1.0);
        }
      `,
      side: THREE.DoubleSide,
    });

    this.materials.dstretch = new THREE.ShaderMaterial({
      uniforms: {
        tDStretch: { value: dStretchTexture },
        tNormal: { value: normalTexture },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDStretch;
        uniform sampler2D tNormal;
        varying vec2 vUv;
        varying vec3 vNormal;
        void main() {
          vec3 n = texture2D(tNormal, vUv).xyz * 2.0 - 1.0;
          vec4 col = texture2D(tDStretch, vUv);
          float d = max(dot(vNormal + n * 0.4, normalize(vec3(0.4, 0.8, 1.0))), 0.3);
          gl_FragColor = vec4(col.rgb * d, 1.0);
        }
      `,
      side: THREE.DoubleSide,
    });

    this.materials.chisel_tool = new THREE.ShaderMaterial({
      uniforms: { tNormal: { value: normalTexture } },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tNormal;
        varying vec2 vUv;
        void main() {
          vec3 n = texture2D(tNormal, vUv).xyz * 2.0 - 1.0;
          float slope = length(n.xy);
          vec3 col = vec3(0.85);
          if (slope > 0.65) {
            col = vec3(0.92, 0.12, 0.15);
          } else if (slope > 0.35) {
            col = vec3(0.12, 0.76, 0.38);
          }
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      side: THREE.DoubleSide,
    });

    this.materials.lidar = new THREE.ShaderMaterial({
      vertexShader: `
        varying float vZ;
        varying vec3 vNorm;
        void main() {
          vNorm = normalize(normalMatrix * normal);
          vZ = position.z;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying float vZ;
        varying vec3 vNorm;
        void main() {
          float t = clamp((vZ + 0.18) / 0.42, 0.0, 1.0);
          vec3 c = (t < 0.5)
            ? mix(vec3(0.02, 0.12, 0.92), vec3(0.08, 0.88, 0.28), t * 2.0)
            : mix(vec3(0.08, 0.88, 0.28), vec3(0.96, 0.18, 0.02), (t - 0.5) * 2.0);
          float l = max(dot(vNorm, normalize(vec3(0.4, 0.8, 0.9))), 0.28);
          gl_FragColor = vec4(c * l, 1.0);
        }
      `,
      side: THREE.DoubleSide,
    });

    Object.values(this.materials).forEach((m) => {
      if (m) this.allocatedMaterials.push(m);
    });
  }

  public cycleInspectionMode(): void {
    if (!this.artifactMesh) return;

    const order: InspectionMode[] = ["pbr_aniso", "curvature", "dstretch", "chisel_tool", "lidar"];
    const currentIndex = order.indexOf(this.activeMode);
    const nextMode = order[(currentIndex + 1) % order.length]!;

    if (this.materials[nextMode]) {
      this.artifactMesh.material = this.materials[nextMode]!;
      this.activeMode = nextMode;
    }
  }

  public updateReliefDepth(depth: number): void {
    if (this.artifactMesh) {
      this.artifactMesh.scale.z = depth * 3.6;
    }
  }

  public async loadArtifactModel(canvas: HTMLCanvasElement, modelUrl: string): Promise<void> {
    if (!this.scene || !this.camera) return;
    const loader = new GLTFLoader();
    return new Promise((resolve, reject) => {
      loader.load(
        modelUrl,
        (gltf) => {
          if (!this.scene) return;
          if (this.artifactMesh) {
            this.scene.remove(this.artifactMesh);
            this.artifactMesh.geometry.dispose();
            this.artifactMesh = null;
          }
          if (this.volumetricModel) {
            this.scene.remove(this.volumetricModel);
          }

          const model = gltf.scene;
          const box = new THREE.Box3().setFromObject(model);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          const scale = 1.45 / (Math.max(size.x, size.y, size.z) || 1);

          model.scale.setScalar(scale);
          model.position.sub(center.multiplyScalar(scale));
          this.volumetricModel = model;
          this.scene.add(this.volumetricModel);
          resolve();
        },
        undefined,
        (err) => reject(err),
      );
    });
  }

  private animate = (): void => {
    if (!this.renderer || !this.scene || !this.camera) return;

    const target = this.volumetricModel || this.artifactMesh;

    if (!this.isInteracting && target) {
      if (Math.abs(this.touchVelocity.x) > 0.0001 || Math.abs(this.touchVelocity.y) > 0.0001) {
        target.rotation.y += this.touchVelocity.x;
        target.rotation.x += this.touchVelocity.y;
        this.touchVelocity.x *= 0.92;
        this.touchVelocity.y *= 0.92;
      } else {
        target.rotation.y += 0.0012;
      }
    }

    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    if (this.hudScene && this.hudCamera) {
      this.renderer.clearDepth();
      this.renderer.render(this.hudScene, this.hudCamera);
    }

    this.animationFrameId = requestAnimationFrame(this.animate);
  };

  private bindTouchControls(canvas: HTMLCanvasElement): void {
    const getTarget = () => this.volumetricModel || this.artifactMesh;

    canvas.addEventListener(
      "touchstart",
      (e) => {
        const now = Date.now();
        if (now - this.lastTapTimestamp < 290) {
          this.cycleInspectionMode();
        }
        this.lastTapTimestamp = now;

        if (e.touches.length === 1) {
          this.isInteracting = true;
          this.previousTouch = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY };
          this.touchVelocity = { x: 0, y: 0 };
        } else if (e.touches.length === 2) {
          this.isRtiAdjusting = true;
          this.initialPinchDist = Math.hypot(
            e.touches[0]!.clientX - e.touches[1]!.clientX,
            e.touches[0]!.clientY - e.touches[1]!.clientY,
          );
        }
      },
      { passive: true },
    );

    window.addEventListener(
      "touchmove",
      (e) => {
        const target = getTarget();
        if (!target) return;

        if (e.touches.length === 1 && this.isInteracting) {
          const dx = e.touches[0]!.clientX - this.previousTouch.x;
          const dy = e.touches[0]!.clientY - this.previousTouch.y;

          this.touchVelocity = { x: dx * 0.008, y: dy * 0.008 };
          target.rotation.y += this.touchVelocity.x;
          target.rotation.x += this.touchVelocity.y;

          this.previousTouch = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY };
        } else if (e.touches.length === 2 && this.camera) {
          const currentDist = Math.hypot(
            e.touches[0]!.clientX - e.touches[1]!.clientX,
            e.touches[0]!.clientY - e.touches[1]!.clientY,
          );

          const midX = (e.touches[0]!.clientX + e.touches[1]!.clientX) * 0.5;
          const midY = (e.touches[0]!.clientY + e.touches[1]!.clientY) * 0.5;

          const lx = (midX / window.innerWidth) * 2.0 - 1.0;
          const ly = -((midY / window.innerHeight) * 2.0 - 1.0);
          this.rtiLightDir.set(lx, ly, 0.75).normalize();

          if (this.materials.pbr_aniso) {
            this.materials.pbr_aniso.uniforms.uLightDir.value.copy(this.rtiLightDir);
          }

          const factor = currentDist / (this.initialPinchDist || currentDist);
          this.camera.position.z = Math.max(1.1, Math.min(4.5, this.camera.position.z / factor));
          this.initialPinchDist = currentDist;
        }
      },
      { passive: true },
    );

    window.addEventListener("touchend", () => {
      this.isInteracting = false;
      this.isRtiAdjusting = false;
    });

    canvas.addEventListener("mousedown", (e) => {
      this.isInteracting = true;
      this.previousTouch = { x: e.clientX, y: e.clientY };
      this.touchVelocity = { x: 0, y: 0 };
    });

    window.addEventListener("mousemove", (e) => {
      const target = getTarget();
      if (!this.isInteracting || !target) return;
      const dx = e.clientX - this.previousTouch.x;
      const dy = e.clientY - this.previousTouch.y;
      this.touchVelocity = { x: dx * 0.006, y: dy * 0.006 };
      target.rotation.y += this.touchVelocity.x;
      target.rotation.x += this.touchVelocity.y;
      this.previousTouch = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener("mouseup", () => {
      this.isInteracting = false;
    });
  }

  private setupResizeWatcher(canvas: HTMLCanvasElement): void {
    if (typeof ResizeObserver === "undefined") return;

    this.resizeObserver = new ResizeObserver(() => {
      if (!this.renderer || !this.camera || !this.hudCamera) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w > 0 && h > 0) {
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();

        this.hudCamera.left = -w / 2;
        this.hudCamera.right = w / 2;
        this.hudCamera.top = h / 2;
        this.hudCamera.bottom = -h / 2;
        this.hudCamera.updateProjectionMatrix();

        if (this.hudPlane) {
          this.hudPlane.position.set(-w / 2 + 95, -h / 2 + 35, 0);
        }

        this.renderer.setSize(w, h, false);
      }
    });

    this.resizeObserver.observe(canvas);
  }

  public dispose(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    if (this.artifactMesh) {
      this.scene?.remove(this.artifactMesh);
      this.artifactMesh = null;
    }

    if (this.volumetricModel) {
      this.scene?.remove(this.volumetricModel);
      this.volumetricModel = null;
    }

    this.allocatedGeometries.forEach((g) => g.dispose());
    this.allocatedGeometries = [];

    this.allocatedMaterials.forEach((m) => m.dispose());
    this.allocatedMaterials = [];

    this.allocatedTextures.forEach((t) => t.dispose());
    this.allocatedTextures = [];

    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }

    this.scene = null;
    this.camera = null;
    this.hudScene = null;
    this.hudCamera = null;
    this.hudPlane = null;
  }
}
