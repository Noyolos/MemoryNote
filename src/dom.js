export function getDom() {
  const byId = (id) => document.getElementById(id);

  return {
    container: byId("canvas-container"),
    loading: byId("loading"),
    nav: document.querySelector(".af-nav"),

    renderToggle: byId("af-render-toggle"),
    renderKolam: byId("af-render-kolam"),
    renderHalo: byId("af-render-halo"),
    renderLayered: byId("af-render-layered"),
    hallResetBtn: byId("af-hall-reset"),

    toggleBtn: byId("settings-toggle"),
    effectPanel: byId("effect-panel"),

    fileInput: byId("fileInput"),
    archiveBtn: byId("archiveBtn"),
    enterHallBtn: byId("enter-hall-btn"),
    backBtn: byId("back-btn"),
    prevZone: byId("prev-zone"),
    nextZone: byId("next-zone"),

    controlPanel: byId("control-panel"),
    galleryUI: byId("gallery-ui"),
    galleryCounter: byId("gallery-counter"),
    memoryCount: byId("memory-count"),

    micButton: byId("af-mic-button"),
    voiceOverlay: byId("af-voice-overlay"),
    voicePillText: byId("af-voice-pill-text"),
    voiceBubbleText: byId("af-voice-bubble-text"),
    voiceSubText: byId("af-voice-sub"),

    // sliders
    sliders: {
      brightness: { input: byId("inp-brightness"), label: byId("val-brightness") },
      contrast: { input: byId("inp-contrast"), label: byId("val-contrast") },
      particleSize: { input: byId("inp-particleSize"), label: byId("val-particleSize") },
      gridOpacity: { input: byId("inp-gridOpacity"), label: byId("val-gridOpacity") },
      erosionSpeed: { input: byId("inp-erosionSpeed"), label: byId("val-erosionSpeed") },
      waveAmplitude: { input: byId("inp-waveAmplitude"), label: byId("val-waveAmplitude") },
      waveSpeed: { input: byId("inp-waveSpeed"), label: byId("val-waveSpeed") },
      dispersion: { input: byId("inp-dispersion"), label: byId("val-dispersion") },
      edgeRoughness: { input: byId("inp-edgeRoughness"), label: byId("val-edgeRoughness") },
      stableRadius: { input: byId("inp-stableRadius"), label: byId("val-stableRadius") },
      ringRadius: { input: byId("af-ring-radius"), label: byId("val-ring-radius") },
      ringDepth: { input: byId("af-ring-depth"), label: byId("val-ring-depth") },
      ringAngle: { input: byId("af-ring-angle"), label: byId("val-ring-angle") },
      hallFov: { input: byId("af-hall-fov"), label: byId("val-hall-fov") },
      homeZoom: { input: byId("af-home-zoom"), label: byId("val-home-zoom") },
      homeYOffset: { input: byId("af-home-y"), label: byId("val-home-y") },
    },
  };
}
