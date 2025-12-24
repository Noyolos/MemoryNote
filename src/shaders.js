export const vertexShader = `
precision highp float;
uniform highp float uTime; 
uniform highp float uSize; 
uniform highp float uWaveSpeed;
uniform highp float uWaveAmplitude; 
uniform highp float uDispersion;
uniform highp float uEdgeRoughness; 
uniform highp float uErosionSpeed; 
uniform highp float uStableRadius; 
uniform highp float uLayeredStrength;
uniform highp float uLayerDepth;
uniform highp float uLayerNoiseDepth;
uniform highp float uSeed;

attribute float aRandom;
varying vec2 vUv; 
varying float vVisible; 
varying float vDist;
varying float vRandom;

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy)); vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz; x12.xy -= i1;
    i = mod289(i); vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m; m = m*m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0; vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5); vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g; g.x = a0.x * x0.x + h.x * x0.y; g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
}

float fbm(vec2 st) {
    float value = 0.0; float amplitude = 0.5;
    for (int i = 0; i < 3; i++) {
        value += amplitude * snoise(st); st *= 2.0; amplitude *= 0.5;
    }
    return value;
}

void main() {
    vUv = uv; 
    vRandom = aRandom;
    vec3 pos = position; 
    vec2 centeredUv = abs(uv - 0.5);
    float shapeDist = length(centeredUv); 

    vec2 noiseCoord = uv * 3.0 + vec2(uTime * uErosionSpeed, uTime * uErosionSpeed * 0.5);
    float noiseVal = fbm(noiseCoord);

    float distortionWeight = smoothstep(uStableRadius - 0.1, uStableRadius + 0.1, shapeDist);
    float distortedDist = shapeDist - (noiseVal * 0.2 * uEdgeRoughness * distortionWeight);
    vDist = distortedDist; 

    float waveVal = sin(pos.x * 3.0 + uTime * uWaveSpeed) * cos(pos.y * 3.0 + uTime * uWaveSpeed);
    float waveNoise = snoise(uv * 4.0 + uTime * 0.2) * 0.2;
    pos.z += (waveVal + waveNoise) * uWaveAmplitude;

    float layerLuma = 0.5 + 0.5 * fbm(uv * 2.5 + vec2(uSeed * 7.1, uSeed * 3.3));
    float layerNoise = snoise(uv * 6.0 + vec2(aRandom * 2.0, uSeed * 5.0));
    float layerDepth = (layerLuma - 0.5) * uLayerDepth + layerNoise * uLayerNoiseDepth;
    pos.z += layerDepth * uLayeredStrength;

    float dispersionFactor = smoothstep(uStableRadius, uStableRadius + 0.15, distortedDist);
    if (distortedDist > uStableRadius) {
        float driftX = snoise(vec2(uv.x * 8.0, uTime * 0.5 + aRandom));
        float driftY = snoise(vec2(uv.y * 8.0, uTime * 0.5 + aRandom + 10.0));
        float strength = 1.0 * uDispersion * dispersionFactor;
        pos.x += driftX * strength;
        pos.y += driftY * strength;
        pos.z += (aRandom - 0.5) * 1.5 * dispersionFactor;
    }

    float sizeFade = 1.0;
    if(distortedDist > uStableRadius) {
        sizeFade = 1.0 - dispersionFactor * 0.8;
        sizeFade *= (0.5 + 0.5 * sin(uTime * 5.0 + aRandom * 10.0));
    }

    gl_PointSize = uSize * sizeFade;
    gl_PointSize *= (1.0 / - (modelViewMatrix * vec4(pos, 1.0)).z);

    float raggedEdge = 0.49 + (aRandom * 0.05);
    vVisible = (distortedDist > raggedEdge) ? 0.0 : 1.0;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

export const fragmentShader = `
precision mediump float;
uniform sampler2D uTexture; 
uniform highp float uHasTexture; 
uniform highp float uPixelRatio; 
uniform highp float uGridOpacity;
uniform highp float uBrightness;
uniform highp float uContrast;
uniform highp float uTime;
uniform highp float uStippleStrength;
uniform highp float uHaloStrength;
uniform highp float uGrainStrength;
uniform highp float uLayeredStrength;
uniform highp float uSeed;
uniform highp float uOpacity;
uniform highp float uEdgeFade;
uniform highp float uEdgeWidth;
uniform highp float uDim;

varying vec2 vUv; 
varying float vVisible; 
varying float vDist;
varying float vRandom;

float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

