import { LUMA_WEIGHTS } from '../engine/color';
import { TONE_GAMMA } from '../engine/tone';

/**
 * GLSL twins of the CPU reference stages in src/engine/. Each function here
 * must match its TypeScript counterpart within ±2/255 (see e2e/gpu.spec.ts).
 * Shared constants are injected from the engine so they cannot drift; the
 * per-slider strengths arrive pre-scaled through PipelineParams uniforms.
 */

const glslFloat = (v: number): string => (Number.isInteger(v) ? v.toFixed(1) : String(v));

/** engine/color.ts */
const COLOR_GLSL = /* glsl */ `
vec3 srgbToLinear(vec3 v) {
  return mix(pow((v + 0.055) / 1.055, vec3(2.4)), v / 12.92, lessThanEqual(v, vec3(0.04045)));
}
vec3 linearToSrgb(vec3 v) {
  return mix(1.055 * pow(v, vec3(1.0 / 2.4)) - 0.055, v * 12.92, lessThanEqual(v, vec3(0.0031308)));
}
const vec3 LUMA = vec3(${LUMA_WEIGHTS.map(glslFloat).join(', ')});
float luminance(vec3 c) { return dot(c, LUMA); }
`;

/** engine/whiteBalance.ts and engine/exposure.ts: per-channel gains */
const GAIN_GLSL = /* glsl */ `
vec3 applyWhiteBalance(vec3 c, vec3 gains) { return c * gains; }
vec3 applyExposure(vec3 c, float gain) { return c * gain; }
`;

/** engine/contrast.ts and engine/tone.ts */
const TONE_GLSL = /* glsl */ `
const float TONE_GAMMA = ${glslFloat(TONE_GAMMA)};
struct Tone { float contrast; float highlights; float shadows; float whites; float blacks; };

float contrastCurve(float q, float a) {
  if (a == 0.0) return q;
  if (q >= 1.0) return 1.0 + (1.0 - a) * (q - 1.0);
  return q + a * q * (1.0 - q) * (2.0 * q - 1.0);
}
float highlightsCurve(float q, float amount) {
  if (amount == 0.0 || q >= 1.0) return q;
  return q + amount * 6.75 * q * q * (1.0 - q);
}
float shadowsCurve(float q, float amount) {
  if (amount == 0.0 || q >= 1.0) return q;
  return q + amount * 6.75 * q * (1.0 - q) * (1.0 - q);
}
float whitesCurve(float q, float amount) {
  if (amount == 0.0) return q;
  if (q >= 1.0) return 1.0 + amount + (1.0 + 3.0 * amount) * (q - 1.0);
  return q + amount * q * q * q;
}
float blacksCurve(float q, float amount) {
  if (amount == 0.0 || q >= 1.0) return q;
  float r = 1.0 - q;
  return q + amount * r * r * r;
}
float toneCurve(float q, Tone t) {
  float v = contrastCurve(q, t.contrast);
  v = highlightsCurve(v, t.highlights);
  v = shadowsCurve(v, t.shadows);
  v = whitesCurve(v, t.whites);
  return blacksCurve(v, t.blacks);
}
float toneChannel(float x, Tone t) {
  float q = pow(max(x, 0.0), 1.0 / TONE_GAMMA);
  return pow(max(toneCurve(q, t), 0.0), TONE_GAMMA);
}
vec3 applyTone(vec3 c, Tone t) {
  if (t.contrast == 0.0 && t.highlights == 0.0 && t.shadows == 0.0 && t.whites == 0.0 && t.blacks == 0.0) return c;
  return vec3(toneChannel(c.r, t), toneChannel(c.g, t), toneChannel(c.b, t));
}
`;

/** engine/saturation.ts and engine/treatment.ts */
const COLOR_ADJUST_GLSL = /* glsl */ `
vec3 applySaturation(vec3 c, float scale) {
  if (scale == 1.0) return c;
  float y = luminance(c);
  return max(vec3(0.0), y + (c - y) * scale);
}
vec3 applyVibrance(vec3 c, float amount) {
  if (amount == 0.0) return c;
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float sat = mx > 0.0 ? (mx - mn) / mx : 0.0;
  return applySaturation(c, max(0.0, 1.0 + amount * (1.0 - sat)));
}
vec3 applyTreatment(vec3 c, bool bw) {
  return bw ? vec3(luminance(c)) : c;
}
`;

export const VERTEX_SHADER = /* glsl */ `#version 300 es
// Fullscreen triangle from gl_VertexID; no vertex buffers needed.
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

/**
 * Develop pipeline (engine/pipeline.ts processPixel). The output is exactly
 * the size of the source texture, so pixels map 1:1 via texelFetch.
 */
export const DEVELOP_FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D u_source;
uniform bool u_flipY;
uniform vec3 u_whiteBalance;
uniform float u_exposureGain;
uniform float u_contrast;
uniform float u_highlights;
uniform float u_shadows;
uniform float u_whites;
uniform float u_blacks;
uniform float u_vibrance;
uniform float u_saturationScale;
uniform bool u_bw;

out vec4 outColor;
${COLOR_GLSL}
${GAIN_GLSL}
${TONE_GLSL}
${COLOR_ADJUST_GLSL}
void main() {
  ivec2 size = textureSize(u_source, 0);
  ivec2 p = ivec2(gl_FragCoord.xy);
  if (u_flipY) p.y = size.y - 1 - p.y;
  vec4 src = texelFetch(u_source, p, 0);

  vec3 c = srgbToLinear(src.rgb);
  c = applyWhiteBalance(c, u_whiteBalance);
  c = applyExposure(c, u_exposureGain);
  c = applyTone(c, Tone(u_contrast, u_highlights, u_shadows, u_whites, u_blacks));
  c = applyVibrance(c, u_vibrance);
  c = applySaturation(c, u_saturationScale);
  c = applyTreatment(c, u_bw);
  outColor = vec4(linearToSrgb(clamp(c, 0.0, 1.0)), src.a);
}
`;
