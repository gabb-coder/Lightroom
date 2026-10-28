import { LUMA_WEIGHTS } from '../engine/color';
import { CONTRAST_GAMMA } from '../engine/contrast';

/**
 * GLSL twins of the CPU reference stages in src/engine/. Each function here
 * must match its TypeScript counterpart within ±2/255 (see e2e/gpu.spec.ts).
 * Shared constants are injected from the engine so they cannot drift.
 */

const glslFloat = (v: number): string => (Number.isInteger(v) ? v.toFixed(1) : String(v));

/** engine/color.ts: srgbToLinear, linearToSrgb */
const COLOR_GLSL = /* glsl */ `
vec3 srgbToLinear(vec3 v) {
  return mix(pow((v + 0.055) / 1.055, vec3(2.4)), v / 12.92, lessThanEqual(v, vec3(0.04045)));
}
vec3 linearToSrgb(vec3 v) {
  return mix(1.055 * pow(v, vec3(1.0 / 2.4)) - 0.055, v * 12.92, lessThanEqual(v, vec3(0.0031308)));
}
const vec3 LUMA = vec3(${LUMA_WEIGHTS.map(glslFloat).join(', ')});
`;

/** engine/exposure.ts: applyExposure */
const EXPOSURE_GLSL = /* glsl */ `
vec3 applyExposure(vec3 c, float gain) {
  return c * gain;
}
`;

/** engine/contrast.ts: contrastCurve, applyContrast */
const CONTRAST_GLSL = /* glsl */ `
const float CONTRAST_GAMMA = ${glslFloat(CONTRAST_GAMMA)};
float contrastCurve(float q, float a) {
  if (q >= 1.0) return 1.0 + (1.0 - a) * (q - 1.0);
  return q + a * q * (1.0 - q) * (2.0 * q - 1.0);
}
vec3 applyContrast(vec3 c, float a) {
  if (a == 0.0) return c;
  vec3 q = pow(max(c, 0.0), vec3(1.0 / CONTRAST_GAMMA));
  vec3 f = vec3(contrastCurve(q.r, a), contrastCurve(q.g, a), contrastCurve(q.b, a));
  return pow(max(f, 0.0), vec3(CONTRAST_GAMMA));
}
`;

/** engine/saturation.ts: applySaturation */
const SATURATION_GLSL = /* glsl */ `
vec3 applySaturation(vec3 c, float scale) {
  if (scale == 1.0) return c;
  float y = dot(c, LUMA);
  return max(vec3(0.0), y + (c - y) * scale);
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
uniform float u_exposureGain;
uniform float u_contrastAmount;
uniform float u_saturationScale;

out vec4 outColor;
${COLOR_GLSL}
${EXPOSURE_GLSL}
${CONTRAST_GLSL}
${SATURATION_GLSL}
void main() {
  ivec2 size = textureSize(u_source, 0);
  ivec2 p = ivec2(gl_FragCoord.xy);
  if (u_flipY) p.y = size.y - 1 - p.y;
  vec4 src = texelFetch(u_source, p, 0);

  vec3 c = srgbToLinear(src.rgb);
  c = applyExposure(c, u_exposureGain);
  c = applyContrast(c, u_contrastAmount);
  c = applySaturation(c, u_saturationScale);
  outColor = vec4(linearToSrgb(clamp(c, 0.0, 1.0)), src.a);
}
`;