void main() {
    if (vVisible < 0.5) discard;

    vec4 texColor = texture2D(uTexture, vUv);
    vec4 defaultColor = vec4(0.1, 0.15, 0.2, 1.0);
    if (mod(gl_FragCoord.x, 2.0) < 1.0 && mod(gl_FragCoord.y, 2.0) < 1.0) defaultColor += 0.05;
    vec4 finalColor = mix(defaultColor, texColor, uHasTexture);

    float gridSpacing = 3.0 * uPixelRatio;
    float gridThickness = 1.0 * uPixelRatio;
    float modX = mod(gl_FragCoord.x, gridSpacing);
    float modY = mod(gl_FragCoord.y, gridSpacing);
    float onGridLineX = 1.0 - step(gridThickness, modX);
    float onGridLineY = 1.0 - step(gridThickness, modY);
    float gridMask = min(1.0, onGridLineX + onGridLineY);
    finalColor.rgb *= mix(1.0, 1.0 - uGridOpacity, gridMask);

    vec3 finalRgb = finalColor.rgb;
    if (uContrast != 1.0) {
        finalRgb = (finalRgb - 0.5) * uContrast + 0.5;
    }
    finalRgb *= uBrightness;

    float stippleNoise = hash12(vUv * 180.0 + vec2(vRandom + uSeed, uSeed - vRandom));
    float grainNoise = hash12(vUv * 420.0 + vec2(uSeed, vRandom * 2.1));
    float stippleMask = mix(1.0, smoothstep(0.25, 0.85, stippleNoise), uStippleStrength);
    float grainMask = mix(1.0, 0.85 + 0.3 * grainNoise, uGrainStrength);

    finalRgb *= grainMask;
    finalRgb *= uDim;

    float edgeStart = clamp(0.5 - uEdgeWidth, 0.0, 0.5);
    float edgeFadeMask = smoothstep(edgeStart, 0.5, vDist);
    float edgeFade = edgeFadeMask * uEdgeFade;
    float alpha = uOpacity * (1.0 - edgeFade) * stippleMask;
    alpha *= finalColor.a;

    float bandNoise = hash12(vUv * 90.0 + vec2(uSeed + vRandom, uSeed - vRandom));
    float bandSteps = 3.0;
    float band = floor(bandNoise * bandSteps) / (bandSteps - 1.0);
    float bandMask = smoothstep(0.2, 0.8, band);
    float bandBlend = mix(1.0, 0.9 + 0.1 * bandMask, uLayeredStrength);
    finalRgb *= bandBlend;
    alpha *= bandBlend;

    float coreMask = 1.0 - smoothstep(0.3, 0.44, vDist);
    float coreDepth = mix(1.0, 0.82 + 0.18 * grainNoise, coreMask * uLayeredStrength);
    finalRgb *= coreDepth;

    vec2 blurStep = vec2(0.0025, 0.0025);
    vec2 edgeSeed = vec2(vRandom + uSeed, uSeed - vRandom);
    float edgeNoise0 = hash12(vUv * 160.0 + edgeSeed);
    float edgeNoise1 = hash12((vUv + vec2(blurStep.x, 0.0)) * 160.0 + edgeSeed);
    float edgeNoise2 = hash12((vUv - vec2(blurStep.x, 0.0)) * 160.0 + edgeSeed);
    float edgeNoise3 = hash12((vUv + vec2(0.0, blurStep.y)) * 160.0 + edgeSeed);
    float edgeNoise4 = hash12((vUv - vec2(0.0, blurStep.y)) * 160.0 + edgeSeed);
    float edgeNoiseBlur = (edgeNoise1 + edgeNoise2 + edgeNoise3 + edgeNoise4) * 0.25;
    edgeNoiseBlur = mix(edgeNoise0, edgeNoiseBlur, 0.6);
    float edgeBandInner = smoothstep(0.34, 0.43, vDist);
    float edgeBandOuter = 1.0 - smoothstep(0.46, 0.56, vDist);
    float edgeBand = edgeBandInner * edgeBandOuter;
    float edgeBreak = smoothstep(0.25, 0.8, edgeNoiseBlur);
    float edgeBandMask = edgeBand * edgeBreak;
    float edgeBlend = edgeBandMask * uLayeredStrength;
    finalRgb *= mix(1.0, 0.78 + 0.22 * edgeNoiseBlur, edgeBlend);
    alpha *= mix(1.0, 0.85, edgeBlend);

    float haloInner = smoothstep(0.32, 0.42, vDist);
    float haloOuter = 1.0 - smoothstep(0.44, 0.55, vDist);
    float halo = haloInner * haloOuter;
    float drift = uTime * 0.05;
    vec2 haloDrift = vec2(cos(drift), sin(drift)) * 0.002;
    float dustNoise = hash12((vUv + haloDrift) * 240.0 + vec2(uSeed, vRandom));
    float dustMask = mix(1.0, 0.6 + 0.4 * dustNoise, uLayeredStrength);
    float haloMask = halo * dustMask;
    vec3 haloTint = vec3(0.75, 0.85, 1.0);
    vec3 haloBoost = min(finalRgb + haloTint * 0.35, vec3(1.0));
    finalRgb = mix(finalRgb, haloBoost, haloMask * uHaloStrength);
    alpha = min(1.0, alpha + haloMask * uHaloStrength * 0.35);

    finalRgb *= alpha;
    gl_FragColor = vec4(finalRgb, alpha);
}
`;
