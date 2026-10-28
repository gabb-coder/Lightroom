import type { PipelineParams } from '../engine/pipeline';
import { createProgram, createTexture, type RgbaImage, type TextureSource } from './gl';
import { DEVELOP_FRAGMENT_SHADER, VERTEX_SHADER } from './shaders';

interface Uniforms {
  source: WebGLUniformLocation | null;
  flipY: WebGLUniformLocation | null;
  exposureGain: WebGLUniformLocation | null;
  contrastAmount: WebGLUniformLocation | null;
  saturationScale: WebGLUniformLocation | null;
}

interface SizedTexture {
  texture: WebGLTexture;
  width: number;
  height: number;
}

export type RenderCanvas = HTMLCanvasElement | OffscreenCanvas;

/**
 * Runs the develop pipeline on the GPU. Holds a full-resolution texture and
 * an optional downscaled proxy for interactive drags.
 */
export class Renderer {
  private readonly program: WebGLProgram;
  private readonly uniforms: Uniforms;
  private full: SizedTexture | null = null;
  private proxy: SizedTexture | null = null;

  private constructor(
    private readonly canvas: RenderCanvas,
    private readonly gl: WebGL2RenderingContext,
  ) {
    this.program = createProgram(gl, VERTEX_SHADER, DEVELOP_FRAGMENT_SHADER);
    const at = (name: string) => gl.getUniformLocation(this.program, name);
    this.uniforms = {
      source: at('u_source'),
      flipY: at('u_flipY'),
      exposureGain: at('u_exposureGain'),
      contrastAmount: at('u_contrastAmount'),
      saturationScale: at('u_saturationScale'),
    };
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
    return this.full !== null;
  }

  setImage(full: TextureSource, proxy: TextureSource | null): void {
    this.clearImage();
    this.full = this.upload(full);
    this.proxy = proxy ? this.upload(proxy) : null;
  }

  clearImage(): void {
    if (this.full) this.gl.deleteTexture(this.full.texture);
    if (this.proxy) this.gl.deleteTexture(this.proxy.texture);
    this.full = null;
    this.proxy = null;
  }

  /** Draws to the canvas, resizing it to the chosen source. Returns that size. */
  draw(params: PipelineParams, useProxy: boolean): { width: number; height: number } {
    const source = this.pickSource(useProxy);
    if (this.canvas.width !== source.width) this.canvas.width = source.width;
    if (this.canvas.height !== source.height) this.canvas.height = source.height;
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.run(source, params, true);
    return { width: source.width, height: source.height };
  }

  /** Renders into an offscreen RGBA8 framebuffer and reads it back, rows top-first. */
  readPixels(params: PipelineParams, useProxy = false): RgbaImage {
    const { gl } = this;
    const source = this.pickSource(useProxy);
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

  private pickSource(useProxy: boolean): SizedTexture {
    const source = useProxy && this.proxy ? this.proxy : this.full;
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
    gl.uniform1f(uniforms.exposureGain, params.exposureGain);
    gl.uniform1f(uniforms.contrastAmount, params.contrastAmount);
    gl.uniform1f(uniforms.saturationScale, params.saturationScale);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
