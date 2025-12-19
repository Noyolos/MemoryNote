import * as THREE from "three";
import { getDom } from "./dom.js";
import { createParticleGeometry } from "./particles.js";
import { createEditorMaterial, cloneMaterialFromSettings } from "./material.js";
import { WebStorageProvider, createMemoryId, SCHEMA_VERSION } from "./storage/idb.js";

const CONFIG = {
  TRANSITION_SPEED: 0.04,
};

const IMAGE_TARGETS = {
  thumb: { maxEdge: 512 },
  render: { maxEdge: 1536 },
};

const IMAGE_QUALITY = {
  thumbWebp: 0.75,
  thumbJpeg: 0.8,
  renderWebp: 0.8,
  renderJpeg: 0.85,
};

// Keep defaults close to your prototype
const DEFAULT_SETTINGS = {
  waveSpeed: 0.2,
  waveAmplitude: 0.05,
  edgeRoughness: 1.0,
  erosionSpeed: 0.2,
  particleSize: 6.0,
  dispersion: 1.0,
  gridOpacity: 0.3,
  stableRadius: 0.42,
  brightness: 1.0,
  contrast: 1.0,
  viewDistance: 1.8,
  galleryGap: 2.2,
};

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

async function scaleToBlob(image, maxEdge, preferredTypes) {
  const width = image.width || image.videoWidth || image.naturalWidth;
  const height = image.height || image.videoHeight || image.naturalHeight;
  if (!width || !height) throw new Error("Cannot read image dimensions");

  const ratio = Math.min(1, maxEdge / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * ratio));
  const targetHeight = Math.max(1, Math.round(height * ratio));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not acquire 2D context");
  ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

  for (const { type, quality } of preferredTypes) {
    const blob = await canvasToBlob(canvas, type, quality);
    if (blob) {
      return { blob, width: targetWidth, height: targetHeight };
    }
  }

  throw new Error("Failed to create blob from canvas");
}

async function decodeImage(blob) {
  let bitmap = null;
  let objectUrl = null;

  try {
    if (typeof createImageBitmap === "function") {
      bitmap = await createImageBitmap(blob);
      return {
        image: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close?.(),
      };
    }
  } catch (err) {
    // fall through to image element
    console.warn("createImageBitmap failed, falling back to Image()", err);
  }

  objectUrl = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const result = {
        image: img,
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        cleanup: () => {
          URL.revokeObjectURL(objectUrl);
        },
      };
      resolve(result);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(objectUrl);
      reject(e);
    };
    img.src = objectUrl;
  });
}

async function preprocessImage(blob) {
  const decoded = await decodeImage(blob);
  const preferredThumb = [
    { type: "image/webp", quality: IMAGE_QUALITY.thumbWebp },
    { type: "image/jpeg", quality: IMAGE_QUALITY.thumbJpeg },
  ];
  const preferredRender = [
    { type: "image/webp", quality: IMAGE_QUALITY.renderWebp },
    { type: "image/jpeg", quality: IMAGE_QUALITY.renderJpeg },
  ];

  const thumb = await scaleToBlob(decoded.image, IMAGE_TARGETS.thumb.maxEdge, preferredThumb);
  const render = await scaleToBlob(decoded.image, IMAGE_TARGETS.render.maxEdge, preferredRender);
  decoded.cleanup?.();

  return {
    original: { width: decoded.width, height: decoded.height },
    thumb,
    render,
  };
}

async function loadTextureFromBlob(blob, loader) {
  const objectUrl = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    loader.load(
      objectUrl,
      (texture) => {
        URL.revokeObjectURL(objectUrl);
        texture.minFilter = THREE.NearestFilter;
        texture.magFilter = THREE.NearestFilter;
        resolve(texture);
      },
      undefined,
      (err) => {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    );
  });
}

function disposeTexture(texture) {
  if (texture && typeof texture.dispose === "function") {
    texture.dispose();
  }
}

export class App {
  constructor() {
    this.dom = getDom();
    this.storage = new WebStorageProvider();
    this.textureLoader = new THREE.TextureLoader();

    this.settings = { ...DEFAULT_SETTINGS };
    this.state = {
      mode: "editor",
      memories: [],
      galleryIndex: 0,
      targetCameraX: 0,
    };

    this.mouseX = 0;
    this.mouseY = 0;
    this.currentSource = null;

    this._initThree();
    this._initUI();
    this._initEvents();
    this._initStorage();

    this.clock = new THREE.Clock();
  }

  start() {
    this._animate();
  }

