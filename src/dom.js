export function getDom() {
  const byId = (id) => document.getElementById(id);

  return {
    container: byId("canvas-container"),
    loading: byId("loading"),

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
      galleryGap: { input: byId("inp-galleryGap"), label: byId("val-galleryGap") },
    },
  };
}