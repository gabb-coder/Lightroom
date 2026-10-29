import { LUMA_WEIGHTS } from '../engine/color';
import { CURVE_LUT_SIZE } from '../engine/curve';
import { GRAIN_SEED } from '../engine/grain';
import { HSL_CENTER_LIST, HSL_MAX_HUE_SHIFT, HSL_MAX_LUM } from '../engine/hsl';
import { SHARPEN_WEIGHT_COUNT } from '../engine/sharpen';
import { TONE_GAMMA } from '../engine/tone';
import { VIGNETTE_START } from '../engine/vignette';

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

/** engine/curve.ts: applyCurve (two-entry blend of the combined table, like sampleLut) */
const CURVE_GLSL = /* glsl */ `
const int CURVE_LUT_SIZE = ${CURVE_LUT_SIZE};
float sampleCurve(int channel, float v) {
  float t = clamp(v, 0.0, 1.0) * float(CURVE_LUT_SIZE - 1);
  float i0f = floor(t);
  int i0 = int(i0f);
  int i1 = min(i0 + 1, CURVE_LUT_SIZE - 1);
  float f = t - i0f;
  vec4 a = texelFetch(u_curve, ivec2(i0, 0), 0);
  vec4 b = texelFetch(u_curve, ivec2(i1, 0), 0);
  return a[channel] * (1.0 - f) + b[channel] * f;
}
vec3 applyCurve(vec3 c) {
  if (!u_curveOn) return c;
  vec3 e = linearToSrgb(clamp(c, 0.0, 1.0));
  vec3 o = vec3(sampleCurve(0, e.r), sampleCurve(1, e.g), sampleCurve(2, e.b));
  return srgbToLinear(clamp(o, 0.0, 1.0));
}
`;

