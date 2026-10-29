import { CURVE_LUT_SIZE } from '../engine/curve';
import { geometryMatrix, isIdentityGeometry, outputSize } from '../engine/geometry';
import type { PipelineParams } from '../engine/pipeline';
import { createProgram, createTexture, type RgbaImage, type TextureSource } from './gl';
import { DEVELOP_FRAGMENT_SHADER, GEOMETRY_FRAGMENT_SHADER, VERTEX_SHADER } from './shaders';

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
] as const;
const GEOMETRY_UNIFORMS = ['image', 'flipY', 'outSize', 'rowX', 'rowY'] as const;

const ZERO8 = new Float32Array(8);

type Uniforms<K extends string> = Record<K, WebGLUniformLocation | null>;

/** Which uploaded copy of the photo to render. */
export type SourceKind = 'full' | 'proxy' | 'histogram';

interface SizedTexture {
  texture: WebGLTexture;
  width: number;
  height: number;
}

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
 * Runs the develop pipeline on the GPU in up to two passes: (1) per-pixel
 * color into an intermediate RGBA8 texture at source size, (2) geometry
 * resampling into the output. With identity geometry pass 1 renders straight
 * to the output. Holds a full-resolution texture, a downscaled proxy for
 * interactive drags and a small copy for the histogram.
 */
export class Renderer {
  private readonly developProgram: WebGLProgram;
  private readonly geometryProgram: WebGLProgram;
  private readonly developUniforms: Uniforms<(typeof DEVELOP_UNIFORMS)[number]>;
  private readonly geometryUniforms: Uniforms<(typeof GEOMETRY_UNIFORMS)[number]>;
  private textures: Partial<Record<SourceKind, SizedTexture>> = {};
  private intermediate: (SizedTexture & { framebuffer: WebGLFramebuffer }) | null = null;
  /** RGBA32F tone-curve table (CURVE_LUT_SIZE × 1), uploaded when curves are set. */
  private readonly curveTexture: WebGLTexture;

  private constructor(
    private readonly canvas: RenderCanvas,
    private readonly gl: WebGL2RenderingContext,
  ) {
    this.developProgram = createProgram(gl, VERTEX_SHADER, DEVELOP_FRAGMENT_SHADER);
    this.geometryProgram = createProgram(gl, VERTEX_SHADER, GEOMETRY_FRAGMENT_SHADER);
    this.developUniforms = locate(gl, this.developProgram, DEVELOP_UNIFORMS);
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
    gl.deleteFramebuffer(target.framebuffer);
    gl.deleteTexture(target.texture);
    return { width: out.width, height: out.height, data };
  }

  dispose(): void {
    this.clearImage();
    this.releaseIntermediate();
    this.gl.deleteTexture(this.curveTexture);
    this.gl.deleteProgram(this.developProgram);
    this.gl.deleteProgram(this.geometryProgram);
  }

  private render(source: SizedTexture, params: PipelineParams, target: Target): void {
    if (isIdentityGeometry(params.geometry)) {
      this.developPass(source, params, target);
      return;
    }
    const intermediate = this.intermediateFor(source.width, source.height);
    this.developPass(source, params, { framebuffer: intermediate.framebuffer, width: source.width, height: source.height, flipY: false });
    this.geometryPass(intermediate, params, target);
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
    gl.drawArrays(gl.TRIANGLES, 0, 3);
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
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private bindTarget(target: Target): void {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, target.framebuffer);
    this.gl.viewport(0, 0, target.width, target.height);
  }

  private createTarget(width: number, height: number): SizedTexture & { framebuffer: WebGLFramebuffer } {
    const { gl } = this;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height);
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { texture, framebuffer, width, height };
  }

  /** Reused RGBA8 target for pass 1, recreated when the source size changes. */
  private intermediateFor(width: number, height: number) {
    const current = this.intermediate;
    if (current && current.width === width && current.height === height) return current;
    this.releaseIntermediate();
    this.intermediate = this.createTarget(width, height);
    return this.intermediate;
  }

  private releaseIntermediate(): void {
    if (!this.intermediate) return;
    this.gl.deleteFramebuffer(this.intermediate.framebuffer);
    this.gl.deleteTexture(this.intermediate.texture);
    this.intermediate = null;
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
