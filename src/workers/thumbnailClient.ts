import type { RgbaImage } from '../render/gl';
import { THUMBNAIL_LONG_EDGE, type DecodeResult, type ThumbnailRequest, type ThumbnailResponse } from './thumbnailProtocol';

/** Omit that keeps each member of a union separate. */
type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;

type Pending = { resolve: (r: ThumbnailResponse & { ok: true }) => void; reject: (e: Error) => void };

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./thumbnail.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<ThumbnailResponse>) => {
    const res = e.data;
    const p = pending.get(res.id);
    pending.delete(res.id);
    if (!p) return;
    if (res.ok) p.resolve(res);
    else p.reject(new Error(res.error));
  };
  return worker;
}

function send(req: WithoutId<ThumbnailRequest>, transfer: Transferable[] = []): Promise<ThumbnailResponse & { ok: true }> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ ...req, id } as ThumbnailRequest, transfer);
  });
}

/** Decodes a photo file in the worker: oriented size, EXIF date and a JPEG thumbnail. */
export async function decodePhoto(blob: Blob): Promise<DecodeResult> {
  const res = await send({ kind: 'decode', blob, longEdge: THUMBNAIL_LONG_EDGE });
  if (res.kind !== 'decode') throw new Error('Unexpected worker response');
  return res.result;
}

/** Encodes rendered RGBA pixels (rows top-first) as a JPEG thumbnail in the worker. */
export async function encodeThumbnail(image: RgbaImage): Promise<Blob> {
  const pixels = image.data.slice().buffer;
  const res = await send({ kind: 'encode', width: image.width, height: image.height, pixels }, [pixels]);
  if (res.kind !== 'encode') throw new Error('Unexpected worker response');
  return res.blob;
}