/** engine/hsl.ts: hueWeights, rgbToHsv, hsvToRgb, applyHsl */
const HSL_GLSL = /* glsl */ `
const float HSL_CENTERS[8] = float[8](${HSL_CENTER_LIST.map(glslFloat).join(', ')});
vec3 rgbToHsv(vec3 c) {
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float d = mx - mn;
  float h = 0.0;
  if (d > 0.0) {
    if (mx == c.r) h = 60.0 * mod((c.g - c.b) / d, 6.0);
    else if (mx == c.g) h = 60.0 * ((c.b - c.r) / d + 2.0);
    else h = 60.0 * ((c.r - c.g) / d + 4.0);
  }
  if (h < 0.0) h += 360.0;
  return vec3(h, mx > 0.0 ? d / mx : 0.0, mx);
}
vec3 hsvToRgb(float h, float s, float v) {
  float hh = mod(mod(h, 360.0) + 360.0, 360.0) / 60.0;
  float c = v * s;
  float x = c * (1.0 - abs(mod(hh, 2.0) - 1.0));
  float m = v - c;
  int sector = min(5, int(floor(hh)));
  vec3 rgb;
  if (sector == 0) rgb = vec3(c, x, 0.0);
  else if (sector == 1) rgb = vec3(x, c, 0.0);
  else if (sector == 2) rgb = vec3(0.0, c, x);
  else if (sector == 3) rgb = vec3(0.0, x, c);
  else if (sector == 4) rgb = vec3(x, 0.0, c);
  else rgb = vec3(c, 0.0, x);
  return rgb + m;
}
vec3 applyHsl(vec3 c) {
  if (!u_hslOn) return c;
  vec3 hsv = rgbToHsv(linearToSrgb(clamp(c, 0.0, 1.0)));
  float h = hsv.x;
  float dh = 0.0, ds = 0.0, dl = 0.0;
  for (int k = 0; k < 8; k++) {
    float c0 = HSL_CENTERS[k];
    float c1 = k == 7 ? 360.0 : HSL_CENTERS[k + 1];
    if (h >= c0 && h < c1) {
      int k1 = (k + 1) % 8;
      float a = 0.5 + 0.5 * cos(3.141592653589793 * (h - c0) / (c1 - c0));
      dh = a * u_hslHue[k] + (1.0 - a) * u_hslHue[k1];
      ds = a * u_hslSat[k] + (1.0 - a) * u_hslSat[k1];
      dl = a * u_hslLum[k] + (1.0 - a) * u_hslLum[k1];
      break;
    }
  }
  float h2 = h + dh * ${glslFloat(HSL_MAX_HUE_SHIFT)} * hsv.y;
  float s2 = clamp(hsv.y * (1.0 + ds), 0.0, 1.0);
  float v2 = clamp(hsv.z * (1.0 + dl * ${glslFloat(HSL_MAX_LUM)} * hsv.y), 0.0, 1.0);
  return srgbToLinear(hsvToRgb(h2, s2, v2));
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

/** engine/sharpen.ts: kernel weights for offsets 0..SHARPEN_MAX_TAPS and 16-bit packing */
const SHARPEN_GLSL = /* glsl */ `
uniform int u_taps;
uniform float u_weights[${SHARPEN_WEIGHT_COUNT}];
vec4 pack16(float v) {
  float q = floor(clamp(v, 0.0, 1.0) * 65535.0 + 0.5);
  float hi = floor(q / 256.0);
  return vec4(hi / 255.0, (q - hi * 256.0) / 255.0, 0.0, 1.0);
}
float unpack16(vec4 t) {
  return (floor(t.r * 255.0 + 0.5) * 256.0 + floor(t.g * 255.0 + 0.5)) / 65535.0;
}
`;

/** engine/grain.ts: hash32, latticeValue, valueNoise, grainOffset */
const GRAIN_GLSL = /* glsl */ `
uint hash32(uint x) {
  x ^= x >> 16u;
  x *= 0x7feb352du;
  x ^= x >> 15u;
  x *= 0x846ca68bu;
  x ^= x >> 16u;
  return x;
}
float latticeValue(int ix, int iy) {
  uint h = hash32(uint(ix) + hash32(uint(iy) + ${GRAIN_SEED >>> 0}u));
  return float(h >> 8u) / 16777215.0 * 2.0 - 1.0;
}
float smoothT(float t) { return t * t * (3.0 - 2.0 * t); }
float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = vec2(smoothT(p.x - i.x), smoothT(p.y - i.y));
  ivec2 n = ivec2(i);
  float top = latticeValue(n.x, n.y) * (1.0 - f.x) + latticeValue(n.x + 1, n.y) * f.x;
  float bottom = latticeValue(n.x, n.y + 1) * (1.0 - f.x) + latticeValue(n.x + 1, n.y + 1) * f.x;
  return top * (1.0 - f.y) + bottom * f.y;
}
`;

/** engine/vignette.ts: vignetteMask, applyVignette */
const VIGNETTE_GLSL = /* glsl */ `
float vignetteMask(vec2 uv) {
  float r = length((uv - 0.5) * 2.0) / sqrt(2.0);
  float t = clamp((r - ${glslFloat(VIGNETTE_START)}) / (1.0 - ${glslFloat(VIGNETTE_START)}), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}
vec3 applyVignette(vec3 c, float amount, float mask) {
  if (amount < 0.0) return c * (1.0 + amount * mask);
  return c + (1.0 - c) * amount * mask;
}
`;

/** engine/colorGrading.ts: gradeWeights, applyColorGrading (regions: shadows, midtones, highlights, global) */
const COLOR_GRADING_GLSL = /* glsl */ `
float gradeSmooth(float a, float b, float x) {
  float t = clamp((x - a) / (b - a), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}
vec3 applyColorGrading(vec3 c) {
  if (!u_cgOn) return c;
  vec3 e = linearToSrgb(clamp(c, 0.0, 1.0));
  float y = luminance(e);
  float wh = gradeSmooth(u_cgPivot - u_cgWidth, u_cgPivot + u_cgWidth, y);
  float wm = 1.0 - gradeSmooth(0.0, u_cgMidWidth, abs(y - u_cgPivot));
  float ws = 1.0 - wh;
  vec3 tint = u_cgTint[3] + ws * u_cgTint[0] + wm * u_cgTint[1] + wh * u_cgTint[2];
  float lum = u_cgLum[3] + ws * u_cgLum[0] + wm * u_cgLum[1] + wh * u_cgLum[2];
  return srgbToLinear(clamp(e + tint + lum, 0.0, 1.0));
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
uniform bool u_curveOn;
uniform sampler2D u_curve;
uniform bool u_hslOn;
uniform float u_hslHue[8];
uniform float u_hslSat[8];
uniform float u_hslLum[8];
uniform bool u_cgOn;
uniform vec3 u_cgTint[4];
uniform float u_cgLum[4];
uniform float u_cgPivot;
uniform float u_cgWidth;
uniform float u_cgMidWidth;

out vec4 outColor;
${COLOR_GLSL}
${GAIN_GLSL}
${TONE_GLSL}
${CURVE_GLSL}
${HSL_GLSL}
${COLOR_ADJUST_GLSL}
${COLOR_GRADING_GLSL}
void main() {
  ivec2 size = textureSize(u_source, 0);
  ivec2 p = ivec2(gl_FragCoord.xy);
  if (u_flipY) p.y = size.y - 1 - p.y;
  vec4 src = texelFetch(u_source, p, 0);

  vec3 c = srgbToLinear(src.rgb);
  c = applyWhiteBalance(c, u_whiteBalance);
  c = applyExposure(c, u_exposureGain);
  c = applyTone(c, Tone(u_contrast, u_highlights, u_shadows, u_whites, u_blacks));
  c = applyCurve(c);
  c = applyHsl(c);
  c = applyVibrance(c, u_vibrance);
  c = applySaturation(c, u_saturationScale);
  c = applyTreatment(c, u_bw);
  c = applyColorGrading(c);
  outColor = vec4(linearToSrgb(clamp(c, 0.0, 1.0)), src.a);
}
`;

/**
 * Detail pass 1 of 2 (engine/sharpen.ts blurPlane): horizontal Gaussian blur
 * of the developed image's luminance, packed as 16-bit fixed point.
 */
export const BLUR_FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D u_image;
out vec4 outColor;
${COLOR_GLSL}
${SHARPEN_GLSL}
void main() {
  ivec2 size = textureSize(u_image, 0);
  ivec2 p = ivec2(gl_FragCoord.xy);
  float sum = 0.0;
  for (int i = -u_taps; i <= u_taps; i++) {
    int x = clamp(p.x + i, 0, size.x - 1);
    sum += u_weights[abs(i)] * luminance(texelFetch(u_image, ivec2(x, p.y), 0).rgb);
  }
  outColor = pack16(sum);
}
`;

/**
 * Detail pass 2 of 2 (engine/pipeline.ts applyDetailRgba8): vertical blur,
 * unsharp mask on luminance, then grain. Same size as the source; rows stay
 * top-first.
 */
export const DETAIL_FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D u_image;
uniform sampler2D u_blur;
uniform bool u_sharpenOn;
uniform float u_sharpenAmount;
uniform bool u_grainOn;
uniform float u_grainAmount;
uniform float u_grainCell;
uniform float u_scale;
out vec4 outColor;
${COLOR_GLSL}
${SHARPEN_GLSL}
${GRAIN_GLSL}
void main() {
  ivec2 size = textureSize(u_image, 0);
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 src = texelFetch(u_image, p, 0);
  float offset = 0.0;
  if (u_sharpenOn) {
    float blur = 0.0;
    for (int j = -u_taps; j <= u_taps; j++) {
      int y = clamp(p.y + j, 0, size.y - 1);
      blur += u_weights[abs(j)] * unpack16(texelFetch(u_blur, ivec2(p.x, y), 0));
    }
    offset += u_sharpenAmount * (luminance(src.rgb) - blur);
  }
  if (u_grainOn) {
    offset += u_grainAmount * valueNoise((vec2(p) + 0.5) / u_scale / u_grainCell);
  }
  outColor = vec4(clamp(src.rgb + offset, 0.0, 1.0), src.a);
}
`;

/**
 * Final pass (engine/geometry.ts applyGeometryRgba8): maps each output pixel
 * through an affine matrix to a source position and samples the developed
 * image bilinearly with the same lerp order as sampleBilinear(), then applies
 * the post-crop vignette. Outside the image the result is transparent; edges
 * clamp.
 */
export const GEOMETRY_FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D u_image;
uniform bool u_flipY;
uniform ivec2 u_outSize;
uniform vec3 u_rowX;
uniform vec3 u_rowY;
uniform float u_vignette;

out vec4 outColor;
${VIGNETTE_GLSL}
void main() {
  ivec2 o = ivec2(gl_FragCoord.xy);
  if (u_flipY) o.y = u_outSize.y - 1 - o.y;
  vec3 p = vec3(vec2(o) + 0.5, 1.0);
  vec2 s = vec2(dot(u_rowX, p), dot(u_rowY, p));
  ivec2 size = textureSize(u_image, 0);
  if (s.x < 0.0 || s.y < 0.0 || s.x > float(size.x) || s.y > float(size.y)) {
    outColor = vec4(0.0);
    return;
  }
  vec2 uv = s - 0.5;
  vec2 i0f = floor(uv);
  vec2 f = uv - i0f;
  ivec2 lo = clamp(ivec2(i0f), ivec2(0), size - 1);
  ivec2 hi = clamp(ivec2(i0f) + 1, ivec2(0), size - 1);
  vec4 c00 = texelFetch(u_image, ivec2(lo.x, lo.y), 0);
  vec4 c10 = texelFetch(u_image, ivec2(hi.x, lo.y), 0);
  vec4 c01 = texelFetch(u_image, ivec2(lo.x, hi.y), 0);
  vec4 c11 = texelFetch(u_image, ivec2(hi.x, hi.y), 0);
  vec4 c = mix(mix(c00, c10, f.x), mix(c01, c11, f.x), f.y);
  if (u_vignette != 0.0 && c.a > 0.0) {
    c.rgb = applyVignette(c.rgb, u_vignette, vignetteMask((vec2(o) + 0.5) / vec2(u_outSize)));
  }
  outColor = c;
}
`;
