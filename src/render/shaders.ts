import { LUMA_WEIGHTS } from '../engine/color';
import { CURVE_LUT_SIZE } from '../engine/curve';
import { GRAIN_SEED } from '../engine/grain';
import { HSL_CENTER_LIST, HSL_MAX_HUE_SHIFT, HSL_MAX_LUM } from '../engine/hsl';
import {
  CHROMA_GUIDE_SIGMA,
  DENOISE_CHROMA_MAX_TAPS,
  DENOISE_LUMA_MAX_TAPS,
} from '../engine/denoise';
import { CLARITY_GAIN, DEHAZE_STRENGTH, HAZE_LEVEL, HAZE_STRENGTH, PRESENCE_WEIGHT_COUNT } from '../engine/presence';
import { SHARPEN_WEIGHT_COUNT } from '../engine/sharpen';
import { HEAL_DIRECTIONS, RIM_STEPS } from '../engine/spots';
import { TONE_GAMMA } from '../engine/tone';
import { MAX_SPOTS } from '../model/editSettings';
import { MAX_MASKS } from '../model/editSettings';
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

/** engine/presence.ts: two 16-bit values per RGBA8 texel (luminance in RG, dark channel in BA). */
const LEVEL_GLSL = /* glsl */ `
vec2 pack16v(float v) {
  float q = floor(clamp(v, 0.0, 1.0) * 65535.0 + 0.5);
  float hi = floor(q / 256.0);
  return vec2(hi / 255.0, (q - hi * 256.0) / 255.0);
}
float unpack16v(vec2 t) {
  return (floor(t.x * 255.0 + 0.5) * 256.0 + floor(t.y * 255.0 + 0.5)) / 65535.0;
}
vec2 levelAt(sampler2D level, ivec2 q) {
  vec4 t = texelFetch(level, q, 0);
  return vec2(unpack16v(t.rg), unpack16v(t.ba));
}
`;

