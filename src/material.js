import * as THREE from "three";
import { vertexShader, fragmentShader } from "./shaders.js";

export function createEditorMaterial(settings) {
  const pixelRatio = window.devicePixelRatio || 1;

  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSize: { value: settings.particleSize * pixelRatio },
      uTexture: { value: null },
      uHasTexture: { value: 0.0 },
      uImageAspect: { value: 1.0 },
      uPixelRatio: { value: pixelRatio },

      uWaveAmplitude: { value: settings.waveAmplitude },
      uWaveSpeed: { value: settings.waveSpeed },
      uEdgeRoughness: { value: settings.edgeRoughness },
      uErosionSpeed: { value: settings.erosionSpeed },
      uDispersion: { value: settings.dispersion },
      uGridOpacity: { value: settings.gridOpacity },
      uStableRadius: { value: settings.stableRadius },

      uBrightness: { value: settings.brightness },
      uContrast: { value: settings.contrast },

      uStippleStrength: { value: 0.7 },
      uHaloStrength: { value: 0.2 },
      uGrainStrength: { value: 0.25 },
      uLayeredStrength: { value: 0.0 },
      uLayerDepth: { value: 0.0 },
      uLayerNoiseDepth: { value: 0.0 },
      uSeed: { value: 0.0 },
      uOpacity: { value: 1.0 },
      uEdgeFade: { value: 0.75 },
      uEdgeWidth: { value: 0.38 },
      uDim: { value: 1.0 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    premultipliedAlpha: true,
    blending: THREE.NormalBlending,
  });
}

/**
 * Clone a ShaderMaterial with uniforms deep-cloned (important!).
 * Then copy current settings -> uniforms.
 */
export function cloneMaterialFromSettings(baseMaterial, settings) {
  const cloned = new THREE.ShaderMaterial({
    vertexShader: baseMaterial.vertexShader,
    fragmentShader: baseMaterial.fragmentShader,
    transparent: baseMaterial.transparent,
    depthWrite: baseMaterial.depthWrite,
    depthTest: baseMaterial.depthTest,
    premultipliedAlpha: baseMaterial.premultipliedAlpha,
    blending: baseMaterial.blending,
    uniforms: THREE.UniformsUtils.clone(baseMaterial.uniforms),
  });

  // Each memory needs its own time uniform, otherwise they animate in sync if shared
  cloned.uniforms.uTime.value = 0;

  // Apply settings
  const pixelRatio = cloned.uniforms.uPixelRatio?.value ?? (window.devicePixelRatio || 1);

  if (cloned.uniforms.uBrightness) cloned.uniforms.uBrightness.value = settings.brightness;
  if (cloned.uniforms.uContrast) cloned.uniforms.uContrast.value = settings.contrast;
  if (cloned.uniforms.uGridOpacity) cloned.uniforms.uGridOpacity.value = settings.gridOpacity;
  if (cloned.uniforms.uWaveAmplitude) cloned.uniforms.uWaveAmplitude.value = settings.waveAmplitude;
  if (cloned.uniforms.uWaveSpeed) cloned.uniforms.uWaveSpeed.value = settings.waveSpeed;
  if (cloned.uniforms.uEdgeRoughness) cloned.uniforms.uEdgeRoughness.value = settings.edgeRoughness;
  if (cloned.uniforms.uErosionSpeed) cloned.uniforms.uErosionSpeed.value = settings.erosionSpeed;
  if (cloned.uniforms.uDispersion) cloned.uniforms.uDispersion.value = settings.dispersion;
  if (cloned.uniforms.uStableRadius) cloned.uniforms.uStableRadius.value = settings.stableRadius;
  if (cloned.uniforms.uSize) cloned.uniforms.uSize.value = settings.particleSize * pixelRatio;

  return cloned;
}
