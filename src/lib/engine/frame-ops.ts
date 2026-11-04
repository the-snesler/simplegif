/**
 * Per-frame pixel operations. Pure functions of (pixels, size, params) so they
 * can run on any worker. Each returns a new buffer; inputs are never mutated.
 */
import type { CropRect, RotateOptions } from '$lib/types';
import { indexFrame } from '$lib/processing/codec/quantize';
import { encodeFrameImage } from '$lib/processing/codec/gif-writer';
import { allocPixels, clonePixels, type PixelArray } from './pixels';

export interface Raster {
	data: PixelArray;
	width: number;
	height: number;
}

export type PixelOp =
	| { kind: 'crop'; rect: CropRect }
	| { kind: 'resize'; width: number; height: number }
	| { kind: 'rotate'; options: RotateOptions }
	| { kind: 'posterize'; maxColors: number }
	| { kind: 'diffTransparent'; prev: PixelArray; threshold: number }
	| { kind: 'composite'; base: PixelArray };

// Reusable canvases keyed by size (per thread)
const canvases = new Map<string, OffscreenCanvasRenderingContext2D>();
function ctx2d(w: number, h: number, slot: string): OffscreenCanvasRenderingContext2D {
	const key = `${slot}:${w}x${h}`;
	let ctx = canvases.get(key);
	if (!ctx) {
		if (canvases.size > 8) canvases.clear();
		ctx = new OffscreenCanvas(w, h).getContext('2d', { willReadFrequently: true })!;
		canvases.set(key, ctx);
	}
	return ctx;
}

function readBack(ctx: OffscreenCanvasRenderingContext2D, w: number, h: number): Raster {
	return { data: clonePixels(ctx.getImageData(0, 0, w, h).data), width: w, height: h };
}

export function applyPixelOp(src: Raster, op: PixelOp): Raster {
	switch (op.kind) {
		case 'crop': {
			const { x, y, width, height } = op.rect;
			const out = allocPixels(width * height * 4);
			// Pure memory copy of the intersecting rows (pixels outside the source stay transparent)
			const x0 = Math.max(0, x);
			const x1 = Math.min(src.width, x + width);
			for (let row = 0; row < height; row++) {
				const sy = y + row;
				if (sy < 0 || sy >= src.height || x1 <= x0) continue;
				out.set(
					src.data.subarray((sy * src.width + x0) * 4, (sy * src.width + x1) * 4),
					(row * width + (x0 - x)) * 4
				);
			}
			return { data: out, width, height };
		}
		case 'resize':
			return resizeBilinear(src, op.width, op.height);
		case 'rotate':
			return rotate(src, op.options);
		case 'posterize': {
			if (op.maxColors >= 256) return { ...src, data: clonePixels(src.data) };
			const levels = Math.max(2, Math.round(Math.pow(op.maxColors, 1 / 3)));
			const step = 255 / (levels - 1);
			const lut = new Uint8Array(256);
			for (let v = 0; v < 256; v++) lut[v] = Math.round(Math.round(v / step) * step);
			const d = clonePixels(src.data);
			for (let j = 0; j < d.length; j += 4) {
				d[j] = lut[d[j]];
				d[j + 1] = lut[d[j + 1]];
				d[j + 2] = lut[d[j + 2]];
			}
			return { ...src, data: d };
		}
		case 'diffTransparent': {
			const d = clonePixels(src.data);
			const p = op.prev;
			const t = op.threshold;
			for (let j = 0; j < d.length; j += 4) {
				if (
					Math.abs(d[j] - p[j]) <= t &&
					Math.abs(d[j + 1] - p[j + 1]) <= t &&
					Math.abs(d[j + 2] - p[j + 2]) <= t
				) {
					d[j] = d[j + 1] = d[j + 2] = d[j + 3] = 0;
				}
			}
			return { ...src, data: d };
		}
		case 'composite': {
			// Draw `src` over `base` (GIF keep-disposal semantics: transparent pixels show base)
			const d = clonePixels(op.base);
			const s = src.data;
			for (let j = 0; j < d.length; j += 4) {
				if (s[j + 3] >= 128) {
					d[j] = s[j];
					d[j + 1] = s[j + 1];
					d[j + 2] = s[j + 2];
					d[j + 3] = s[j + 3];
				}
			}
			return { ...src, data: d };
		}
	}
}

/**
 * Bilinear resample with premultiplied-alpha weighting — the same filter the
 * canvas uses at the default smoothing quality, without the
 * putImageData/getImageData round trip (and it reads shared memory directly).
 */
