import { CURVE_LUT_SIZE } from '../engine/curve';
import { geometryMatrix, isIdentityGeometry, outputSize } from '../engine/geometry';
import { hasDetailStage, type PipelineParams } from '../engine/pipeline';
import { sharpenKernel } from '../engine/sharpen';
import { MAX_MASKS } from '../model/editSettings';
import { createProgram, createTexture, type RgbaImage, type TextureSource } from './gl';
import { BLUR_FRAGMENT_SHADER, DETAIL_FRAGMENT_SHADER, DEVELOP_FRAGMENT_SHADER, GEOMETRY_FRAGMENT_SHADER, VERTEX_SHADER } from './shaders';

const DEVELOP_UNIFORMS = [
  'source',
  'flipY',
  'whiteBalance',
  'exposureGain',
  'contrast',
  'highlights',
  'shadows',
  'whites',
  'blacks',
  'vibrance',
  'saturationScale',
  'bw',
  'curveOn',
  'curve',
  'hslOn',
  'hslHue',
  'hslSat',
  'hslLum',
  'maskCount',
  'maskKind',
  'maskA',
  'maskB',
  'maskWB',
  'maskGain',
  'maskTone',
  'maskSat',
  'cgOn',
  'cgTint',
  'cgLum',
  'cgPivot',
  'cgWidth',
  'cgMidWidth',
] as const;
const BLUR_UNIFORMS = ['image', 'taps', 'weights'] as const;
const DETAIL_UNIFORMS = ['image', 'blur', 'taps', 'weights', 'sharpenOn', 'sharpenAmount', 'grainOn', 'grainAmount', 'grainCell', 'scale'] as const;
const GEOMETRY_UNIFORMS = ['image', 'flipY', 'outSize', 'rowX', 'rowY', 'vignette'] as const;

const ZERO8 = new Float32Array(8);

type Uniforms<K extends string> = Record<K, WebGLUniformLocation | null>;

/** Which uploaded copy of the photo to render. */
export type SourceKind = 'full' | 'proxy' | 'histogram';

interface SizedTexture {
  texture: WebGLTexture;
  width: number;
  height: number;
}

type RenderTarget = SizedTexture & { framebuffer: WebGLFramebuffer; bytesPerPixel: number };

/** Texture format per scratch target: the blur only needs two bytes (16-bit fixed point). */
const SCRATCH_FORMAT: Readonly<Record<IntermediateKind, 'rgba8' | 'rg8'>> = { developed: 'rgba8', blur: 'rg8', detailed: 'rgba8' };

/** Reused source-size RGBA8 targets: developed color, 16-bit blur, after detail. */
type IntermediateKind = 'developed' | 'blur' | 'detailed';

interface Target {
  /** Null = the canvas. */
  framebuffer: WebGLFramebuffer | null;
  width: number;
  height: number;
  /** The canvas is bottom-up; offscreen targets keep image rows top-first. */
  flipY: boolean;
}

export type RenderCanvas = HTMLCanvasElement | OffscreenCanvas;

function locate<K extends string>(gl: WebGL2RenderingContext, program: WebGLProgram, names: readonly K[]): Uniforms<K> {
  const out = {} as Uniforms<K>;
  for (const name of names) out[name] = gl.getUniformLocation(program, `u_${name}`);
  return out;
}

/**
 * Runs the develop pipeline on the GPU in up to four passes, all but the
 * last into RGBA8 textures at source size: (1) per-pixel color, (2, 3) detail
 * (horizontal luminance blur, then vertical blur + unsharp mask + grain),
 * (4) geometry resampling + vignette into the output. Passes 2–3 run only
 * when sharpening or grain is on; with nothing after color, pass 1 renders
 * straight to the output. Holds a full-resolution texture, a downscaled proxy
 * for interactive drags and a small copy for the histogram.
 */
