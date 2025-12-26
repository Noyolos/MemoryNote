export function getDom() {
  const byId = (id) => document.getElementById(id);

  return {
    container: byId("canvas-container"),
    loading: byId("loading"),
    nav: document.querySelector(".af-nav"),
    appShell: byId("af-app-shell"),

    renderToggle: byId("af-render-toggle"),
    renderKolam: byId("af-render-kolam"),
    renderHalo: byId("af-render-halo"),
    renderLayered: byId("af-render-layered"),
    hallResetBtn: byId("af-hall-reset"),

    toggleBtn: byId("settings-toggle"),
    effectPanel: byId("effect-panel"),

    fileInput: byId("fileInput"),
    enterHallBtn: byId("enter-hall-btn"),
    backBtn: byId("back-btn"),
    prevZone: byId("prev-zone"),
    nextZone: byId("next-zone"),

    controlPanel: byId("control-panel"),
    galleryUI: byId("gallery-ui"),
    galleryCounter: byId("gallery-counter"),
    memoryCount: byId("memory-count"),

    agentPill: byId("af-agent-pill"),
    homeVoice: byId("af-home-voice"),
    homePrompt: byId("af-home-prompt"),
    micBtn: byId("af-mic-btn"),
    voiceTimer: byId("af-voice-timer"),
    saveMemoryBtn: byId("af-save-memory"),
    closeVoiceBtn: byId("af-close-voice"),
    liveReply: byId("af-live-reply"),

    navInfo: document.querySelector('[data-action="open-info"]'),
    infoPanel: byId("af-info-panel"),
    infoClose: byId("af-info-close"),
    infoMemNo: byId("af-info-memno"),
    infoEmpty: byId("af-info-empty"),
    infoDiary: byId("af-info-diary"),
    diaryTitle: byId("af-diary-title"),
    diaryDate: byId("af-diary-date"),
    diaryMood: byId("af-diary-mood"),
    diaryTags: byId("af-diary-tags"),
    diarySummary: byId("af-diary-summary"),
    diaryTranscript: byId("af-diary-transcript"),

    landingRoot: byId("af-landing"),
    landingUploadBtn: byId("af-landing-upload"),
    blocker: byId("af-save-blocker"),
    blockerText: byId("af-blocker-text"),

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
