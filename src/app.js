import * as THREE from "three";
import { getDom } from "./dom.js";
import { createParticleGeometry } from "./particles.js";
import { createEditorMaterial, cloneMaterialFromSettings } from "./material.js";

const CONFIG = {
  TRANSITION_SPEED: 0.04,
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

export class App {
  constructor() {
    this.dom = getDom();

    this.settings = { ...DEFAULT_SETTINGS };
    this.state = {
      mode: "editor",
      memories: [],
      galleryIndex: 0,
      targetCameraX: 0,
    };

    this.mouseX = 0;
    this.mouseY = 0;

    this._initThree();
    this._initUI();
    this._initEvents();

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
    const loader = new THREE.TextureLoader();

    fileInput?.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      loading.style.opacity = 1;

      const reader = new FileReader();
      reader.onload = (event) => {
        const src = event.target.result;
        const img = new Image();
        img.src = src;

        img.onload = () => {
          loader.load(
            src,
            (texture) => {
              texture.minFilter = THREE.NearestFilter;
              texture.magFilter = THREE.NearestFilter;

              this.editorMaterial.uniforms.uTexture.value = texture;
              this.editorMaterial.uniforms.uHasTexture.value = 1.0;

              const aspect = img.width / img.height;
              if (aspect > 1) this.editorParticles.scale.set(1, 1 / aspect, 1);
              else this.editorParticles.scale.set(aspect, 1, 1);

              loading.style.opacity = 0;
            },
            undefined,
            () => {
              loading.style.opacity = 0;
            }
          );
        };
      };
      reader.readAsDataURL(file);
    });

    // archive
    archiveBtn?.addEventListener("click", (e) => {
      e.stopPropagation();

      if (!this.editorMaterial.uniforms.uTexture.value) {
        alert("Please upload an image first.");
        return;
      }

      const archivedMaterial = cloneMaterialFromSettings(this.editorMaterial, this.settings);
      archivedMaterial.uniforms.uTexture.value = this.editorMaterial.uniforms.uTexture.value;
      archivedMaterial.uniforms.uHasTexture.value = 1.0;

      const memoryMesh = new THREE.Points(this.geometry, archivedMaterial);
      this.galleryGroup.add(memoryMesh);
      this.state.memories.push({ mesh: memoryMesh });

      this._updateGalleryLayout();
      if (memoryCount) memoryCount.innerText = `(${this.state.memories.length})`;

      // little feedback
      const originalText = archiveBtn.innerText;
      archiveBtn.innerText = "SAVED";
      setTimeout(() => (archiveBtn.innerText = originalText), 800);
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
    });
    nextZone?.addEventListener("click", () => {
      this.state.galleryIndex += 1;
      this._updateGalleryTarget();
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