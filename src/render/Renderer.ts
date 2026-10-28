import type { PipelineParams } from '../engine/pipeline';
import { createProgram, createTexture, type RgbaImage, type TextureSource } from './gl';
import { DEVELOP_FRAGMENT_SHADER, VERTEX_SHADER } from './shaders';

const UNIFORM_NAMES = [
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
] as const;

type Uniforms = Record<(typeof UNIFORM_NAMES)[number], WebGLUniformLocation | null>;

/** Which uploaded copy of the photo to render. */
export type SourceKind = 'full' | 'proxy' | 'histogram';

interface SizedTexture {
  texture: WebGLTexture;
  width: number;
  height: number;
}

export type RenderCanvas = HTMLCanvasElement | OffscreenCanvas;

/**
 * Runs the develop pipeline on the GPU. Holds a full-resolution texture, a
 * downscaled proxy for interactive drags and a small copy for the histogram.
 */
export class Renderer {
  private readonly program: WebGLProgram;
  private readonly uniforms: Uniforms;
  private textures: Partial<Record<SourceKind, SizedTexture>> = {};

  private constructor(
    private readonly canvas: RenderCanvas,
    private readonly gl: WebGL2RenderingContext,
  ) {
    this.program = createProgram(gl, VERTEX_SHADER, DEVELOP_FRAGMENT_SHADER);
    const uniforms = {} as Uniforms;
    for (const name of UNIFORM_NAMES) uniforms[name] = gl.getUniformLocation(this.program, `u_${name}`);
    this.uniforms = uniforms;
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

  /** Draws to the canvas, resizing it to the chosen source. Returns that size. */
  draw(params: PipelineParams, kind: SourceKind): { width: number; height: number } {
    const source = this.pickSource(kind);
    if (this.canvas.width !== source.width) this.canvas.width = source.width;
    if (this.canvas.height !== source.height) this.canvas.height = source.height;
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.run(source, params, true);
    return { width: source.width, height: source.height };
  }

  /** Renders into an offscreen RGBA8 framebuffer and reads it back, rows top-first. */
  readPixels(params: PipelineParams, kind: SourceKind = 'full'): RgbaImage {
    const { gl } = this;
    const source = this.pickSource(kind);
    const target = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, target);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, source.width, source.height);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);

    this.run(source, params, false);
    const data = new Uint8Array(source.width * source.height * 4);
    gl.readPixels(0, 0, source.width, source.height, gl.RGBA, gl.UNSIGNED_BYTE, data);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo);
    gl.deleteTexture(target);
    return { width: source.width, height: source.height, data };
  }

  dispose(): void {
    this.clearImage();
    this.gl.deleteProgram(this.program);
  }

  private pickSource(kind: SourceKind): SizedTexture {
    const source = this.textures[kind] ?? this.textures.full;
    if (!source) throw new Error('No image loaded');
    return source;
  }

  private upload(source: TextureSource): SizedTexture {
    return { texture: createTexture(this.gl, source), width: source.width, height: source.height };
  }

  private run(source: SizedTexture, params: PipelineParams, flipY: boolean): void {
    const { gl, uniforms } = this;
    gl.viewport(0, 0, source.width, source.height);
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source.texture);
    gl.uniform1i(uniforms.source, 0);
    gl.uniform1i(uniforms.flipY, flipY ? 1 : 0);
    gl.uniform3f(uniforms.whiteBalance, ...params.whiteBalance);
    gl.uniform1f(uniforms.exposureGain, params.exposureGain);
    gl.uniform1f(uniforms.contrast, params.tone.contrast);
    gl.uniform1f(uniforms.highlights, params.tone.highlights);
    gl.uniform1f(uniforms.shadows, params.tone.shadows);
    gl.uniform1f(uniforms.whites, params.tone.whites);
    gl.uniform1f(uniforms.blacks, params.tone.blacks);
    gl.uniform1f(uniforms.vibrance, params.vibrance);
    gl.uniform1f(uniforms.saturationScale, params.saturationScale);
    gl.uniform1i(uniforms.bw, params.bw ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
