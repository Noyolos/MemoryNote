import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
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

const API_BASE = "http://localhost:8787";
const HOME_PROMPT_DEFAULT = "";
const HOME_PROMPT_FALLBACK_QUESTIONS = [];
const DIARY_FALLBACK_SUMMARY = "A quiet moment, held in the light and motion of the archive.";


// Keep defaults close to your prototype
const DEFAULT_SETTINGS = {
  waveSpeed: 0.25,
  waveAmplitude: 0.17,
  edgeRoughness: 0.5,
  erosionSpeed: 0.15,
  particleSize: 11.5,
  dispersion: 0.1,
  gridOpacity: 0.5,
  stableRadius: 0.44,
  brightness: 1.7,
  contrast: 1.3,
  viewDistance: 1.8,
  galleryGap: 2.2,
};

const CAROUSEL = {
  radius: 4.0,
  depth: 0.8,
  angleStep: 0.59,
  zBase: 0.6,
  yOffset: -0.1,
  sideScale: 0.72,
  faceInStrength: 1.0,
  edgeFade: 0.75,
  edgeWidth: 0.38,
  opacityBase: 0.62,
  opacityFalloff: 0.45,
  dimFalloff: 0.18,
  indexLerp: 0.12,
  posLerp: 0.14,
  rotLerp: 0.14,
  scaleLerp: 0.14,
  transitionMs: 420,
};

const RING_KEYS = {
  radius: "afterglow_ring_radius",
  depth: "afterglow_ring_depth",
  angle: "afterglow_ring_angle",
};
const HALL_FOV_KEY = "afterglow_hall_fov";
const HALL_FOV_DEFAULT = 40;
const HALL_FOV_LIMITS = { min: 28, max: 60 };
const HALL_OPACITY_KEY = "afterglow_hall_opacity";
const HALL_OPACITY_LIMITS = { min: 0.2, max: 1.0 };

const RING_DEFAULTS = {
  radius: CAROUSEL.radius,
  depth: CAROUSEL.depth,
  angle: CAROUSEL.angleStep,
};

const RING_LIMITS = {
  radius: { min: 1.5, max: 4.0 },
  depth: { min: 0.8, max: 6.0 },
  angle: { min: 0.18, max: 0.6 },
};

const RENDER_MODE_KEY = "afterglow_render_mode";
const HAS_UPLOADED_KEY = "afterglow_has_uploaded_once";
const DEFAULT_RENDER_MODE = "kolam";
const RENDER_MODE_PRESETS = {
  kolam: { stipple: 0.8, halo: 0.45, grain: 0.4, layered: 0.0, layerDepth: 0.0, layerNoiseDepth: 0.0 },
  halo: { stipple: 0.15, halo: 0.9, grain: 0.2, layered: 0.0, layerDepth: 0.0, layerNoiseDepth: 0.0 },
  layered: { stipple: 0.5, halo: 0.85, grain: 0.32, layered: 1.0, layerDepth: 0.08, layerNoiseDepth: 0.05 },
};

function normalizeRenderMode(mode) {
  if (mode === "halo" || mode === "layered") return mode;
  return DEFAULT_RENDER_MODE;
}

function readRenderMode() {
  try {
    return localStorage.getItem(RENDER_MODE_KEY);
  } catch (err) {
    return null;
  }
}

function readHasUploadedFlag() {
  try {
    return localStorage.getItem(HAS_UPLOADED_KEY) === "1";
  } catch (err) {
    return false;
  }
}

function writeHasUploadedFlag() {
  try {
    localStorage.setItem(HAS_UPLOADED_KEY, "1");
  } catch (err) {
    // ignore storage failures (private mode, quota, etc.)
  }
}

function writeRenderMode(mode) {
  try {
    localStorage.setItem(RENDER_MODE_KEY, mode);
  } catch (err) {
    // ignore storage failures (private mode, quota, etc.)
  }
}

