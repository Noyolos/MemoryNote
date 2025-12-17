export const vertexShader = `
uniform float uTime; 
uniform float uSize; 
uniform float uWaveSpeed;
uniform float uWaveAmplitude; 
uniform float uDispersion;
uniform float uEdgeRoughness; 
uniform float uErosionSpeed; 
uniform float uStableRadius; 

attribute float aRandom;
varying vec2 vUv; 
varying float vVisible; 
varying float vDist;

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
uniform sampler2D uTexture; 
uniform float uHasTexture; 
uniform float uPixelRatio; 
uniform float uGridOpacity;
uniform float uBrightness;
uniform float uContrast;

varying vec2 vUv; 
varying float vVisible; 
varying float vDist;

void main() {
    if (vVisible < 0.5) discard;

    vec4 texColor = texture2D(uTexture, vUv);
    vec4 defaultColor = vec4(0.1, 0.15, 0.2, 1.0);
    if (mod(gl_FragCoord.x, 2.0) < 1.0 && mod(gl_FragCoord.y, 2.0) < 1.0) defaultColor += 0.05;
    vec4 finalColor = mix(defaultColor, texColor, uHasTexture);

    float gridSpacing = 3.0 * uPixelRatio; 
    float gridThickness = 1.0 * uPixelRatio;
    bool onGridLineX = mod(gl_FragCoord.x, gridSpacing) < gridThickness;
    bool onGridLineY = mod(gl_FragCoord.y, gridSpacing) < gridThickness;
    if (onGridLineX || onGridLineY) {
        finalColor.rgb *= (1.0 - uGridOpacity); 
    }

    vec3 finalRgb = finalColor.rgb;
    if (uContrast != 1.0) {
        finalRgb = (finalRgb - 0.5) * uContrast + 0.5;
    }
    finalRgb *= uBrightness;

    float alpha = 1.0;
    if(vDist > 0.42) {
        alpha = 1.0 - smoothstep(0.42, 0.5, vDist);
        alpha = floor(alpha * 4.0) / 4.0; 
    }

    gl_FragColor = vec4(finalRgb, finalColor.a * alpha);
}
`;