function resizeBilinear(src: Raster, dw: number, dh: number): Raster {
	const { data: s, width: w, height: h } = src;
	const out = allocPixels(dw * dh * 4);
	const sx = w / dw;
	const sy = h / dh;
	const xa = new Int32Array(dw);
	const xb = new Int32Array(dw);
	const fx = new Float32Array(dw);
	for (let x = 0; x < dw; x++) {
		const f = Math.max(0, (x + 0.5) * sx - 0.5);
		const x0 = Math.min(w - 1, Math.floor(f));
		xa[x] = x0 * 4;
		xb[x] = Math.min(w - 1, x0 + 1) * 4;
		fx[x] = f - x0;
	}
	let o = 0;
	for (let y = 0; y < dh; y++) {
		const f = Math.max(0, (y + 0.5) * sy - 0.5);
		const y0 = Math.min(h - 1, Math.floor(f));
		const y1 = Math.min(h - 1, y0 + 1);
		const wy = f - y0;
		const r0 = y0 * w * 4;
		const r1 = y1 * w * 4;
		for (let x = 0; x < dw; x++, o += 4) {
			const wx = fx[x];
			const a = r0 + xa[x];
			const b = r0 + xb[x];
			const c = r1 + xa[x];
			const d = r1 + xb[x];
			const w00 = (1 - wx) * (1 - wy);
			const w10 = wx * (1 - wy);
			const w01 = (1 - wx) * wy;
			const w11 = wx * wy;
			if ((s[a + 3] & s[b + 3] & s[c + 3] & s[d + 3]) === 255) {
				// Fast path: all four neighbours opaque, plain weighted average
				out[o] = s[a] * w00 + s[b] * w10 + s[c] * w01 + s[d] * w11;
				out[o + 1] = s[a + 1] * w00 + s[b + 1] * w10 + s[c + 1] * w01 + s[d + 1] * w11;
				out[o + 2] = s[a + 2] * w00 + s[b + 2] * w10 + s[c + 2] * w01 + s[d + 2] * w11;
				out[o + 3] = 255;
				continue;
			}
			const A00 = s[a + 3] * w00;
			const A10 = s[b + 3] * w10;
			const A01 = s[c + 3] * w01;
			const A11 = s[d + 3] * w11;
			const A = A00 + A10 + A01 + A11;
			if (A <= 0) continue; // fully transparent (buffer is zero-initialized)
			const inv = 1 / A;
			out[o] = (s[a] * A00 + s[b] * A10 + s[c] * A01 + s[d] * A11) * inv;
			out[o + 1] = (s[a + 1] * A00 + s[b + 1] * A10 + s[c + 1] * A01 + s[d + 1] * A11) * inv;
			out[o + 2] = (s[a + 2] * A00 + s[b + 2] * A10 + s[c + 2] * A01 + s[d + 2] * A11) * inv;
			out[o + 3] = A;
		}
	}
	return { data: out, width: dw, height: dh };
}

/** Lossless 90° rotations and flips via index remapping (no canvas resampling). */
function rotate(src: Raster, o: RotateOptions): Raster {
	const { width: w, height: h } = src;
	const swap = o.degrees === 90 || o.degrees === 270;
	const ow = swap ? h : w;
	const oh = swap ? w : h;
	const s32 = new Uint32Array(src.data.buffer, src.data.byteOffset, w * h);
	const out = allocPixels(ow * oh * 4);
	const o32 = new Uint32Array(out.buffer, out.byteOffset, ow * oh);
	// Matches the previous canvas implementation: translate to centre, rotate, then scale(flip).
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			// flip in source space
			const fx = o.flipH ? w - 1 - x : x;
			const fy = o.flipV ? h - 1 - y : y;
			let dx: number, dy: number;
			switch (o.degrees) {
				case 90:
					dx = h - 1 - fy;
					dy = fx;
					break;
				case 180:
					dx = w - 1 - fx;
					dy = h - 1 - fy;
					break;
				case 270:
					dx = fy;
					dy = w - 1 - fx;
					break;
				default:
					dx = fx;
					dy = fy;
			}
			o32[dy * ow + dx] = s32[y * w + x];
		}
	}
	return { data: out, width: ow, height: oh };
}

export interface EncodedFrame {
	/** Image descriptor + local colour table + LZW data */
	image: Uint8Array;
	transparentIndex: number;
}

export function encodeRaster(src: Raster, maxColors: number): EncodedFrame {
	const indexed = indexFrame(src.data, maxColors, src.width);
	return {
		image: encodeFrameImage(indexed, src.width, src.height),
		transparentIndex: indexed.transparentIndex
	};
}

/** Decode an image file (PNG/JPEG/WebP/…) into RGBA at the given size (top-left aligned, no scaling). */
export async function decodeImageFile(
	blob: Blob,
	size?: { width: number; height: number }
): Promise<Raster> {
	const bitmap = await createImageBitmap(blob);
	const width = size?.width ?? bitmap.width;
	const height = size?.height ?? bitmap.height;
	const ctx = ctx2d(width, height, 'img');
	ctx.clearRect(0, 0, width, height);
	ctx.drawImage(bitmap, 0, 0);
	bitmap.close();
	return readBack(ctx, width, height);
}