function hashStringToSeed(value) {
  const str = String(value ?? "");
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function wrapIndex(index, count) {
  if (count <= 0) return 0;
  return ((index % count) + count) % count;
}

function getWrappedOffset(index, center, count) {
  if (count <= 0) return 0;
  let offset = index - center;
  const half = count / 2;
  if (offset > half) offset -= count;
  if (offset < -half) offset += count;
  return offset;
}

function easeInOut(t) {
  return t * t * (3 - 2 * t);
}

function readStoredNumber(key, fallback, { min = -Infinity, max = Infinity } = {}) {
  try {
    const raw = localStorage.getItem(key);
    const value = parseFloat(raw);
    if (!Number.isFinite(value)) return fallback;
    return clamp(value, min, max);
  } catch (err) {
    return fallback;
  }
}

function writeStoredNumber(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch (err) {
    // ignore storage failures
  }
}

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

async function preprocessImage(blob, trace) {
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
  if (trace) {
    trace.t1 = performance.now();
    console.info(
      `[analysis:${trace.id}] t1_preprocess +${Math.round(trace.t1 - trace.t0)}ms thumb=${thumb.blob.size}B render=${render.blob.size}B`
    );
  }

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

const TYPING_INDICATOR_TEXT = "对方正在输入…";
const LISTENING_INDICATOR_TEXT = "Listening...";

class CenterStageController {
  constructor(dom) {
    this.root = dom?.centerStage || null;
    this.aiBubble = dom?.homePrompt || null;
    this.userBubble = dom?.userBubble || null;
    this.typingIndicator = dom?.typingIndicator || null;
    this.defaultTypingText = TYPING_INDICATOR_TEXT;
    this.noticeMode = "none";
    if (this.typingIndicator && !this.typingIndicator.textContent.trim()) {
      this.typingIndicator.textContent = this.defaultTypingText;
    }
  }

  setVisible(isVisible) {
    if (!this.root) return;
    this.root.style.display = isVisible ? "block" : "none";
    if (!isVisible) this.clearAll();
  }

  showAI(text) {
    const nextText = this._normalizeText(text);
    if (!nextText) {
      this.hideAI();
      return;
    }
    this.setTyping(false);
    this._setText(this.aiBubble, nextText);
    this._show(this.aiBubble);
    this.hideUser();
  }

  showUser(text) {
    const nextText = this._normalizeText(text);
    if (!nextText) {
      this.hideUser();
      return;
    }
    this.setTyping(false);
    this._setText(this.userBubble, nextText);
    this._show(this.userBubble);
    if (this.aiBubble && this.aiBubble.textContent.trim()) {
      this._show(this.aiBubble);
    }
  }

  hideUser() {
    if (this.userBubble) {
      this.userBubble.hidden = true;
      this.userBubble.textContent = "";
    }
  }

  hideAI() {
    if (this.aiBubble) {
      this.aiBubble.hidden = true;
      this.aiBubble.textContent = "";
    }
  }

  setTyping(isActive, text) {
    if (isActive) {
      this._showNotice(text || this.defaultTypingText, "typing", { hideBubbles: true });
      return;
    }
    if (this.noticeMode !== "listening") this._hideNotice();
  }

  setListening(isActive, text) {
    if (isActive) {
      if (this.noticeMode === "typing" || this.noticeMode === "system") return;
      this._showNotice(text || LISTENING_INDICATOR_TEXT, "listening");
      return;
    }
    this._hideNotice("listening");
  }

  showSystem(text) {
    const nextText = this._normalizeText(text) || this.defaultTypingText;
    this._showNotice(nextText, "system", { hideBubbles: true });
  }

  clearAll() {
    this.hideAI();
    this.hideUser();
    this._hideNotice();
  }

  _normalizeText(text) {
    if (typeof text !== "string") return "";
    return text.trim().length > 0 ? text : "";
  }

  _setText(el, text) {
    if (el) el.textContent = text;
  }

  _setTypingText(text) {
    if (this.typingIndicator) {
      this.typingIndicator.textContent = text;
    }
  }

  _showNotice(text, mode, { hideBubbles = false } = {}) {
    if (!this.typingIndicator) return;
    this.noticeMode = mode;
    if (hideBubbles) {
      this._hide(this.aiBubble);
      this._hide(this.userBubble);
    }
    this._setTypingText(text);
    this.typingIndicator.hidden = false;
  }

  _hideNotice(mode) {
    if (!this.typingIndicator) return;
    if (mode && this.noticeMode !== mode) return;
    this.noticeMode = "none";
    this.typingIndicator.hidden = true;
    this._setTypingText(this.defaultTypingText);
  }

  _show(el) {
    if (el) el.hidden = false;
  }

  _hide(el) {
    if (el) el.hidden = true;
  }
}

export class App {
  constructor() {
    this.dom = getDom();
    this.storage = new WebStorageProvider();
    this.textureLoader = new THREE.TextureLoader();
    this.desiredTarget = new THREE.Vector3(0, 0, 0);
    this.defaultHomePrompt = this.dom.homePrompt?.textContent || HOME_PROMPT_DEFAULT;
    this.stage = new CenterStageController(this.dom);
    this.voiceTimerSeconds = 0;
    this.voiceTimerInterval = null;
    this.voiceTimerRunning = false;
    this.voiceDraft = "";
    this.voiceInterim = "";
    this.voiceCommitPending = false;
    this._homeUiVisible = null;
    this.infoOpen = false;
    this.analysisQuestions = [];
    this.chatContents = [];
    this.chatRequestId = 0;
    this.mockStreamInterval = null;
    this.mockDiaryTimer = null;
    this.mockDiaryResolve = null;
    this.saveInFlight = false;
    this.analysisTraceId = 0;
    this.hasUploadedOnce = readHasUploadedFlag();
    this.blockerActive = false;
    this.sessionImage = null;
    this.imageAnalysis = "";
    this.messages = [];
    this._hudDirty = true;
    this._hudCache = {
      micDisabled: null,
      saveDisabled: null,
      closeDisabled: null,
      timerLabel: null,
    };
    this.diaryModalOpen = false;
    this.diaryModalData = null;
    this.shareResetTimer = null;
    // [Codex] Voice Recognition Init
    this.recognition = null;
    this.isRecognizing = false;
    this._initSpeechRecognition();

    this.settings = { ...DEFAULT_SETTINGS };
    this.state = {
      mode: "home",
      memories: [],
      galleryIndex: 0,
      targetCameraX: 0,
    };
    this.materialRegistry = new Set();
    this.renderMode = normalizeRenderMode(readRenderMode());
    this.ringSettings = {
      radius: readStoredNumber(RING_KEYS.radius, RING_DEFAULTS.radius, RING_LIMITS.radius),
      depth: readStoredNumber(RING_KEYS.depth, RING_DEFAULTS.depth, RING_LIMITS.depth),
      angle: readStoredNumber(RING_KEYS.angle, RING_DEFAULTS.angle, RING_LIMITS.angle),
    };
    this.hallFov = readStoredNumber(HALL_FOV_KEY, HALL_FOV_DEFAULT, HALL_FOV_LIMITS);
    this.hallOpacityBase = readStoredNumber(HALL_OPACITY_KEY, CAROUSEL.opacityBase, HALL_OPACITY_LIMITS);
    this.homeSettings = {
      zoom: this.settings.viewDistance,
      yOffset: 0.05,
    };
    this.carousel = {
      indexTarget: 0,
      indexFloat: 0,
    };
    this.carouselEuler = new THREE.Euler(0, 0, 0);

    this.mouseX = 0;
    this.mouseY = 0;
    this.currentSource = null;

    this._initThree();
    this._initUI();
    this.setRenderMode(this.renderMode, { persist: false });
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
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.FogExp2(0x000000, 0.05);

    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.z = this.settings.viewDistance;
    this.cameraDefaults = {
      fov: this.camera.fov,
      near: this.camera.near,
      far: this.camera.far,
    };

    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 1);
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.touchAction = "none";

    this.editorGroup = new THREE.Group();
    this.galleryGroup = new THREE.Group();
    this.scene.add(this.editorGroup);
    this.scene.add(this.galleryGroup);
    this.editorGroup.position.y = this.homeSettings.yOffset;

    this.geometry = createParticleGeometry(360);
    this.editorMaterial = createEditorMaterial(this.settings);
    this._setMaterialSeed(this.editorMaterial, "editor");
    this._registerMaterial(this.editorMaterial);
    this.editorParticles = new THREE.Points(this.geometry, this.editorMaterial);
    this.editorGroup.add(this.editorParticles);

    this.editorGroup.visible = true;
    this.galleryGroup.visible = false;

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableRotate = true;
    this.controls.enablePan = false;
    this.controls.enableZoom = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.6;
    this.controls.target.set(0, 0, 0);
    this._syncControlDistance(this.settings.viewDistance);
  }

  _initUI() {
    const {
      toggleBtn,
      effectPanel,
      sliders,
      micBtn,
      voiceTimer,
      saveMemoryBtn,
      closeVoiceBtn,
      landingUploadBtn,
      navInfo,
      infoClose,
      renderToggle,
      renderKolam,
      renderHalo,
      renderLayered,
      hallResetBtn,
      enterHallBtn,
      diaryModal,
      diaryModalClose,
      diaryModalShare,
    } = this.dom;

    // Right panel toggle
    toggleBtn?.addEventListener("click", () => {
      effectPanel?.classList.toggle("open");
      toggleBtn?.classList.toggle("active");
    });

    const stopToggleEvent = (el) => {
      if (!el) return;
      ["pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend", "click"].forEach((type) => {
        el.addEventListener(type, (e) => e.stopPropagation());
      });
    };

    stopToggleEvent(renderToggle);
    stopToggleEvent(renderKolam);
    stopToggleEvent(renderHalo);
    stopToggleEvent(renderLayered);
    stopToggleEvent(hallResetBtn);
    stopToggleEvent(diaryModal);
    stopToggleEvent(diaryModalClose);
    stopToggleEvent(diaryModalShare);

    renderKolam?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.setRenderMode("kolam");
    });
    renderHalo?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.setRenderMode("halo");
    });
    renderLayered?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.setRenderMode("layered");
    });
    hallResetBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this._resetHallViewParams();
    });
    diaryModalClose?.addEventListener("click", (e) => {
      e.stopPropagation();
      this._dismissDiaryModal();
    });
    diaryModalShare?.addEventListener("click", (e) => {
      e.stopPropagation();
      this._shareDiaryModal();
    });

    const bind = (key, uniformKey, { isPixel = false } = {}) => {
      const s = sliders[key];
      if (!s?.input || !s?.label) return;

      s.input.addEventListener("input", (e) => {
        const val = parseFloat(e.target.value);
        s.label.innerText = isFinite(val) ? val.toFixed(2) : String(val);

        // update settings
        this.settings[key] = val;

        // special-case: layout
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

    const bindHome = (sliderKey, handler) => {
      const s = sliders[sliderKey];
      if (!s?.input || !s?.label) return;
      const update = (val) => {
        s.label.innerText = Number.isFinite(val) ? val.toFixed(2) : String(val);
        handler(val);
      };
      s.input.addEventListener("input", (e) => {
        const val = parseFloat(e.target.value);
        update(val);
      });
      update(parseFloat(s.input.value));
    };

    if (sliders.homeZoom?.input) sliders.homeZoom.input.value = this.homeSettings.zoom;
    if (sliders.homeYOffset?.input) sliders.homeYOffset.input.value = this.homeSettings.yOffset;

    bindHome("homeZoom", (val) => {
      if (!Number.isFinite(val)) return;
      this.homeSettings.zoom = val;
      this.settings.viewDistance = val;
      this._syncControlDistance(this.settings.viewDistance);
    });
    bindHome("homeYOffset", (val) => {
      if (!Number.isFinite(val)) return;
      this.homeSettings.yOffset = val;
      if (this.editorGroup) this.editorGroup.position.y = val;
    });

    const bindRing = (sliderKey, settingKey, storageKey) => {
      const s = sliders[sliderKey];
      if (!s?.input || !s?.label) return;
      const limits = RING_LIMITS[settingKey] || { min: -Infinity, max: Infinity };
      const update = (val, persist = true) => {
        const rawVal = Number.isFinite(val) ? val : this.ringSettings[settingKey];
        const nextVal = clamp(rawVal, limits.min, limits.max);
        this.ringSettings[settingKey] = nextVal;
        s.label.innerText = nextVal.toFixed(2);
        if (persist) writeStoredNumber(storageKey, nextVal);
      };
      s.input.value = this.ringSettings[settingKey];
      update(this.ringSettings[settingKey], false);
      s.input.addEventListener("input", (e) => {
        const val = parseFloat(e.target.value);
        update(val);
      });
    };

    bindRing("ringRadius", "radius", RING_KEYS.radius);
    bindRing("ringDepth", "depth", RING_KEYS.depth);
    bindRing("ringAngle", "angle", RING_KEYS.angle);

    const bindHallFov = () => {
      const s = sliders.hallFov;
      if (!s?.input || !s?.label) return;
      const update = (val, persist = true) => {
        const rawVal = Number.isFinite(val) ? val : this.hallFov;
        const nextVal = clamp(rawVal, HALL_FOV_LIMITS.min, HALL_FOV_LIMITS.max);
        this.hallFov = nextVal;
        s.label.innerText = Math.round(nextVal).toString();
        if (persist) writeStoredNumber(HALL_FOV_KEY, nextVal);
        if (this._isInHall()) this._applyHallCamera(true);
      };
      s.input.value = this.hallFov;
      update(this.hallFov, false);
      s.input.addEventListener("input", (e) => {
        const val = parseFloat(e.target.value);
        update(val);
      });
    };

    bindHallFov();

    this._updateNavOffset();
    window.addEventListener("resize", () => this._updateNavOffset());

    if (voiceTimer) this._updateVoiceTimerLabel();

    landingUploadBtn?.addEventListener("click", () => {
      this._openFilePicker();
    });
    micBtn?.addEventListener("click", () => {
      this._toggleVoiceTimer();
    });
    saveMemoryBtn?.addEventListener("click", () => {
      this._handleSaveMemory();
    });
    closeVoiceBtn?.addEventListener("click", () => {
      this._stopVoiceTimer();
    });
    navInfo?.addEventListener("click", () => {
      if (this.saveInFlight) return;
      this._setInfoOpen(true);
    });
    infoClose?.addEventListener("click", () => {
      this._setInfoOpen(false);
    });

    if (enterHallBtn) {
      enterHallBtn.style.display = "none";
      enterHallBtn.style.pointerEvents = "none";
    }

    this._syncHomeVoiceUI();
  }

  _initEvents() {
    const {
      fileInput,
      backBtn,
      prevZone,
      nextZone,
    } = this.dom;

    // zoom by wheel
    window.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        if (this.saveInFlight || this.blockerActive) return;
        const delta = e.deltaY * 0.0025;
        this.settings.viewDistance += delta;
        this.settings.viewDistance = Math.max(0.5, Math.min(this.settings.viewDistance, 8.0));
        this._syncControlDistance(this.settings.viewDistance);
      },
      { passive: false }
    );

    // mouse
    document.addEventListener("mousemove", (e) => {
      if (this.saveInFlight || this.blockerActive) return;
      this.mouseX = (e.clientX - window.innerWidth / 2) * 0.0005;
      this.mouseY = (e.clientY - window.innerHeight / 2) * 0.0005;
    });

    document.addEventListener("keydown", (e) => {
      if (!this.diaryModalOpen) return;
      if (e.key === "Escape") {
        e.preventDefault();
        this._dismissDiaryModal();
      }
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
      this._syncControlDistance(this.settings.viewDistance);
    });

    // upload -> texture
    fileInput?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (fileInput) fileInput.value = "";
      await this._handleImageFile(file);
    });

    // back
    backBtn?.addEventListener("click", () => {
      if (!this._isInHall()) return;
      this._setMode("home");

      this.editorGroup.visible = true;
      this.galleryGroup.visible = false;
      this._applyHallCamera(false);
      this.desiredTarget.set(0, 0, 0);
      this._syncCarouselToIndex({ snap: true });
      if (this.controls) {
        const offset = this.camera.position.clone().sub(this.controls.target);
        this.controls.target.copy(this.desiredTarget);
        this.camera.position.copy(this.desiredTarget).add(offset);
        this.controls.update();
      }
    });

    // nav
    prevZone?.addEventListener("click", (e) => {
      if (!this._isInHall()) return;
      this._navigateHall(-1);
    });
    nextZone?.addEventListener("click", (e) => {
      if (!this._isInHall()) return;
      this._navigateHall(1);
    });
  }

  _initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    this.recognition = new SpeechRecognition();
    this.recognition.lang = "en-US";
    this.recognition.interimResults = true;
    this.recognition.continuous = false;

    this.recognition.onstart = () => {
      console.info("[speech] onstart", {
        running: this.voiceTimerRunning,
        draftLength: this.voiceDraft.length,
      });
      this.isRecognizing = true;
      this._setMicActiveState(true);
      this.voiceInterim = "";
      this._renderVoiceDraft();
      this.stage.setListening(true);

      if (!this.voiceTimerInterval) {
        this._updateVoiceTimerLabel();
        this.voiceTimerInterval = setInterval(() => {
          this.voiceTimerSeconds++;
          this._updateVoiceTimerLabel();
        }, 1000);
      }
    };

    this.recognition.onend = () => {
      console.info("[speech] onend", {
        running: this.voiceTimerRunning,
        commitPending: this.voiceCommitPending,
        draftLength: this.voiceDraft.length,
      });
      this.isRecognizing = false;
      if (this.voiceTimerRunning) {
        this.voiceInterim = "";
        this._renderVoiceDraft();
        try {
          this.recognition.start();
        } catch (err) {
          console.warn("Recognition restart failed", err);
        }
        return;
      }
      const shouldCommit = this.voiceCommitPending;
      this.voiceCommitPending = false;
      this._setMicActiveState(false);
      this.stage.setListening(false);
      if (this.voiceTimerInterval) {
        clearInterval(this.voiceTimerInterval);
        this.voiceTimerInterval = null;
      }
      const finalText = this.voiceDraft.trim();
      if (shouldCommit && finalText) {
        this._handleUserVoiceInput(finalText);
      }
      this.voiceInterim = "";
      this._renderVoiceDraft();
    };

    this.recognition.onresult = (event) => {
      let interim = "";
      let finalText = "";

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) finalText += event.results[i][0].transcript;
        else interim += event.results[i][0].transcript;
      }

      const cleanedFinal = finalText.trim();
      if (cleanedFinal) {
        this.voiceDraft = this.voiceDraft ? `${this.voiceDraft} ${cleanedFinal}` : cleanedFinal;
      }
      this.voiceInterim = interim.trim();
      this._renderVoiceDraft();
    };

    this.recognition.onerror = (event) => {
      console.warn("[speech] onerror", event.error);
      if (event.error === "not-allowed") {
        this._stopVoiceTimer({ reset: true });
        return;
      }
      if (["aborted", "audio-capture", "network"].includes(event.error)) {
        this._stopVoiceTimer();
      }
    };
  }

  async _handleUserVoiceInput(text) {
    const finalText = text?.trim();
    if (!finalText) return;
    this.messages.push({ role: "user", content: finalText });
    this.chatContents.push({ role: "user", parts: [{ text: finalText }] });
    this._clearVoiceDraft({ hide: true });

    this.stage.setTyping(true);
    try {
      const replyText = await this._fetchChatReply(this.chatContents);
      if (!replyText) {
        this.stage.showSystem("Connection lost.");
        return;
      }
      this.messages.push({ role: "model", content: replyText });
      this.chatContents.push({ role: "model", parts: [{ text: replyText }] });
      this.stage.setTyping(false);
      this._streamRealReply(replyText);
    } catch (err) {
      console.error("Chat failed", err);
      this.stage.showSystem("Connection lost.");
    }
  }

  _streamRealReply(text) {
    const replyText = typeof text === "string" ? text : "";
    if (!replyText) return;
    let index = 0;
    this._clearMockStream({ clearText: false });

    this.mockStreamInterval = setInterval(() => {
      index++;
      this.stage.showAI(replyText.slice(0, index));
      if (index >= replyText.length) {
        clearInterval(this.mockStreamInterval);
        this.mockStreamInterval = null;
      }
    }, 40);
  }

  _openFilePicker() {
    if (this.saveInFlight || this.blockerActive) return;
    const { fileInput } = this.dom;
    if (!fileInput) return;
    fileInput.value = "";
    fileInput.click();
  }

  _startAnalysisTrace(file) {
    const trace = {
      id: (this.analysisTraceId += 1),
      fileSize: typeof file?.size === "number" ? file.size : 0,
      t0: performance.now(),
    };
    console.info(`[analysis:${trace.id}] t0 select size=${trace.fileSize}B`);
    return trace;
  }

  _markAnalysisTrace(trace, key, extra) {
    if (!trace) return;
    trace[key] = performance.now();
    const elapsed = Math.round(trace[key] - trace.t0);
    const suffix = extra ? ` ${extra}` : "";
    console.info(`[analysis:${trace.id}] ${key} +${elapsed}ms${suffix}`);
  }

  _logAnalysisSummary(trace) {
    if (!trace) return;
    const parts = [];
    if (trace.t1 != null) parts.push(`preprocess=${Math.round(trace.t1 - trace.t0)}ms`);
    if (trace.t2 != null && trace.t3 != null) parts.push(`ttfb=${Math.round(trace.t3 - trace.t2)}ms`);
    if (trace.t4 != null) parts.push(`total=${Math.round(trace.t4 - trace.t0)}ms`);
    console.info(`[analysis:${trace.id}] summary ${parts.join(" ")}`);
  }

  async _handleImageFile(file) {
    const { loading } = this.dom;
    if (!file) return;
    if (this.saveInFlight || this.blockerActive) return;
    this._setSaveBlockerVisible(true, "Analyzing image...");
    const analysisTrace = this._startAnalysisTrace(file);
    const analysisPromise = this._getImageAnalysis(file, analysisTrace);
    if (loading) loading.style.opacity = 1;
    try {
      const processed = await preprocessImage(file, analysisTrace);
      this.currentSource = {
        thumb: processed.thumb,
        render: processed.render,
        dimensions: { width: processed.render.width, height: processed.render.height },
      };
      this.sessionImage = this.currentSource;

      const texture = await loadTextureFromBlob(processed.render.blob, this.textureLoader);
      this._applyTexture(this.editorMaterial, texture);
      this._setMeshScale(this.editorParticles, processed.render);
      this._resetHomeDraftState({ resetMessages: true });

      const analysis = await analysisPromise;
      const caption = analysis?.caption || "";
      this.imageAnalysis = caption;
      this._setOpeningLineFromAnalysis(caption);
      this._setHomePromptQuestions(analysis?.questions);
      this._markAnalysisTrace(analysisTrace, "t4_ui", `captionLen=${caption.length}`);
      this._logAnalysisSummary(analysisTrace);

      if (!this.hasUploadedOnce) {
        this.hasUploadedOnce = true;
        writeHasUploadedFlag();
      }

      this._setMode("home");
    } catch (err) {
      console.warn("Failed to process upload", err);
      alert("Could not process image. Please try a different file.");
    } finally {
      if (loading) loading.style.opacity = 0;
      this._setSaveBlockerVisible(false);
      this._syncHomeActionState();
    }
  }

  async _handleSaveMemory() {
    if (this.saveInFlight || this.blockerActive) return;
    if (!this._hasSessionImage()) return;
    const hasOpeningLine = this.messages.some(
      (msg) => msg && msg.role === "model" && typeof msg.content === "string" && msg.content.trim().length > 0
    );
    if (!hasOpeningLine) return;

    this.saveInFlight = true;
    this._syncHomeActionState();
    this._setSaveBlockerVisible(true, "Generating diary...");
    this._stopVoiceTimer();
    this._clearMockStream({ clearText: false });

    const transcript = this._getTranscriptForSave();
    let modalShown = false;
    try {
      const diaryResult = await this._getDiaryResultForSave(transcript);
      const diaryCard = diaryResult?.diaryCard;
      if (!diaryCard) return;
      if (!this.currentSource?.render?.blob || !this.currentSource?.thumb?.blob) return;

      const id = createMemoryId();
      const record = this._serializeMemory(id, { diaryCard, transcript });

      await this.storage.saveMemory(record, { thumbBlob: this.currentSource.thumb.blob, renderBlob: this.currentSource.render.blob });

      const material = cloneMaterialFromSettings(this.editorMaterial, this.settings);
      this._setMaterialSeed(material, id);
      this._registerMaterial(material);
      const texture = await loadTextureFromBlob(this.currentSource.render.blob, this.textureLoader);
      this._applyTexture(material, texture);

      const memoryMesh = new THREE.Points(this.geometry, material);
      this._setMeshScale(memoryMesh, record.dimensions);
      this._addMemory({ id, record, mesh: memoryMesh, hasHighRes: true, renderLoading: false }, { prepend: true });
      this._setSaveBlockerVisible(false);
      this._presentDiaryModal({
        diaryCard,
        diaryText: diaryResult?.diaryText || "",
        highlights: diaryResult?.highlights || [],
      });
      modalShown = true;
    } catch (err) {
      console.warn("Failed to save memory", err);
      alert("Could not save memory. Please try again.");
    } finally {
      this.saveInFlight = false;
      if (!modalShown) {
        this._setSaveBlockerVisible(false);
      }
      this._syncHomeActionState();
    }
  }

  async _initStorage() {
    try {
      await this.storage.init();
      await this._hydrateFromStorage();
    } catch (err) {
      console.warn("Storage initialization failed; continuing without persistence", err);
    } finally {
      this._applyInitialMode();
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
    if (this.state.memories.length > 0) this._updateGalleryTarget();
  }

  _applyInitialMode() {
    const hasMemories = this.state.memories.length > 0;
    if (!this.hasUploadedOnce && !hasMemories) {
      this._setMode("landing");
    } else {
      this._setMode("home");
    }
  }

  _serializeMemory(id, { diaryCard, transcript } = {}) {
    const fallbackDiary = diaryCard || this._createDiaryCardStub();
    return {
      id,
      createdAt: new Date().toISOString(),
      schemaVersion: SCHEMA_VERSION,
      assets: { thumbKey: `${id}:thumb`, renderKey: `${id}:render` },
      settingsSnapshot: { ...this.settings },
      dimensions: this.currentSource?.dimensions,
      diaryCard: fallbackDiary,
      transcript: transcript || "",
    };
  }

  _createDiaryCardStub() {
    return {
      title: "Untitled",
      summary: "",
      mood: "",
      tags: [],
      dateISO: new Date().toISOString(),
    };
  }

  _getTranscriptForSave() {
    if (!this.messages || this.messages.length === 0) return "";
    return this.messages
      .map((msg) => `${msg.role === "user" ? "User" : "Afterglow"}: ${msg.content}`)
      .join("\n");
  }

  _createMockDiaryCard({ createdAt, transcript }) {
    const createdDate = createdAt ? new Date(createdAt) : new Date();
    const summaryBase = transcript ? transcript.trim() : "";
    const summary =
      summaryBase.length > 0
        ? summaryBase.slice(0, 180)
        : DIARY_FALLBACK_SUMMARY;
    return {
      title: "Afterglow Reflection",
      summary,
      mood: "Calm",
      tags: ["afterglow", "memory"],
      dateISO: createdDate.toISOString(),
    };
  }

  _setHomePromptQuestions(questions, { useFallback = true } = {}) {
    const normalized = Array.isArray(questions)
      ? questions
          .filter((item) => typeof item === "string")
          .map((item) => item.trim())
          .filter((item) => item.length > 0)
      : [];
    let nextQuestions = normalized;
    if (useFallback && nextQuestions.length < 2) {
      nextQuestions = HOME_PROMPT_FALLBACK_QUESTIONS.slice(0, 3);
    } else if (nextQuestions.length > 3) {
      nextQuestions = nextQuestions.slice(0, 3);
    }
    this.analysisQuestions = nextQuestions;
  }

  async _getImageAnalysis(file, trace) {
    try {
      return await this._fetchImageAnalysis(file, trace);
    } catch (err) {
      console.warn("Image analysis failed; using fallback.", err);
      const caption = await this._simulateImageAnalysis();
      return { vibe: "", caption, questions: HOME_PROMPT_FALLBACK_QUESTIONS };
    }
  }

  async _fetchImageAnalysis(file, trace) {
    const formData = new FormData();
    formData.append("image", file);
    if (trace) {
      trace.t2 = performance.now();
      console.info(`[analysis:${trace.id}] t2_fetch_start +${Math.round(trace.t2 - trace.t0)}ms`);
    }
    const response = await fetch(`${API_BASE}/api/analyze-image`, { method: "POST", body: formData });
    if (trace) {
      trace.t3 = performance.now();
      const ttfb = Math.round(trace.t3 - trace.t2);
      const len = response.headers.get("content-length");
      console.info(
        `[analysis:${trace.id}] t3_headers +${ttfb}ms status=${response.status} len=${len || "?"}`
      );
    }
    if (!response.ok) throw new Error("Analyze request failed");
    const data = await response.json();
    if (trace) {
      trace.t3json = performance.now();
      console.info(
        `[analysis:${trace.id}] t3_json +${Math.round(trace.t3json - trace.t2)}ms`
      );
    }
    return {
      vibe: typeof data.vibe === "string" ? data.vibe : "",
      caption: typeof data.caption === "string" ? data.caption : "",
      questions: Array.isArray(data.questions) ? data.questions.filter((q) => typeof q === "string") : [],
    };
  }

  _simulateImageAnalysis() {
    const options = [
      "soft light, a centered subject, and a calm palette",
      "gentle contrast, a still focal point, and a quiet mood",
      "warm tones, soft shadows, and an intimate composition",
      "clean lines, muted color, and a grounded atmosphere",
    ];
    const delay = 1200 + Math.random() * 800;
    const choice = options[Math.floor(Math.random() * options.length)];
    return new Promise((resolve) => {
      window.setTimeout(() => resolve(choice), delay);
    });
  }

  _buildOpeningLine(analysis) {
    const raw = analysis ? String(analysis).trim() : "a quiet scene";
    const cleaned = raw.replace(/[.!?]+$/, "");
    return `Noticing ${cleaned}; what does this moment mean to you?`;
  }

  _setOpeningLineFromAnalysis(analysis) {
    const line = this._buildOpeningLine(analysis);
    this.messages = [{ role: "model", content: line }];
    this.chatContents = [{ role: "model", parts: [{ text: line }] }];
    this.stage.showAI(line);
    return line;
  }

  _clearMockDiaryTimer() {
    if (this.mockDiaryTimer) {
      clearTimeout(this.mockDiaryTimer);
      this.mockDiaryTimer = null;
    }
    if (this.mockDiaryResolve) {
      this.mockDiaryResolve(null);
      this.mockDiaryResolve = null;
    }
  }

  _simulateDiaryGeneration({ transcript }) {
    this._clearMockDiaryTimer();
    return new Promise((resolve) => {
      this.mockDiaryResolve = resolve;
      const delay = 2000 + Math.random() * 2000;
      this.mockDiaryTimer = window.setTimeout(() => {
        this.mockDiaryTimer = null;
        const nextCard = this._createMockDiaryCard({ transcript });
        const diaryText = nextCard.summary || transcript || DIARY_FALLBACK_SUMMARY;
        const finalize = this.mockDiaryResolve;
        this.mockDiaryResolve = null;
        if (finalize) finalize({ diaryCard: nextCard, diaryText, highlights: [] });
      }, delay);
    });
  }

  async _fetchDiaryResponse({ transcriptText, dateISO }) {
    const response = await fetch(`${API_BASE}/api/generate-diary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcriptText, dateISO }),
    });
    if (!response.ok) throw new Error("Diary request failed");
    return await response.json();
  }

  _mapDiaryResponseToResult(apiResponse, { transcriptText, dateISO }) {
    const response = apiResponse && typeof apiResponse === "object" ? apiResponse : {};
    const diaryTextRaw = typeof response.diary === "string" ? response.diary.trim() : "";
    const highlights = Array.isArray(response.highlights)
      ? response.highlights.filter((item) => typeof item === "string" && item.trim().length > 0)
      : [];
    let summarySource = diaryTextRaw;
    if (!summarySource && highlights.length) {
      summarySource = highlights.join(" - ").trim();
    }
    if (!summarySource) {
      summarySource = (transcriptText || "").trim();
    }
    let summary = summarySource.slice(0, 180);
    if (!summary) summary = DIARY_FALLBACK_SUMMARY;
    const diaryCard = {
      title: typeof response.title === "string" && response.title ? response.title : "Untitled",
      summary,
      mood: typeof response.mood === "string" ? response.mood : "",
      tags: Array.isArray(response.tags) ? response.tags.filter((tag) => typeof tag === "string") : [],
      dateISO: typeof dateISO === "string" && dateISO ? dateISO : new Date().toISOString(),
    };
    const diaryText = diaryTextRaw || summarySource || summary;
    return { diaryCard, diaryText, highlights };
  }

  async _getDiaryResultForSave(transcript) {
    const dateISO = new Date().toISOString();
    try {
      const apiResponse = await this._fetchDiaryResponse({ transcriptText: transcript, dateISO });
      return this._mapDiaryResponseToResult(apiResponse, { transcriptText: transcript, dateISO });
    } catch (err) {
      console.warn("Diary generation failed; using fallback.", err);
      return this._simulateDiaryGeneration({ transcript });
    }
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
    this._setMaterialSeed(material, record.id);
    this._registerMaterial(material);
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
    this._updateMemoryCount();
    if (this.infoOpen) this._renderInfoForSelectedMemory();
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

  _syncControlDistance(distance) {
    if (!this.controls) return;
    const target = this.controls.target.clone();
    const offset = this.camera.position.clone().sub(target);
    if (offset.lengthSq() < 1e-6) offset.set(0, 0, 1);
    offset.setLength(distance);
    this.camera.position.copy(target).add(offset);
    this.controls.minDistance = distance;
    this.controls.maxDistance = distance;
    this.controls.update();
  }

  _bindControlsDebug(element) {
    if (!element) return;
    element.addEventListener(
      "pointerdown",
      (e) => {
        if (!window.__AF_DEBUG_CONTROLS) return;
        console.log("[Afterglow] controls pointerdown", { target: e.target, currentTarget: e.currentTarget });
      },
      { passive: true }
    );
  }

  _updateNavOffset() {
    const nav = this.dom.nav;
    if (!nav) return;
    const rect = nav.getBoundingClientRect();
    const root = document.documentElement;
    root.style.setProperty("--af-nav-h", `${rect.height}px`);
    root.style.setProperty("--af-nav-offset", `calc(${rect.height}px + env(safe-area-inset-top, 0px))`);
  }

  _setSaveBlockerVisible(isVisible, text) {
    const { blocker, blockerText } = this.dom;
    this.blockerActive = isVisible;
    document.body.classList.toggle("is-blocked", isVisible);
    if (blockerText && typeof text === "string") {
      blockerText.innerText = text;
    }
    if (!blocker) return;
    blocker.setAttribute("aria-hidden", isVisible ? "false" : "true");
  }

  _markHudDirty() {
    this._hudDirty = true;
  }

  _setMode(mode) {
    const { controlPanel, galleryUI, hallResetBtn, landingRoot, appShell } = this.dom;
    const nextMode = mode === "landing" || mode === "gallery" || mode === "home" ? mode : "home";
    const isGallery = nextMode === "gallery";
    const isHome = nextMode === "home";
    this.state.mode = nextMode;
    document.body.classList.remove("mode-landing", "mode-home", "mode-gallery");
    document.body.classList.add(`mode-${nextMode}`);
    if (controlPanel) controlPanel.classList.toggle("hidden", !isHome);
    if (galleryUI) galleryUI.classList.toggle("hidden", !isGallery);
    if (hallResetBtn) hallResetBtn.classList.toggle("hidden", !isGallery);
    if (landingRoot) landingRoot.setAttribute("aria-hidden", nextMode === "landing" ? "false" : "true");
    if (appShell) appShell.setAttribute("aria-hidden", nextMode === "landing" ? "true" : "false");
    if (this._homeUiVisible !== isHome) {
      this._homeUiVisible = isHome;
      this._setHomeVoiceUIVisible(isHome);
    }
    if (isHome) this._markHudDirty();
    else this._hudDirty = false;
  }

  _syncHomeVoiceUI() {
    if (this.state?.mode !== "home") return;
    if (!this._homeUiVisible) {
      this._homeUiVisible = true;
      this._setHomeVoiceUIVisible(true);
    }
    this._syncHomeActionState();
  }

  _setHomeVoiceUIVisible(isVisible) {
    const { agentPill, homeVoice } = this.dom;
    this.stage.setVisible(isVisible);
    if (agentPill) {
      agentPill.style.display = isVisible ? "inline-flex" : "none";
      agentPill.style.pointerEvents = isVisible ? "auto" : "none";
    }
    if (homeVoice) {
      homeVoice.style.display = isVisible ? "flex" : "none";
      homeVoice.style.pointerEvents = isVisible ? "auto" : "none";
    }
    if (!isVisible) {
      this._stopVoiceTimer();
      this._clearMockStream({ clearText: true });
      this._clearMockDiaryTimer();
    }
  }

  _hasSessionImage() {
    const source = this.sessionImage || this.currentSource;
    return Boolean(source?.render?.blob && source?.thumb?.blob);
  }

  _syncHomeActionState() {
    const { micBtn, saveMemoryBtn, closeVoiceBtn } = this.dom;
    const isHome = this.state?.mode === "home";
    const hasImage = this._hasSessionImage();
    const hasOpeningLine = this.messages.some(
      (msg) => msg && msg.role === "model" && typeof msg.content === "string" && msg.content.trim().length > 0
    );
    const canUseMic = isHome && hasImage && !this.saveInFlight && !this.blockerActive;
    const canSave = canUseMic && hasOpeningLine;

    const nextMicDisabled = !canUseMic;
    const nextSaveDisabled = !canSave;
    const nextCloseDisabled = !canUseMic;
    if (micBtn && this._hudCache.micDisabled !== nextMicDisabled) {
      micBtn.disabled = nextMicDisabled;
      this._hudCache.micDisabled = nextMicDisabled;
    }
    if (saveMemoryBtn && this._hudCache.saveDisabled !== nextSaveDisabled) {
      saveMemoryBtn.disabled = nextSaveDisabled;
      this._hudCache.saveDisabled = nextSaveDisabled;
    }
    if (closeVoiceBtn && this._hudCache.closeDisabled !== nextCloseDisabled) {
      closeVoiceBtn.disabled = nextCloseDisabled;
      this._hudCache.closeDisabled = nextCloseDisabled;
    }

    if (!hasImage && this.voiceTimerRunning) {
      this._stopVoiceTimer({ reset: true, clearDraft: true });
      this._clearMockStream({ clearText: true });
    }
  }

  _updateVoiceTimerLabel() {
    const { voiceTimer } = this.dom;
    if (!voiceTimer) return;
    const minutes = Math.floor(this.voiceTimerSeconds / 60);
    const seconds = this.voiceTimerSeconds % 60;
    const nextLabel = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    if (this._hudCache.timerLabel !== nextLabel) {
      voiceTimer.textContent = nextLabel;
      this._hudCache.timerLabel = nextLabel;
    }
  }

  _getVoiceDraftDisplay() {
    const draft = this.voiceDraft.trim();
    const interim = this.voiceInterim.trim();
    if (!draft && !interim) return "";
    return [draft, interim].filter(Boolean).join(" ");
  }

  _renderVoiceDraft() {
    const display = this._getVoiceDraftDisplay();
    if (display) this.stage.showUser(display);
    else this.stage.hideUser();
  }

  _clearVoiceDraft({ hide = false } = {}) {
    this.voiceDraft = "";
    this.voiceInterim = "";
    if (hide) this.stage.hideUser();
  }

  _toggleVoiceTimer() {
    console.info("[mic] toggle", {
      running: this.voiceTimerRunning,
      recognizing: this.isRecognizing,
      commitPending: this.voiceCommitPending,
      draftLength: this.voiceDraft.length,
      blocked: this.blockerActive,
      disabled: this.dom?.micBtn?.disabled,
    });
    if (this.saveInFlight || this.blockerActive) return;
    if (!this._hasSessionImage()) return;
    if (!this.recognition) {
      alert("Not supported");
      return;
    }

    if (this.voiceTimerRunning) {
      this.voiceTimerRunning = false;
      this.voiceCommitPending = true;
      if (this.isRecognizing) {
        this.recognition.stop();
      } else {
        this.stage.setListening(false);
      }
    } else {
      this.voiceTimerRunning = true;
      this.voiceCommitPending = false;
      this.voiceInterim = "";
      this._renderVoiceDraft();
      this.voiceTimerSeconds = 0;
      this._updateVoiceTimerLabel();
      if (this.isRecognizing) return;
      try {
        this.recognition.start();
      } catch (err) {
        this.voiceTimerRunning = false;
        this.voiceCommitPending = false;
        this.stage.setListening(false);
      }
    }
  }

  _startVoiceTimer() {
    if (this.voiceTimerRunning) return;
    this.voiceTimerRunning = true;
    this._setMicActiveState(true);
    this.voiceTimerInterval = window.setInterval(() => {
      this.voiceTimerSeconds += 1;
      this._updateVoiceTimerLabel();
    }, 1000);
  }

  _stopVoiceTimer({ reset = false, clearDraft = false } = {}) {
    this.voiceTimerRunning = false;
    this.voiceCommitPending = false;
    if (this.recognition) this.recognition.stop();
    if (this.mockStreamInterval) {
      clearInterval(this.mockStreamInterval);
      this.mockStreamInterval = null;
    }
    if (this.voiceTimerInterval) {
      clearInterval(this.voiceTimerInterval);
      this.voiceTimerInterval = null;
    }
    this.stage.setListening(false);
    if (clearDraft) this._clearVoiceDraft({ hide: true });
    this._setMicActiveState(false);
    if (reset) this.voiceTimerSeconds = 0;
    this._updateVoiceTimerLabel();
  }

  _resetHomeDraftState({ resetMessages = false } = {}) {
    this._stopVoiceTimer({ reset: true, clearDraft: true });
    this._clearMockStream({ clearText: true });
    if (resetMessages) this.messages = [];
    this.chatContents = [];
    this.analysisQuestions = [];
    this.stage.clearAll();
    this._setHomePromptQuestions([], { useFallback: false });
  }

  _setMicActiveState(isActive) {
    const { micBtn } = this.dom;
    if (!micBtn) return;
    micBtn.classList.toggle("is-active", isActive);
    micBtn.setAttribute("aria-pressed", isActive ? "true" : "false");
    this._markHudDirty();
  }

  _clearMockStream({ clearText = false } = {}) {
    if (this.mockStreamInterval) {
      clearInterval(this.mockStreamInterval);
      this.mockStreamInterval = null;
    }
    if (clearText) this.stage.clearAll();
  }

  _buildChatUserText() {
    const parts = [];
    if (this.imageAnalysis) parts.push(`Caption: ${this.imageAnalysis}.`);
    if (this.analysisQuestions.length) parts.push(`Questions: ${this.analysisQuestions.join(" / ")}.`);
    parts.push("Share a brief reflection on this moment.");
    return parts.join(" ");
  }

  async _fetchChatReply(contents) {
    const response = await fetch(`${API_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents }),
    });
    if (!response.ok) throw new Error("Chat request failed");
    const data = await response.json();
    return typeof data.text === "string" ? data.text : "";
  }

  async _startMockAssistantStream() {
    if (this.state?.mode !== "home" || !this._hasSessionImage() || this.blockerActive) return;
    this._clearMockStream({ clearText: true });
    const fallbackReply = "I caught a gentle moment here - soft light, a steady calm, and the feeling of holding onto something tender.";
    const requestId = (this.chatRequestId += 1);
    const userText = this._buildChatUserText();
    if (userText) {
      this.chatContents.push({ role: "user", parts: [{ text: userText }] });
    }
    let reply = fallbackReply;
    this.stage.setTyping(true);
    try {
      const apiText = await this._fetchChatReply(this.chatContents);
      if (this.chatRequestId !== requestId) return;
      if (apiText) reply = apiText;
    } catch (err) {
      if (this.chatRequestId !== requestId) return;
      console.warn("Chat request failed; using fallback.", err);
    }
    if (this.state?.mode !== "home") return;
    this.stage.setTyping(false);
    this.chatContents.push({ role: "model", parts: [{ text: reply }] });
    this._streamRealReply(reply);
  }

  _setMaterialSeed(material, id) {
    if (!material?.uniforms?.uSeed) return;
    material.uniforms.uSeed.value = hashStringToSeed(id);
  }

  _registerMaterial(material) {
    if (!material) return;
    this.materialRegistry.add(material);
    this._applyRenderModeToMaterial(material);
  }

  _applyRenderModeToMaterial(material, preset = RENDER_MODE_PRESETS[this.renderMode]) {
    if (!material?.uniforms || !preset) return;
    if (material.uniforms.uStippleStrength) material.uniforms.uStippleStrength.value = preset.stipple;
    if (material.uniforms.uHaloStrength) material.uniforms.uHaloStrength.value = preset.halo;
    if (material.uniforms.uGrainStrength) material.uniforms.uGrainStrength.value = preset.grain;
    if (material.uniforms.uLayeredStrength) material.uniforms.uLayeredStrength.value = preset.layered;
    if (material.uniforms.uLayerDepth) material.uniforms.uLayerDepth.value = preset.layerDepth ?? 0.0;
    if (material.uniforms.uLayerNoiseDepth) material.uniforms.uLayerNoiseDepth.value = preset.layerNoiseDepth ?? 0.0;
  }

  _syncRenderToggle() {
    const { renderKolam, renderHalo, renderLayered } = this.dom;
    if (renderKolam) renderKolam.classList.toggle("is-active", this.renderMode === "kolam");
    if (renderHalo) renderHalo.classList.toggle("is-active", this.renderMode === "halo");
    if (renderLayered) renderLayered.classList.toggle("is-active", this.renderMode === "layered");
  }

  setRenderMode(mode, { persist = true, updateUI = true } = {}) {
    const normalized = normalizeRenderMode(mode);
    this.renderMode = normalized;
    const preset = RENDER_MODE_PRESETS[normalized];
    if (persist) writeRenderMode(normalized);
    this.materialRegistry.forEach((material) => {
      this._applyRenderModeToMaterial(material, preset);
    });
    if (updateUI) this._syncRenderToggle();
  }

  _updateAllUniforms(key, value) {
    if (!key) return;
    if (this.editorMaterial.uniforms[key]) this.editorMaterial.uniforms[key].value = value;

    this.state.memories.forEach((mem) => {
      if (mem.mesh?.material?.uniforms?.[key]) mem.mesh.material.uniforms[key].value = value;
    });
  }

  _presentDiaryModal({ diaryCard, diaryText = "", highlights = [] } = {}) {
    const {
      diaryModal,
      diaryModalDate,
      diaryModalTime,
      diaryModalMood,
      diaryModalTitle,
      diaryModalSubtitle,
      diaryModalContent,
      diaryModalAiText,
      diaryModalTags,
    } = this.dom;
    if (!diaryModal || !diaryCard) {
      this._enterHall();
      return;
    }

    const createdAt = diaryCard.dateISO ? new Date(diaryCard.dateISO) : new Date();
    const dateLabel = createdAt.toLocaleDateString("en-US", { month: "short", day: "2-digit" }).toUpperCase();
    const timeLabel = createdAt.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    const moodText = diaryCard.mood || "Neutral";
    const fullText = diaryText && diaryText.trim().length > 0 ? diaryText.trim() : diaryCard.summary || "";
    const insightText = highlights.length ? highlights.join(" - ") : diaryCard.summary || "";

    if (diaryModalDate) diaryModalDate.innerText = dateLabel;
    if (diaryModalTime) diaryModalTime.innerText = timeLabel;
    if (diaryModalMood) diaryModalMood.innerText = moodText;
    if (diaryModalTitle) diaryModalTitle.innerText = diaryCard.title || "Untitled Memory";
    if (diaryModalSubtitle) diaryModalSubtitle.innerText = "Captured in the Afterglow";
    if (diaryModalContent) diaryModalContent.innerText = fullText;
    if (diaryModalAiText) diaryModalAiText.innerText = insightText;

    if (diaryModalTags) {
      diaryModalTags.innerHTML = "";
      const tags = Array.isArray(diaryCard.tags) ? diaryCard.tags : [];
      tags.forEach((tag) => {
        const span = document.createElement("span");
        span.className = "af-ai-tag";
        span.innerText = `#${tag}`;
        diaryModalTags.appendChild(span);
      });
      diaryModalTags.style.display = tags.length ? "flex" : "none";
    }

    this.diaryModalOpen = true;
    this.diaryModalData = { diaryCard, diaryText: fullText, highlights };
    this.blockerActive = true;
    diaryModal.classList.add("is-visible");
    diaryModal.setAttribute("aria-hidden", "false");
    this._syncHomeActionState();
  }

  _resetDiaryShareLabel() {
    const { diaryModalShare } = this.dom;
    const label = diaryModalShare?.querySelector("span");
    if (!label) return;
    label.textContent = "Share";
  }

  _shareDiaryModal() {
    const { diaryModalShare } = this.dom;
    const text = this.diaryModalData?.diaryText || "";
    if (!diaryModalShare || !text) return;
    const label = diaryModalShare.querySelector("span");
    if (!label) return;

    const setLabel = (next) => {
      label.textContent = next;
      if (this.shareResetTimer) window.clearTimeout(this.shareResetTimer);
      this.shareResetTimer = window.setTimeout(() => {
        this._resetDiaryShareLabel();
      }, 1400);
    };

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => setLabel("Copied"),
        () => setLabel("Copy failed")
      );
      return;
    }

    try {
      window.prompt("Copy diary text:", text);
      setLabel("Copied");
    } catch (err) {
      setLabel("Copy failed");
    }
  }

  _dismissDiaryModal() {
    const { diaryModal } = this.dom;
    if (!this.diaryModalOpen) return;
    this.diaryModalOpen = false;
    this.diaryModalData = null;
    this.blockerActive = false;
    if (this.shareResetTimer) {
      window.clearTimeout(this.shareResetTimer);
      this.shareResetTimer = null;
    }
    this._resetDiaryShareLabel();
    if (diaryModal) {
      diaryModal.classList.remove("is-visible");
      diaryModal.setAttribute("aria-hidden", "true");
    }
    this._syncHomeActionState();
    this._enterHall();
  }

  _updateGalleryLayout() {
    this._syncCarouselToIndex({ snap: true });
  }

  _enterHall() {
    if (this._isInHall()) return false;
    if (this.state.memories.length === 0) {
      alert("Archive is empty.");
      return false;
    }

    this._setMode("gallery");

    this.editorGroup.visible = false;
    this.galleryGroup.visible = true;
    this._applyHallCamera(true);

    this.desiredTarget.set(0, 0, 0);
    this._updateGalleryTarget({ snap: true });
    this._ensureRenderForCurrent();
    if (this.infoOpen) this._renderInfoForSelectedMemory();
    return true;
  }

  _isInHall() {
    return this.state.mode === "gallery";
  }

  _setInfoOpen(isOpen) {
    this.infoOpen = isOpen;
    const { infoPanel } = this.dom;
    if (!infoPanel) return;
    infoPanel.classList.toggle("af-hidden", !isOpen);
    infoPanel.setAttribute("aria-hidden", isOpen ? "false" : "true");
    if (isOpen) this._renderInfoForSelectedMemory();
  }

  _getSelectedMemoryMeta() {
    const count = this.state.memories.length;
    if (!count) return { memory: null, index: -1, number: null };
    const index = wrapIndex(this.state.galleryIndex, count);
    const memory = this.state.memories[index] || null;
    if (!memory) return { memory: null, index: -1, number: null };
    return { memory, index, number: index + 1 };
  }

  _renderInfoForSelectedMemory() {
    const {
      infoMemNo,
      infoEmpty,
      infoDiary,
      diaryTitle,
      diaryDate,
      diaryMood,
      diaryTags,
      diarySummary,
      diaryTranscript,
    } = this.dom;
    if (!infoMemNo && !infoEmpty && !infoDiary) return;

    const { memory, number } = this._getSelectedMemoryMeta();
    if (infoMemNo) {
      infoMemNo.innerText = memory ? `MEM ${String(number).padStart(2, "0")}` : "MEM --";
    }

    if (!memory) {
      if (infoEmpty) {
        infoEmpty.innerText = "No memory selected yet.";
        infoEmpty.style.display = "block";
      }
      if (infoDiary) infoDiary.style.display = "none";
      return;
    }

    const diary = memory.record?.diaryCard;
    const hasDiary = Boolean(diary);
    if (!hasDiary) {
      if (infoEmpty) {
        infoEmpty.innerText = "No diary for this memory yet.";
        infoEmpty.style.display = "block";
      }
      if (infoDiary) infoDiary.style.display = "none";
      return;
    }

    if (infoEmpty) infoEmpty.style.display = "none";
    if (infoDiary) infoDiary.style.display = "flex";

    if (diaryTitle) diaryTitle.innerText = diary.title || "Untitled";
    if (diarySummary) diarySummary.innerText = diary.summary || "";

    const dateText = diary.dateISO ? new Date(diary.dateISO).toLocaleDateString() : "";
    if (diaryDate) diaryDate.innerText = dateText;

    const moodText = diary.mood || "";
    if (diaryMood) {
      diaryMood.innerText = moodText;
      diaryMood.style.display = moodText ? "inline" : "none";
    }

    const tags = Array.isArray(diary.tags) ? diary.tags : [];
    if (diaryTags) {
      diaryTags.innerText = tags.length ? tags.map((tag) => `#${tag}`).join(" ") : "";
      diaryTags.style.display = tags.length ? "block" : "none";
    }

    const transcript = memory.record?.transcript || "";
    if (diaryTranscript) {
      diaryTranscript.innerText = transcript;
      const details = diaryTranscript.closest("details");
      if (details) details.style.display = transcript ? "block" : "none";
    }
  }

  _updateMemoryCount() {
    const { memoryCount } = this.dom;
    if (!memoryCount) return;
    const count = this.state.memories.length;
    memoryCount.innerText = `(${count})`;
  }

  _updateGalleryCounter() {
    const { galleryCounter } = this.dom;
    if (!galleryCounter) return;
    const count = this.state.memories.length;
    if (count <= 0) return;
    const index = wrapIndex(this.state.galleryIndex, count) + 1;
    galleryCounter.innerText = `MEMORY ${String(index).padStart(2, "0")}`;
  }

  _applyHallCamera(isHall) {
    if (!this.camera) return;
    if (isHall) {
      this.camera.fov = this.hallFov;
      this.camera.near = 0.01;
      this.camera.far = 100;
    } else if (this.cameraDefaults) {
      this.camera.fov = this.cameraDefaults.fov;
      this.camera.near = this.cameraDefaults.near;
      this.camera.far = this.cameraDefaults.far;
    }
    this.camera.updateProjectionMatrix();
  }

  _resetHallViewParams() {
    this.ringSettings.radius = RING_DEFAULTS.radius;
    this.ringSettings.depth = RING_DEFAULTS.depth;
    this.ringSettings.angle = RING_DEFAULTS.angle;
    this.hallFov = HALL_FOV_DEFAULT;
    this.hallOpacityBase = CAROUSEL.opacityBase;

    writeStoredNumber(RING_KEYS.radius, this.ringSettings.radius);
    writeStoredNumber(RING_KEYS.depth, this.ringSettings.depth);
    writeStoredNumber(RING_KEYS.angle, this.ringSettings.angle);
    writeStoredNumber(HALL_FOV_KEY, this.hallFov);
    writeStoredNumber(HALL_OPACITY_KEY, this.hallOpacityBase);

    const sliders = this.dom.sliders || {};
    if (sliders.ringRadius?.input) sliders.ringRadius.input.value = this.ringSettings.radius;
    if (sliders.ringRadius?.label) sliders.ringRadius.label.innerText = this.ringSettings.radius.toFixed(2);
    if (sliders.ringDepth?.input) sliders.ringDepth.input.value = this.ringSettings.depth;
    if (sliders.ringDepth?.label) sliders.ringDepth.label.innerText = this.ringSettings.depth.toFixed(2);
    if (sliders.ringAngle?.input) sliders.ringAngle.input.value = this.ringSettings.angle;
    if (sliders.ringAngle?.label) sliders.ringAngle.label.innerText = this.ringSettings.angle.toFixed(2);
    if (sliders.hallFov?.input) sliders.hallFov.input.value = this.hallFov;
    if (sliders.hallFov?.label) sliders.hallFov.label.innerText = Math.round(this.hallFov).toString();

    if (this._isInHall()) this._applyHallCamera(true);
  }

  _navigateHall(delta) {
    if (!this._isInHall()) return;
    const count = this.state.memories.length;
    if (!count) return;
    this.state.galleryIndex = wrapIndex(this.state.galleryIndex + delta, count);
    this._setCarouselTarget(this.state.galleryIndex);
    this._ensureRenderForCurrent();
    this._updateGalleryCounter();
    if (this.infoOpen) this._renderInfoForSelectedMemory();
  }

  _setCarouselTarget(targetIndex) {
    this.carousel.indexTarget = targetIndex;
  }

  _syncCarouselToIndex({ snap = false } = {}) {
    const count = this.state.memories.length;
    if (!count) {
      this.carousel.indexTarget = 0;
      this.carousel.indexFloat = 0;
      return;
    }
    this.state.galleryIndex = wrapIndex(this.state.galleryIndex, count);
    this.carousel.indexTarget = this.state.galleryIndex;
    if (snap) {
      this.carousel.indexFloat = this.carousel.indexTarget;
    }
  }

  _updateCarouselCenter(count) {
    if (!count) return 0;
    const carousel = this.carousel;
    const target = wrapIndex(carousel.indexTarget, count);
    const offset = getWrappedOffset(target, carousel.indexFloat, count);
    if (Math.abs(offset) < 0.001) {
      carousel.indexFloat = target;
    } else {
      carousel.indexFloat += offset * CAROUSEL.indexLerp;
    }
    return carousel.indexFloat;
  }

  _getCarouselScale(absOffset) {
    const t = Math.min(1, absOffset / 2);
    return THREE.MathUtils.lerp(1.0, CAROUSEL.sideScale, t);
  }

  _ensureCarouselCache(memory) {
    if (!memory.carousel) {
      memory.carousel = {
        targetPos: new THREE.Vector3(),
        targetScale: new THREE.Vector3(1, 1, 1),
        targetQuat: new THREE.Quaternion(),
      };
    }
    return memory.carousel;
  }

  _updateCarouselFrame() {
    const count = this.state.memories.length;
    if (!count) return;
    this.state.galleryIndex = wrapIndex(this.state.galleryIndex, count);
    const center = this._updateCarouselCenter(count);
    const radius = this.ringSettings.radius;
    const depth = this.ringSettings.depth;
    const angleStep = this.ringSettings.angle;

    this.state.memories.forEach((mem, index) => {
      const mesh = mem.mesh;
      if (!mesh) return;
      const offset = getWrappedOffset(index, center, count);
      const visibleOffset = getWrappedOffset(index, this.state.galleryIndex, count);
      const visible = Math.abs(visibleOffset) <= 2.01;
      const wasVisible = mesh.visible;
      mesh.visible = visible;
      if (!visible) return;

      const absOffset = Math.abs(offset);
      const angle = offset * angleStep;
      const targetX = Math.sin(angle) * radius;
      const targetZ = CAROUSEL.zBase - depth * Math.pow(absOffset, 2.2);
      const targetY = CAROUSEL.yOffset;
      const targetScaleVal = Math.exp(-0.28 * absOffset);
      const targetRotY = -angle * CAROUSEL.faceInStrength;

      const cache = this._ensureCarouselCache(mem);
      cache.targetPos.set(targetX, targetY, targetZ);
      cache.targetScale.set(targetScaleVal, targetScaleVal, targetScaleVal);
      this.carouselEuler.set(0, targetRotY, 0);
      cache.targetQuat.setFromEuler(this.carouselEuler);

      const uniforms = mesh.material?.uniforms;
      if (uniforms) {
        const opacity = clamp(this.hallOpacityBase * Math.exp(-absOffset * CAROUSEL.opacityFalloff), 0.12, 0.9);
        const dim = clamp(1.0 - CAROUSEL.dimFalloff * absOffset, 0.4, 1.0);
        if (uniforms.uOpacity) uniforms.uOpacity.value = opacity;
        if (uniforms.uDim) uniforms.uDim.value = dim;
        if (uniforms.uEdgeFade) uniforms.uEdgeFade.value = CAROUSEL.edgeFade;
        if (uniforms.uEdgeWidth) uniforms.uEdgeWidth.value = CAROUSEL.edgeWidth;
      }
      mesh.renderOrder = 10 - Math.round(absOffset * 2);

      if (!wasVisible) {
        mesh.position.copy(cache.targetPos);
        mesh.scale.copy(cache.targetScale);
        mesh.quaternion.copy(cache.targetQuat);
        return;
      }

      mesh.position.lerp(cache.targetPos, CAROUSEL.posLerp);
      mesh.scale.lerp(cache.targetScale, CAROUSEL.scaleLerp);
      mesh.quaternion.slerp(cache.targetQuat, CAROUSEL.rotLerp);
    });
  }

  _updateGalleryTarget({ snap = false } = {}) {
    const count = this.state.memories.length;
    if (count > 0) {
      this.state.galleryIndex = wrapIndex(this.state.galleryIndex, count);
    } else {
      this.state.galleryIndex = 0;
    }
    this.desiredTarget.set(0, 0, 0);
    this._syncCarouselToIndex({ snap });
    this._updateGalleryCounter();
  }

  _animate = () => {
    requestAnimationFrame(this._animate);

    const time = this.clock.getElapsedTime();
    if (this._hudDirty && this.state?.mode === "home") {
      this._syncHomeVoiceUI();
      this._hudDirty = false;
    }
    this.editorMaterial.uniforms.uTime.value = time;

    // memories animation
    this.state.memories.forEach((mem, i) => {
      mem.mesh.material.uniforms.uTime.value = time + i * 10;
    });

    if (this.state.mode === "home") {
      this.editorParticles.rotation.y = Math.sin(time * 0.1) * 0.03 + this.mouseX * 0.05;
      this.editorParticles.rotation.x = Math.cos(time * 0.08) * 0.03 + this.mouseY * 0.05;
    }
    if (this._isInHall()) {
      this._updateCarouselFrame();
    }

    // smooth target for controls based on desired target
    if (this.controls) {
      this.controls.target.lerp(this.desiredTarget, CONFIG.TRANSITION_SPEED);
      const offset = this.camera.position.clone().sub(this.controls.target);
      if (offset.lengthSq() < 1e-6) offset.set(0, 0, this.settings.viewDistance);
      offset.setLength(this.settings.viewDistance);
      this.camera.position.copy(this.controls.target).add(offset);
      this.controls.update();
    }

    this.renderer.render(this.scene, this.camera);
  };
}

