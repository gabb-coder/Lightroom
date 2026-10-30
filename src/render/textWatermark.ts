/**
 * Text watermark (M24): draws one line of text, large, on a transparent
 * image in the app's own font (Inter, self-hosted). That image is then
 * placed and composited exactly like a logo (engine/watermark.ts), so the
 * export, the preview and every setting work the same for both. Canvas 2D
 * only draws the letters here; it never touches the photo.
 */
import { textShadowColor } from '../engine/watermark';
import type { WatermarkFont, WatermarkOptions } from '../model/exportOptions';

/** Font size the text is drawn at; the export scales it to the chosen size. */
export const TEXT_RASTER_PX = 240;
/** Keeps very long text inside canvas size limits. */
const MAX_RASTER_WIDTH = 8000;
/** Typefaces (M35): Inter is bundled; serif and monospace are the system's own (nothing loads from elsewhere). */
const FONT_FAMILIES: Readonly<Record<WatermarkFont, string>> = {
  sans: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif",
  serif: "Georgia, 'Times New Roman', Times, serif",
  mono: "ui-monospace, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
};

export interface TextImage {
  blob: Blob;
  width: number;
  height: number;
}

type TextStyle = Pick<WatermarkOptions, 'text' | 'textColor' | 'textShadow'> & Partial<Pick<WatermarkOptions, 'textFont' | 'textBold'>>;

function fontFor(style: TextStyle): (px: number) => string {
  const weight = style.textBold === false ? 400 : style.textFont && style.textFont !== 'sans' ? 700 : 600;
  return (px) => `${weight} ${px}px ${FONT_FAMILIES[style.textFont ?? 'sans']}`;
}

/** The text as a PNG with a transparent background, or null for blank text. */
export async function renderTextWatermark(style: TextStyle): Promise<TextImage | null> {
  const text = style.text.trim();
  if (!text) return null;
  const fontAt = fontFor(style);
  // Make sure the web font is ready, or the first export would use a fallback.
  await document.fonts.load(fontAt(TEXT_RASTER_PX), text).catch(() => undefined);
  const probe = new OffscreenCanvas(1, 1).getContext('2d');
  if (!probe) throw new Error('No 2D context for the text watermark');
  probe.font = fontAt(TEXT_RASTER_PX);
  const px = Math.max(8, Math.min(TEXT_RASTER_PX, Math.floor((TEXT_RASTER_PX * MAX_RASTER_WIDTH) / Math.max(1, probe.measureText(text).width))));
  probe.font = fontAt(px);
  const m = probe.measureText(text);
  // Room for the shadow's blur on every side.
  const pad = Math.ceil(px * (style.textShadow ? 0.14 : 0.04));
  const ascent = Math.ceil(m.actualBoundingBoxAscent);
  const descent = Math.ceil(m.actualBoundingBoxDescent);
  const left = Math.ceil(m.actualBoundingBoxLeft);
  const width = Math.max(1, Math.ceil(left + m.actualBoundingBoxRight) + 2 * pad);
  const height = Math.max(1, ascent + descent + 2 * pad);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D context for the text watermark');
  ctx.font = fontAt(px);
  ctx.fillStyle = style.textColor;
  if (style.textShadow) {
    ctx.shadowColor = textShadowColor(style.textColor);
    ctx.shadowBlur = px * 0.08;
    ctx.shadowOffsetY = px * 0.02;
  }
  ctx.fillText(text, pad + left, pad + ascent);
  return { blob: await canvas.convertToBlob({ type: 'image/png' }), width, height };
}