export class Renderer {
  private readonly developProgram: WebGLProgram;
  private readonly blurProgram: WebGLProgram;
  private readonly detailProgram: WebGLProgram;
  private readonly geometryProgram: WebGLProgram;
  private readonly developUniforms: Uniforms<(typeof DEVELOP_UNIFORMS)[number]>;
  private readonly blurUniforms: Uniforms<(typeof BLUR_UNIFORMS)[number]>;
  private readonly detailUniforms: Uniforms<(typeof DETAIL_UNIFORMS)[number]>;
  private readonly geometryUniforms: Uniforms<(typeof GEOMETRY_UNIFORMS)[number]>;
  private textures: Partial<Record<SourceKind, SizedTexture>> = {};
  private intermediates: Partial<Record<IntermediateKind, RenderTarget>> = {};
  /** RGBA32F tone-curve table (CURVE_LUT_SIZE × 1), uploaded when curves are set. */
  private readonly curveTexture: WebGLTexture;

  private constructor(
    private readonly canvas: RenderCanvas,
    private readonly gl: WebGL2RenderingContext,
  ) {
    this.developProgram = createProgram(gl, VERTEX_SHADER, DEVELOP_FRAGMENT_SHADER);
    this.blurProgram = createProgram(gl, VERTEX_SHADER, BLUR_FRAGMENT_SHADER);
    this.detailProgram = createProgram(gl, VERTEX_SHADER, DETAIL_FRAGMENT_SHADER);
    this.geometryProgram = createProgram(gl, VERTEX_SHADER, GEOMETRY_FRAGMENT_SHADER);
    this.developUniforms = locate(gl, this.developProgram, DEVELOP_UNIFORMS);
    this.blurUniforms = locate(gl, this.blurProgram, BLUR_UNIFORMS);
    this.detailUniforms = locate(gl, this.detailProgram, DETAIL_UNIFORMS);
    this.geometryUniforms = locate(gl, this.geometryProgram, GEOMETRY_UNIFORMS);
    this.curveTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.curveTexture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, CURVE_LUT_SIZE, 1);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  }

  /** Throws if WebGL2 is unavailable. */
  static create(canvas: RenderCanvas): Renderer {
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      depth: false,
      stencil: false,
    }) as WebGL2RenderingContext | null;
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    return new Renderer(canvas, gl);
  }

  get maxTextureSize(): number {
    return this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number;
  }

  get hasImage(): boolean {
    return this.textures.full !== undefined;
  }

  /** Uploads the photo. Missing proxy/histogram copies fall back to the full one. */
  setImage(sources: { full: TextureSource; proxy?: TextureSource | null; histogram?: TextureSource | null }): void {
    this.clearImage();
    this.textures.full = this.upload(sources.full);
    if (sources.proxy) this.textures.proxy = this.upload(sources.proxy);
    if (sources.histogram) this.textures.histogram = this.upload(sources.histogram);
  }

  clearImage(): void {
    for (const t of Object.values(this.textures)) this.gl.deleteTexture(t.texture);
    this.textures = {};
  }

  /** Draws to the canvas, resizing it to the output. Returns the output size. */
  draw(params: PipelineParams, kind: SourceKind): { width: number; height: number } {
    const source = this.pickSource(kind);
    const out = outputSize(source, params.geometry);
    if (this.canvas.width !== out.width) this.canvas.width = out.width;
    if (this.canvas.height !== out.height) this.canvas.height = out.height;
    this.render(source, params, { framebuffer: null, ...out, flipY: true });
    return out;
  }

  /** Renders into an offscreen RGBA8 framebuffer and reads it back, rows top-first. */
  readPixels(params: PipelineParams, kind: SourceKind = 'full'): RgbaImage {
    const { gl } = this;
    const source = this.pickSource(kind);
    const out = outputSize(source, params.geometry);
    const target = this.createTarget(out.width, out.height);
    this.render(source, params, { framebuffer: target.framebuffer, ...out, flipY: false });
    const data = new Uint8Array(out.width * out.height * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.readPixels(0, 0, out.width, out.height, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.deleteTarget(target);
    return { width: out.width, height: out.height, data };
  }

  dispose(): void {
    this.clearImage();
    this.releaseIntermediates();
    this.gl.deleteTexture(this.curveTexture);
    for (const program of [this.developProgram, this.blurProgram, this.detailProgram, this.geometryProgram]) this.gl.deleteProgram(program);
  }

  private render(source: SizedTexture, params: PipelineParams, target: Target): void {
    const detail = hasDetailStage(params);
    if (!detail && params.vignette === 0 && isIdentityGeometry(params.geometry)) {
      this.developPass(source, params, target);
      return;
    }
    const developed = this.intermediateFor('developed', source);
    this.developPass(source, params, this.offscreen(developed));
    let image: SizedTexture = developed;
    if (detail) {
      const scale = source.width / (this.textures.full?.width ?? source.width);
      image = this.detailPasses(developed, params, scale);
    }
    this.geometryPass(image, params, target);
  }

  /** Sharpening (blur passes) and grain at source size; returns the result texture. */
  private detailPasses(developed: RenderTarget, params: PipelineParams, scale: number): RenderTarget {
    const { gl } = this;
    const kernel = sharpenKernel(params.sharpen?.radius ?? 0, scale);
    const blur = params.sharpen ? this.intermediateFor('blur', developed) : null;
    if (blur) {
      const u = this.blurUniforms;
      this.bindTarget(this.offscreen(blur));
      gl.useProgram(this.blurProgram);
      this.bindTexture(0, developed.texture, u.image);
      gl.uniform1i(u.taps, kernel.taps);
      gl.uniform1fv(u.weights, kernel.weights);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    const detailed = this.intermediateFor('detailed', developed);
    const u = this.detailUniforms;
    this.bindTarget(this.offscreen(detailed));
    gl.useProgram(this.detailProgram);
    this.bindTexture(0, developed.texture, u.image);
    // Sampler must point at a valid unit even when sharpening is off.
    this.bindTexture(1, (blur ?? developed).texture, u.blur);
    gl.uniform1i(u.taps, kernel.taps);
    gl.uniform1fv(u.weights, kernel.weights);
    gl.uniform1i(u.sharpenOn, params.sharpen ? 1 : 0);
    gl.uniform1f(u.sharpenAmount, params.sharpen?.amount ?? 0);
    gl.uniform1i(u.grainOn, params.grain ? 1 : 0);
    gl.uniform1f(u.grainAmount, params.grain?.amount ?? 0);
    gl.uniform1f(u.grainCell, params.grain?.cell ?? 1);
    gl.uniform1f(u.scale, scale);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return detailed;
  }

  private bindTexture(unit: number, texture: WebGLTexture, location: WebGLUniformLocation | null): void {
    this.gl.activeTexture(this.gl.TEXTURE0 + unit);
    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    this.gl.uniform1i(location, unit);
  }

  private offscreen(t: RenderTarget): Target {
    return { framebuffer: t.framebuffer, width: t.width, height: t.height, flipY: false };
  }

  private developPass(source: SizedTexture, params: PipelineParams, target: Target): void {
    const { gl } = this;
    const u = this.developUniforms;
    this.bindTarget(target);
    gl.useProgram(this.developProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source.texture);
    gl.uniform1i(u.source, 0);
    gl.uniform1i(u.flipY, target.flipY ? 1 : 0);
    gl.uniform3f(u.whiteBalance, ...params.whiteBalance);
    gl.uniform1f(u.exposureGain, params.exposureGain);
    gl.uniform1f(u.contrast, params.tone.contrast);
    gl.uniform1f(u.highlights, params.tone.highlights);
    gl.uniform1f(u.shadows, params.tone.shadows);
    gl.uniform1f(u.whites, params.tone.whites);
    gl.uniform1f(u.blacks, params.tone.blacks);
    gl.uniform1f(u.vibrance, params.vibrance);
    gl.uniform1f(u.saturationScale, params.saturationScale);
    gl.uniform1i(u.bw, params.bw ? 1 : 0);
    gl.uniform1i(u.curveOn, params.curveLut ? 1 : 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.curveTexture);
    if (params.curveLut) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, CURVE_LUT_SIZE, 1, gl.RGBA, gl.FLOAT, params.curveLut);
    gl.uniform1i(u.curve, 1);
    gl.uniform1i(u.hslOn, params.hsl ? 1 : 0);
    gl.uniform1fv(u.hslHue, params.hsl?.hue ?? ZERO8);
    gl.uniform1fv(u.hslSat, params.hsl?.sat ?? ZERO8);
    gl.uniform1fv(u.hslLum, params.hsl?.lum ?? ZERO8);
    this.setColorGrading(params);
    this.setMasks(params);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private setMasks(params: PipelineParams): void {
    const { gl } = this;
    const u = this.developUniforms;
    const masks = params.masks.slice(0, MAX_MASKS);
    gl.uniform1i(u.maskCount, masks.length);
    if (masks.length === 0) return;
    gl.uniform1iv(u.maskKind, masks.map((m) => (m.shape.kind === 'linear' ? 0 : 1)));
    gl.uniform4fv(u.maskA, masks.flatMap((m) => m.shape.a));
    gl.uniform4fv(u.maskB, masks.flatMap((m) => m.shape.b));
    gl.uniform3fv(u.maskWB, masks.flatMap((m) => [...m.whiteBalance]));
    gl.uniform1fv(u.maskGain, masks.map((m) => m.exposureGain));
    gl.uniform3fv(u.maskTone, masks.flatMap((m) => [m.tone.contrast, m.tone.highlights, m.tone.shadows]));
    gl.uniform1fv(u.maskSat, masks.map((m) => m.saturationScale));
  }

  private setColorGrading(params: PipelineParams): void {
    const { gl } = this;
    const u = this.developUniforms;
    const cg = params.colorGrading;
    gl.uniform1i(u.cgOn, cg ? 1 : 0);
    if (!cg) return;
    const regions = [cg.shadows, cg.midtones, cg.highlights, cg.global];
    gl.uniform3fv(u.cgTint, regions.flatMap((r) => [...r.tint]));
    gl.uniform1fv(u.cgLum, regions.map((r) => r.lum));
    gl.uniform1f(u.cgPivot, cg.pivot);
    gl.uniform1f(u.cgWidth, cg.width);
    gl.uniform1f(u.cgMidWidth, cg.midWidth);
  }

  private geometryPass(image: SizedTexture, params: PipelineParams, target: Target): void {
    const { gl } = this;
    const u = this.geometryUniforms;
    const m = geometryMatrix(image, params.geometry, target);
    this.bindTarget(target);
    gl.useProgram(this.geometryProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, image.texture);
    gl.uniform1i(u.image, 0);
    gl.uniform1i(u.flipY, target.flipY ? 1 : 0);
    gl.uniform2i(u.outSize, target.width, target.height);
    gl.uniform3f(u.rowX, m[0], m[1], m[2]);
    gl.uniform3f(u.rowY, m[3], m[4], m[5]);
    gl.uniform1f(u.vignette, params.vignette);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private bindTarget(target: Target): void {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, target.framebuffer);
    this.gl.viewport(0, 0, target.width, target.height);
  }

  private createTarget(width: number, height: number, format: 'rgba8' | 'rg8' = 'rgba8'): RenderTarget {
    const { gl } = this;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, format === 'rg8' ? gl.RG8 : gl.RGBA8, width, height);
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { texture, framebuffer, width, height, bytesPerPixel: format === 'rg8' ? 2 : 4 };
  }

  /** Reused RGBA8 target at source size, recreated when the size changes. */
  private intermediateFor(kind: IntermediateKind, size: { width: number; height: number }): RenderTarget {
    const current = this.intermediates[kind];
    if (current && current.width === size.width && current.height === size.height) return current;
    if (current) this.deleteTarget(current);
    const created = this.createTarget(size.width, size.height, SCRATCH_FORMAT[kind]);
    this.intermediates[kind] = created;
    return created;
  }

  private deleteTarget(t: RenderTarget): void {
    this.gl.deleteFramebuffer(t.framebuffer);
    this.gl.deleteTexture(t.texture);
  }

  /** GPU memory held by scratch images between renders, in bytes. */
  get scratchBytes(): number {
    return Object.values(this.intermediates).reduce((n, t) => n + t.width * t.height * t.bytesPerPixel, 0);
  }

  /** Frees the scratch images (they are recreated on the next render that needs them). */
  releaseScratch(): void {
    this.releaseIntermediates();
  }

  private releaseIntermediates(): void {
    for (const t of Object.values(this.intermediates)) this.deleteTarget(t);
    this.intermediates = {};
  }

  private pickSource(kind: SourceKind): SizedTexture {
    const source = this.textures[kind] ?? this.textures.full;
    if (!source) throw new Error('No image loaded');
    return source;
  }

  private upload(source: TextureSource): SizedTexture {
    return { texture: createTexture(this.gl, source), width: source.width, height: source.height };
  }
}