  _initThree() {
    const { container } = this.dom;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x050505, 0.05);

    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.z = this.settings.viewDistance;

    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    window.__AF = window.__AF || {};
window.__AF.renderer = this.renderer;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(this.renderer.domElement);

    this.editorGroup = new THREE.Group();
    this.galleryGroup = new THREE.Group();
    this.scene.add(this.editorGroup);
    this.scene.add(this.galleryGroup);

    this.geometry = createParticleGeometry(360);
    this.editorMaterial = createEditorMaterial(this.settings);
    this.editorParticles = new THREE.Points(this.geometry, this.editorMaterial);
    this.editorGroup.add(this.editorParticles);

    this.editorGroup.visible = true;
    this.galleryGroup.visible = false;
  }

  _initUI() {
    const { toggleBtn, effectPanel, sliders } = this.dom;

    // Right panel toggle
    toggleBtn?.addEventListener("click", () => {
      effectPanel?.classList.toggle("open");
      toggleBtn?.classList.toggle("active");
    });

    const bind = (key, uniformKey, { isPixel = false } = {}) => {
      const s = sliders[key];
      if (!s?.input || !s?.label) return;

      s.input.addEventListener("input", (e) => {
        const val = parseFloat(e.target.value);
        s.label.innerText = isFinite(val) ? val.toFixed(key === "galleryGap" ? 1 : 2) : String(val);

        // update settings
        this.settings[key] = val;

        // special-case: layout
        if (key === "galleryGap") {
          this._updateGalleryLayout();
          this._updateGalleryTarget();
          return;
        }

        // update uniforms (editor + all memories)
        let finalVal = val;
        if (isPixel) finalVal = val * (window.devicePixelRatio || 1);
        this._updateAllUniforms(uniformKey, finalVal);
      });
    };

    bind("brightness", "uBrightness");
    bind("contrast", "uContrast");
    bind("particleSize", "uSize", { isPixel: true });
    bind("gridOpacity", "uGridOpacity");
    bind("erosionSpeed", "uErosionSpeed");
    bind("waveAmplitude", "uWaveAmplitude");
    bind("waveSpeed", "uWaveSpeed");
    bind("dispersion", "uDispersion");
    bind("edgeRoughness", "uEdgeRoughness");
    bind("stableRadius", "uStableRadius");
    bind("galleryGap", null);
  }

  _initEvents() {
    const {
      fileInput,
      archiveBtn,
      enterHallBtn,
      backBtn,
      prevZone,
      nextZone,
      loading,
      memoryCount,
      controlPanel,
      galleryUI,
    } = this.dom;

    // zoom by wheel
    window.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const delta = e.deltaY * 0.0025;
        this.settings.viewDistance += delta;
        this.settings.viewDistance = Math.max(0.5, Math.min(this.settings.viewDistance, 8.0));
      },
      { passive: false }
    );

    // mouse
    document.addEventListener("mousemove", (e) => {
      this.mouseX = (e.clientX - window.innerWidth / 2) * 0.0005;
      this.mouseY = (e.clientY - window.innerHeight / 2) * 0.0005;
    });

    // resize
    window.addEventListener("resize", () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);

      const pr = window.devicePixelRatio || 1;
      this.renderer.setPixelRatio(Math.min(pr, 2));
      this.editorMaterial.uniforms.uPixelRatio.value = pr;
      // keep point sizes consistent after DPR changes
      this._updateAllUniforms("uSize", this.settings.particleSize * pr);
    });

    // upload -> texture
    fileInput?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      loading.style.opacity = 1;
      try {
        const processed = await preprocessImage(file);
        this.currentSource = {
          thumb: processed.thumb,
          render: processed.render,
          dimensions: { width: processed.render.width, height: processed.render.height },
        };

        const texture = await loadTextureFromBlob(processed.render.blob, this.textureLoader);
        this._applyTexture(this.editorMaterial, texture);
        this._setMeshScale(this.editorParticles, processed.render);
      } catch (err) {
        console.warn("Failed to process upload", err);
        alert("Could not process image. Please try a different file.");
      } finally {
        loading.style.opacity = 0;
      }
    });

    // archive
    archiveBtn?.addEventListener("click", async (e) => {
      e.stopPropagation();

      if (!this.editorMaterial.uniforms.uTexture.value || !this.currentSource?.render?.blob || !this.currentSource?.thumb?.blob) {
        alert("Please upload an image first.");
        return;
      }

      const id = createMemoryId();
      const record = this._serializeMemory(id);

      try {
        await this.storage.saveMemory(record, { thumbBlob: this.currentSource.thumb.blob, renderBlob: this.currentSource.render.blob });

        const material = cloneMaterialFromSettings(this.editorMaterial, this.settings);
        const texture = await loadTextureFromBlob(this.currentSource.render.blob, this.textureLoader);
        this._applyTexture(material, texture);

        const memoryMesh = new THREE.Points(this.geometry, material);
        this._setMeshScale(memoryMesh, record.dimensions);
        this._addMemory({ id, record, mesh: memoryMesh, hasHighRes: true, renderLoading: false }, { prepend: true });

        if (memoryCount) memoryCount.innerText = `(${this.state.memories.length})`;

        const originalText = archiveBtn.innerText;
        archiveBtn.innerText = "SAVED";
        setTimeout(() => (archiveBtn.innerText = originalText), 800);
      } catch (err) {
        console.warn("Failed to save memory", err);
        alert("Could not save memory. Please try again.");
      }
    });

    // enter hall
    enterHallBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.state.memories.length === 0) {
        alert("Archive is empty.");
        return;
      }

      this.state.mode = "gallery";
      controlPanel?.classList.add("hidden");
      galleryUI?.classList.remove("hidden");

      this.editorGroup.visible = false;
      this.galleryGroup.visible = true;

      this._updateGalleryTarget();
      this._ensureRenderForCurrent();
    });

    // back
    backBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.state.mode = "editor";
      controlPanel?.classList.remove("hidden");
      galleryUI?.classList.add("hidden");

      this.editorGroup.visible = true;
      this.galleryGroup.visible = false;
    });

    // nav
    prevZone?.addEventListener("click", () => {
      this.state.galleryIndex -= 1;
      this._updateGalleryTarget();
      this._ensureRenderForCurrent();
    });
    nextZone?.addEventListener("click", () => {
      this.state.galleryIndex += 1;
      this._updateGalleryTarget();
      this._ensureRenderForCurrent();
    });
  }

  async _initStorage() {
    try {
      await this.storage.init();
      await this._hydrateFromStorage();
    } catch (err) {
      console.warn("Storage initialization failed; continuing without persistence", err);
    }
  }

  async _hydrateFromStorage() {
    let records = [];
    try {
      records = await this.storage.getMemories();
    } catch (err) {
      console.warn("Failed to read memories from storage", err);
      return;
    }

    for (const record of records) {
      if (record.schemaVersion !== SCHEMA_VERSION) {
        console.warn("Skipping memory due to schema mismatch", record);
        continue;
      }

      try {
        await this._deserializeMemory(record);
        await this._yieldFrame();
      } catch (err) {
        console.warn("Skipping memory due to load failure", err);
      }
    }

    this._updateGalleryLayout();
    if (this.dom.memoryCount) this.dom.memoryCount.innerText = `(${this.state.memories.length})`;
  }

  _serializeMemory(id) {
    return {
      id,
      createdAt: new Date().toISOString(),
      schemaVersion: SCHEMA_VERSION,
      assets: { thumbKey: `${id}:thumb`, renderKey: `${id}:render` },
      settingsSnapshot: { ...this.settings },
      dimensions: this.currentSource?.dimensions,
    };
  }

  async _deserializeMemory(record) {
    const thumbKey = record.assets?.thumbKey;
    if (!thumbKey) {
      console.warn("Memory missing thumbKey; skipping", record);
      return;
    }

    let asset;
    try {
      asset = await this.storage.getAsset(thumbKey);
    } catch (err) {
      console.warn("Failed to load thumb asset", err);
      return;
    }

    if (!asset?.blob) {
      console.warn("Thumb asset missing blob; skipping memory", record);
      return;
    }

    const texture = await loadTextureFromBlob(asset.blob, this.textureLoader);
    const material = cloneMaterialFromSettings(this.editorMaterial, record.settingsSnapshot || this.settings);
    this._applyTexture(material, texture);

    const memoryMesh = new THREE.Points(this.geometry, material);
    this._setMeshScale(memoryMesh, record.dimensions);

    this._addMemory(
      {
        id: record.id,
        record,
        mesh: memoryMesh,
        hasHighRes: false,
        renderLoading: false,
      },
      { prepend: false }
    );
  }

  _addMemory(memory, { prepend = false } = {}) {
    if (prepend) {
      this.state.memories.unshift(memory);
      this.state.galleryIndex = 0;
    } else {
      this.state.memories.push(memory);
    }
    this.galleryGroup.add(memory.mesh);
    this._updateGalleryLayout();
    this._updateGalleryTarget();
  }

  async _ensureRenderForCurrent() {
    const current = this.state.memories[this.state.galleryIndex];
    if (!current) return;
    await this._loadRenderForMemory(current);
  }

  async _loadRenderForMemory(memory) {
    if (!memory || memory.hasHighRes || memory.renderLoading) return;
    memory.renderLoading = true;

    const renderKey = memory.record?.assets?.renderKey;
    if (!renderKey) {
      memory.renderLoading = false;
      return;
    }

    try {
      const asset = await this.storage.getAsset(renderKey);
      if (!asset?.blob) {
        console.warn("Render asset missing; memory will stay low-res", renderKey);
        return;
      }

      const texture = await loadTextureFromBlob(asset.blob, this.textureLoader);
      this._applyTexture(memory.mesh.material, texture);
      memory.hasHighRes = true;
    } catch (err) {
      console.warn("Failed to load render texture", err);
    } finally {
      memory.renderLoading = false;
    }
  }

  _applyTexture(material, texture) {
    disposeTexture(material.uniforms.uTexture.value);
    material.uniforms.uTexture.value = texture;
    material.uniforms.uHasTexture.value = 1.0;
  }

  _setMeshScale(mesh, dimensions) {
    if (!mesh || !dimensions?.width || !dimensions?.height) return;
    const aspect = dimensions.width / dimensions.height;
    if (aspect > 1) mesh.scale.set(1, 1 / aspect, 1);
    else mesh.scale.set(aspect, 1, 1);
  }

  _yieldFrame() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }

  _updateAllUniforms(key, value) {
    if (!key) return;
    if (this.editorMaterial.uniforms[key]) this.editorMaterial.uniforms[key].value = value;

    this.state.memories.forEach((mem) => {
      if (mem.mesh?.material?.uniforms?.[key]) mem.mesh.material.uniforms[key].value = value;
    });
  }

  _updateGalleryLayout() {
    this.state.memories.forEach((mem, index) => {
      mem.mesh.position.set(index * this.settings.galleryGap, 0, 0);
    });
  }

  _updateGalleryTarget() {
    const { galleryCounter } = this.dom;

    if (this.state.galleryIndex < 0) this.state.galleryIndex = 0;
    if (this.state.galleryIndex >= this.state.memories.length) {
      this.state.galleryIndex = Math.max(0, this.state.memories.length - 1);
    }

    this.state.targetCameraX = this.state.galleryIndex * this.settings.galleryGap;

    if (galleryCounter) {
      galleryCounter.innerText = `MEMORY ${String(this.state.galleryIndex + 1).padStart(2, "0")}`;
    }
  }

  _animate = () => {
    requestAnimationFrame(this._animate);

    const time = this.clock.getElapsedTime();
    this.editorMaterial.uniforms.uTime.value = time;

    // memories animation
    this.state.memories.forEach((mem, i) => {
      mem.mesh.material.uniforms.uTime.value = time + i * 10;
      if (this.state.mode === "gallery") {
        const distToCam = mem.mesh.position.x - this.camera.position.x;
        const targetZ = Math.abs(distToCam) < 1.0 ? 0 : -0.5;
        mem.mesh.position.z += (targetZ - mem.mesh.position.z) * 0.05;
        mem.mesh.rotation.y += (0 - mem.mesh.rotation.y) * 0.05;
      }
    });

    if (this.state.mode === "editor") {
      this.editorParticles.rotation.y = Math.sin(time * 0.1) * 0.03 + this.mouseX * 0.05;
      this.editorParticles.rotation.x = Math.cos(time * 0.08) * 0.03 + this.mouseY * 0.05;

      this.camera.position.x += (0 - this.camera.position.x) * 0.1;
      this.camera.position.z += (this.settings.viewDistance - this.camera.position.z) * 0.1;
      this.camera.lookAt(0, 0, 0);
    } else {
      this.camera.position.x += (this.state.targetCameraX - this.camera.position.x) * CONFIG.TRANSITION_SPEED;
      const velocity = Math.abs(this.state.targetCameraX - this.camera.position.x);
      const targetZ = this.settings.viewDistance + velocity * 1.5;
      this.camera.position.z += (targetZ - this.camera.position.z) * 0.05;
      this.camera.lookAt(this.camera.position.x + this.mouseX * 2.0, this.mouseY * 1.0, 0);
    }

    this.renderer.render(this.scene, this.camera);
  };
}