/** engine/presence.ts sampleLevel, softDetail, presenceOffset, dehazeChannel */
const PRESENCE_GLSL = /* glsl */ `
vec2 sampleLevel(sampler2D level, int factor, ivec2 p) {
  ivec2 size = textureSize(level, 0);
  vec2 uv = (vec2(p) + 0.5) / float(factor) - 0.5;
  vec2 i0f = floor(uv);
  vec2 f = uv - i0f;
  ivec2 i0 = ivec2(i0f);
  ivec2 lo = clamp(i0, ivec2(0), size - 1);
  ivec2 hi = clamp(i0 + 1, ivec2(0), size - 1);
  vec2 top = mix(levelAt(level, ivec2(lo.x, lo.y)), levelAt(level, ivec2(hi.x, lo.y)), f.x);
  vec2 bottom = mix(levelAt(level, ivec2(lo.x, hi.y)), levelAt(level, ivec2(hi.x, hi.y)), f.x);
  return mix(top, bottom, f.y);
}
float softDetail(float d) { return d / (1.0 + 4.0 * abs(d)); }
float presenceOffset(float y, float blurT, float blurC, float texture, float clarity) {
  return texture * softDetail(y - blurT) + clarity * ${glslFloat(CLARITY_GAIN)} * 4.0 * y * (1.0 - y) * softDetail(y - blurC);
}
vec3 dehaze(vec3 c, float dark, float amount) {
  if (amount > 0.0) {
    float t = 1.0 - ${glslFloat(DEHAZE_STRENGTH)} * amount * dark;
    return 1.0 - (1.0 - c) / t;
  }
  if (amount < 0.0) {
    float k = -amount * ${glslFloat(HAZE_STRENGTH)};
    return c * (1.0 - k) + ${glslFloat(HAZE_LEVEL)} * k;
  }
  return c;
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

/**
 * engine/masks.ts maskWeight for one shape (kind 0 linear, 1 radial, 2 brush).
 * Brush weight maps live in the R8 texture array u_brush (engine/brush.ts
 * sampleBrush): b = (raster width, raster height, layer, 0). Needs u_brush.
 */
const SHAPE_WEIGHT_GLSL = /* glsl */ `
float maskSmooth(float a, float b, float x) {
  float t = clamp((x - a) / (b - a), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}
float brushWeight(vec4 b, vec2 p, vec2 size) {
  vec2 q = p / size * b.xy - 0.5;
  vec2 f0 = floor(q);
  vec2 f = q - f0;
  ivec2 hiCell = ivec2(b.xy) - 1;
  ivec2 lo = clamp(ivec2(f0), ivec2(0), hiCell);
  ivec2 hi = clamp(ivec2(f0) + 1, ivec2(0), hiCell);
  int l = int(b.z);
  float c00 = texelFetch(u_brush, ivec3(lo.x, lo.y, l), 0).r;
  float c10 = texelFetch(u_brush, ivec3(hi.x, lo.y, l), 0).r;
  float c01 = texelFetch(u_brush, ivec3(lo.x, hi.y, l), 0).r;
  float c11 = texelFetch(u_brush, ivec3(hi.x, hi.y, l), 0).r;
  return mix(mix(c00, c10, f.x), mix(c01, c11, f.x), f.y);
}
float shapeWeight(int kind, vec4 a, vec4 b, vec2 p, vec2 size) {
  if (kind == 2) return brushWeight(b, p, size);
  if (kind == 0) {
    vec2 d = (a.zw - a.xy) * size;
    float len2 = dot(d, d);
    if (len2 == 0.0) return 0.0;
    float t = dot(p - a.xy * size, d) / len2;
    return 1.0 - maskSmooth(0.0, 1.0, t);
  }
  vec2 o = p - a.xy * size;
  float u = (o.x * b.x + o.y * b.y) / (a.z * size.x);
  float v = (-o.x * b.y + o.y * b.x) / (a.w * size.y);
  float r = sqrt(u * u + v * v);
  float w = 1.0 - maskSmooth(1.0 - max(b.z, 1e-4), 1.0, r);
  return b.w > 0.5 ? 1.0 - w : w;
}
`;

/** engine/masks.ts: maskWeight, adjustForMask, applyMasks (up to MAX_MASKS, in order) */
const MASKS_GLSL = /* glsl */ `
${SHAPE_WEIGHT_GLSL}
float maskWeight(int i, vec2 p, vec2 size) {
  return shapeWeight(u_maskKind[i], u_maskA[i], u_maskB[i], p, size);
}
vec3 adjustForMask(vec3 c, int i) {
  vec3 out3 = c * u_maskWB[i] * u_maskGain[i];
  vec3 t = u_maskTone[i];
  out3 = applyTone(out3, Tone(t.x, t.y, t.z, 0.0, 0.0));
  return applySaturation(out3, u_maskSat[i]);
}
vec3 applyMasks(vec3 c, vec2 p, vec2 size) {
  for (int i = 0; i < ${MAX_MASKS}; i++) {
    if (i >= u_maskCount) break;
    float w = maskWeight(i, p, size);
    if (w <= 0.0) continue;
    vec3 adjusted = adjustForMask(c, i);
    c = w >= 1.0 ? adjusted : mix(c, adjusted, w);
  }
  return c;
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
uniform highp sampler2DArray u_brush;
uniform int u_maskCount;
uniform int u_maskKind[${MAX_MASKS}];
uniform vec4 u_maskA[${MAX_MASKS}];
uniform vec4 u_maskB[${MAX_MASKS}];
uniform vec3 u_maskWB[${MAX_MASKS}];
uniform float u_maskGain[${MAX_MASKS}];
uniform vec3 u_maskTone[${MAX_MASKS}];
uniform float u_maskSat[${MAX_MASKS}];
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
${MASKS_GLSL}
void main() {
  ivec2 size = textureSize(u_source, 0);
  ivec2 p = ivec2(gl_FragCoord.xy);
  if (u_flipY) p.y = size.y - 1 - p.y;
  vec4 src = texelFetch(u_source, p, 0);

  vec3 c = srgbToLinear(src.rgb);
  c = applyWhiteBalance(c, u_whiteBalance);
  c = applyExposure(c, u_exposureGain);
  c = applyTone(c, Tone(u_contrast, u_highlights, u_shadows, u_whites, u_blacks));
  if (u_maskCount > 0) c = applyMasks(c, vec2(p) + 0.5, vec2(size));
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
 * Spot removal (engine/spots.ts retouchRgba8): every spot in order, each
 * reading the original; heal adds the rim correction. Runs on the uploaded
 * photo before the develop pass; rows stay top-first.
 */
export const RETOUCH_FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D u_image;
uniform int u_spotCount;
uniform vec4 u_spotA[${MAX_SPOTS}];
uniform vec4 u_spotB[${MAX_SPOTS}];
out vec4 outColor;
const float TAU = 6.283185307179586;

vec3 sampleClamped(vec2 pos) {
  ivec2 size = textureSize(u_image, 0);
  vec2 uv = clamp(pos, vec2(0.5), vec2(size) - 0.5) - 0.5;
  ivec2 i0 = ivec2(floor(uv));
  vec2 f = uv - vec2(i0);
  ivec2 i1 = min(i0 + 1, size - 1);
  vec3 top = mix(texelFetch(u_image, i0, 0).rgb, texelFetch(u_image, ivec2(i1.x, i0.y), 0).rgb, f.x);
  vec3 bottom = mix(texelFetch(u_image, ivec2(i0.x, i1.y), 0).rgb, texelFetch(u_image, i1, 0).rgb, f.x);
  return mix(top, bottom, f.y);
}
float spotAlpha(float d, float r, float inner) {
  if (d >= r) return 0.0;
  if (d <= inner) return 1.0;
  float t = (r - d) / (r - inner);
  return t * t * (3.0 - 2.0 * t);
}
vec3 healCorrection(vec4 a, float r, vec2 pos) {
  float step = max(1.0, 0.1 * r);
  vec3 sum = vec3(0.0);
  float weights = 0.0;
  for (int k = 0; k < ${HEAL_DIRECTIONS}; k++) {
    float angle = TAU * float(k) / ${glslFloat(HEAL_DIRECTIONS)};
    vec2 u = vec2(cos(angle), sin(angle));
    vec3 d = vec3(0.0);
    for (int j = 0; j < ${RIM_STEPS}; j++) {
      float dist = r + float(j) * step;
      d += (sampleClamped(a.xy + dist * u) - sampleClamped(a.zw + dist * u)) / ${glslFloat(RIM_STEPS)};
    }
    vec2 b = a.xy + r * u;
    vec2 q = pos - b;
    float w = 1.0 / (dot(q, q) + 1.0);
    sum += w * d;
    weights += w;
  }
  return sum / weights;
}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 src = texelFetch(u_image, p, 0);
  vec3 color = src.rgb;
  vec2 pos = vec2(p) + 0.5;
  for (int n = 0; n < u_spotCount; n++) {
    vec4 a = u_spotA[n];
    vec4 b = u_spotB[n];
    float alpha = spotAlpha(length(pos - a.xy), b.x, b.y) * b.z;
    if (alpha <= 0.0) continue;
    vec3 value = sampleClamped(a.zw + pos - a.xy);
    if (b.w > 0.5) value += healCorrection(a, b.x, pos);
    color = color * (1.0 - alpha) + value * alpha;
  }
  outColor = vec4(clamp(color, 0.0, 1.0), src.a);
}
`;

/** engine/denoise.ts: range weight and the color-difference encoding. */
const DENOISE_GLSL = /* glsl */ `
uniform int u_lumaTaps;
uniform float u_lumaWeights[${DENOISE_LUMA_MAX_TAPS + 1}];
uniform int u_chromaTaps;
uniform float u_chromaWeights[${DENOISE_CHROMA_MAX_TAPS + 1}];
uniform float u_lumaSigma;
uniform float u_colorSigma;
const float GUIDE_SIGMA = ${glslFloat(CHROMA_GUIDE_SIGMA)};
float rangeWeight(float d2, float sigma) { return exp(-d2 / (2.0 * sigma * sigma)); }
float decodeDiff(vec2 t) { return 2.0 * unpack16v(t) - 1.0; }
vec2 encodeDiff(float d) { return pack16v((d + 1.0) / 2.0); }
`;

/** Noise reduction, row pass of the luminance bilateral (16-bit Y in RG). */
export const DENOISE_LUMA_H_FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D u_image;
out vec4 outColor;
${COLOR_GLSL}
${LEVEL_GLSL}
${DENOISE_GLSL}
void main() {
  ivec2 size = textureSize(u_image, 0);
  ivec2 p = ivec2(gl_FragCoord.xy);
  float center = luminance(texelFetch(u_image, p, 0).rgb);
  float sum = 0.0;
  float weights = 0.0;
  for (int k = -u_lumaTaps; k <= u_lumaTaps; k++) {
    float v = luminance(texelFetch(u_image, ivec2(clamp(p.x + k, 0, size.x - 1), p.y), 0).rgb);
    float w = u_lumaWeights[abs(k)] * rangeWeight((v - center) * (v - center), u_lumaSigma);
    sum += w * v;
    weights += w;
  }
  outColor = vec4(pack16v(sum / weights), 0.0, 1.0);
}
`;

/** Noise reduction, row pass of the color cross-bilateral (dr in RG, db in BA, 16-bit each). */
export const DENOISE_CHROMA_H_FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D u_image;
out vec4 outColor;
${COLOR_GLSL}
${LEVEL_GLSL}
${DENOISE_GLSL}
void main() {
  ivec2 size = textureSize(u_image, 0);
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec3 c0 = texelFetch(u_image, p, 0).rgb;
  float g0 = luminance(c0);
  vec2 d0 = vec2(c0.r - g0, c0.b - g0);
  vec2 sum = vec2(0.0);
  float weights = 0.0;
  for (int k = -u_chromaTaps; k <= u_chromaTaps; k++) {
    vec3 c = texelFetch(u_image, ivec2(clamp(p.x + k, 0, size.x - 1), p.y), 0).rgb;
    float g = luminance(c);
    vec2 d = vec2(c.r - g, c.b - g);
    vec2 dd = d - d0;
    float w = u_chromaWeights[abs(k)] * rangeWeight((g - g0) * (g - g0), GUIDE_SIGMA) * rangeWeight(dot(dd, dd), u_colorSigma);
    sum += w * d;
    weights += w;
  }
  vec2 d = sum / weights;
  outColor = vec4(encodeDiff(d.x), encodeDiff(d.y));
}
`;

/**
 * Noise reduction, column passes and recombination (engine/denoise.ts
 * denoiseRgba8): luminance from the bilateral, color differences from the
 * cross-bilateral (guided by the developed luminance), G from the weights.
 */
export const DENOISE_V_FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D u_image;
uniform sampler2D u_lumaH;
uniform sampler2D u_chromaH;
uniform bool u_lumaOn;
uniform bool u_colorOn;
out vec4 outColor;
${COLOR_GLSL}
${LEVEL_GLSL}
${DENOISE_GLSL}
void main() {
  ivec2 size = textureSize(u_image, 0);
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 src = texelFetch(u_image, p, 0);
  float y = luminance(src.rgb);
  float lum = y;
  if (u_lumaOn) {
    float center = unpack16v(texelFetch(u_lumaH, p, 0).rg);
    float sum = 0.0;
    float weights = 0.0;
    for (int k = -u_lumaTaps; k <= u_lumaTaps; k++) {
      float v = unpack16v(texelFetch(u_lumaH, ivec2(p.x, clamp(p.y + k, 0, size.y - 1)), 0).rg);
      float w = u_lumaWeights[abs(k)] * rangeWeight((v - center) * (v - center), u_lumaSigma);
      sum += w * v;
      weights += w;
    }
    lum = sum / weights;
  }
  vec2 diff = vec2(src.r - y, src.b - y);
  if (u_colorOn) {
    vec4 t0 = texelFetch(u_chromaH, p, 0);
    vec2 d0 = vec2(decodeDiff(t0.rg), decodeDiff(t0.ba));
    vec2 sum = vec2(0.0);
    float weights = 0.0;
    for (int k = -u_chromaTaps; k <= u_chromaTaps; k++) {
      ivec2 q = ivec2(p.x, clamp(p.y + k, 0, size.y - 1));
      vec4 t = texelFetch(u_chromaH, q, 0);
      vec2 d = vec2(decodeDiff(t.rg), decodeDiff(t.ba));
      float g = luminance(texelFetch(u_image, q, 0).rgb);
      vec2 dd = d - d0;
      float w = u_chromaWeights[abs(k)] * rangeWeight((g - y) * (g - y), GUIDE_SIGMA) * rangeWeight(dot(dd, dd), u_colorSigma);
      sum += w * d;
      weights += w;
    }
    diff = sum / weights;
  }
  float r = lum + diff.x;
  float b = lum + diff.y;
  float g = (lum - LUMA.r * r - LUMA.b * b) / LUMA.g;
  outColor = vec4(clamp(vec3(r, g, b), 0.0, 1.0), src.a);
}
`;

/**
 * Presence level, step 1 (engine/presence.ts downsample): averages each
 * factor × factor block of the developed image (edge blocks: only the pixels
 * they have) into luminance and dark channel, 16 bits each.
 */
export const LEVEL_DOWN_FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D u_image;
uniform int u_factor;
out vec4 outColor;
${COLOR_GLSL}
${LEVEL_GLSL}
void main() {
  ivec2 size = textureSize(u_image, 0);
  ivec2 o = ivec2(gl_FragCoord.xy) * u_factor;
  ivec2 e = min(o + u_factor, size);
  float sl = 0.0;
  float sd = 0.0;
  for (int y = o.y; y < e.y; y++) {
    for (int x = o.x; x < e.x; x++) {
      vec3 c = texelFetch(u_image, ivec2(x, y), 0).rgb;
      sl += luminance(c);
      sd += min(c.r, min(c.g, c.b));
    }
  }
  float n = float((e.x - o.x) * (e.y - o.y));
  outColor = vec4(pack16v(sl / n), pack16v(sd / n));
}
`;

/** Presence level, steps 2 and 3: separable Gaussian along u_dir, edges clamped, 16 bits each. */
export const LEVEL_BLUR_FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D u_level;
uniform ivec2 u_dir;
uniform int u_taps;
uniform float u_weights[${PRESENCE_WEIGHT_COUNT}];
out vec4 outColor;
${LEVEL_GLSL}
void main() {
  ivec2 size = textureSize(u_level, 0);
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec2 sum = vec2(0.0);
  for (int i = -u_taps; i <= u_taps; i++) {
    sum += u_weights[abs(i)] * levelAt(u_level, clamp(p + u_dir * i, ivec2(0), size - 1));
  }
  outColor = vec4(pack16v(sum.x), pack16v(sum.y));
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
uniform bool u_presenceOn;
uniform bool u_textureOn;
uniform sampler2D u_textureLevel;
uniform int u_textureFactor;
uniform bool u_coarseOn;
uniform sampler2D u_coarseLevel;
uniform int u_coarseFactor;
uniform float u_texture;
uniform float u_clarity;
uniform float u_dehaze;
out vec4 outColor;
${COLOR_GLSL}
${SHARPEN_GLSL}
${LEVEL_GLSL}
${PRESENCE_GLSL}
${GRAIN_GLSL}
void main() {
  ivec2 size = textureSize(u_image, 0);
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 src = texelFetch(u_image, p, 0);
  vec3 c = src.rgb;
  float offset = 0.0;
  if (u_presenceOn) {
    float y = luminance(src.rgb);
    float blurT = u_textureOn ? sampleLevel(u_textureLevel, u_textureFactor, p).x : y;
    vec2 coarse = u_coarseOn ? sampleLevel(u_coarseLevel, u_coarseFactor, p) : vec2(y, 0.0);
    offset += presenceOffset(y, blurT, coarse.x, u_texture, u_clarity);
    c = dehaze(c, coarse.y, u_dehaze);
  }
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
  outColor = vec4(clamp(c + offset, 0.0, 1.0), src.a);
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

/**
 * Display pass (M20; engine/display.ts): Before or After per column for the
 * split view, then the clipping overlay, then the mask overlay (M21). Both inputs are RGBA8 textures, so
 * the overlay sees exactly the bytes the CPU reference does.
 */
export const DISPLAY_FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D u_after;
uniform sampler2D u_before;
uniform bool u_flipY;
/** Split position in output pixels (columns whose center is left of it show Before); negative = no split. */
uniform float u_splitX;
uniform bool u_shadows;
uniform bool u_highlights;
uniform vec3 u_shadowColor;
uniform vec3 u_highlightColor;
/** Mask overlay (M21): the selected mask's weight as a tint. Output px → source px via rowX/rowY. */
uniform highp sampler2DArray u_brush;
uniform bool u_overlayOn;
uniform int u_overlayKind;
uniform vec4 u_overlayA;
uniform vec4 u_overlayB;
uniform vec3 u_rowX;
uniform vec3 u_rowY;
uniform vec2 u_srcSize;
uniform vec3 u_overlayColor;
uniform float u_overlayOpacity;

out vec4 outColor;
${SHAPE_WEIGHT_GLSL}

void main() {
  ivec2 o = ivec2(gl_FragCoord.xy);
  ivec2 size = textureSize(u_after, 0);
  if (u_flipY) o.y = size.y - 1 - o.y;
  bool before = float(o.x) + 0.5 < u_splitX;
  vec4 c = before ? texelFetch(u_before, o, 0) : texelFetch(u_after, o, 0);
  ivec3 b = ivec3(round(c.rgb * 255.0));
  if (c.a > 0.0 && u_highlights && all(equal(b, ivec3(255)))) c.rgb = u_highlightColor;
  else if (c.a > 0.0 && u_shadows && all(equal(b, ivec3(0)))) c.rgb = u_shadowColor;
  if (u_overlayOn && c.a > 0.0) {
    vec3 p = vec3(vec2(o) + 0.5, 1.0);
    vec2 src = vec2(dot(u_rowX, p), dot(u_rowY, p));
    float w = shapeWeight(u_overlayKind, u_overlayA, u_overlayB, src, u_srcSize);
    c.rgb = mix(c.rgb, u_overlayColor, u_overlayOpacity * w);
  }
  outColor = c;
}
`;
