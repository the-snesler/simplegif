/**
 * Per-frame pixel operations. Pure functions of (pixels, size, params) so they
 * can run on any worker. Each returns a new buffer; inputs are never mutated.
 */
import type { CropRect, RotateOptions } from '$lib/types';
import { indexFrame } from '$lib/processing/codec/quantize';
import { encodeFrameImage } from '$lib/processing/codec/gif-writer';

export interface Raster {
	data: Uint8ClampedArray<ArrayBuffer>;
	width: number;
	height: number;
}

export type PixelOp =
	| { kind: 'crop'; rect: CropRect }
	| { kind: 'resize'; width: number; height: number }
	| { kind: 'rotate'; options: RotateOptions }
	| { kind: 'posterize'; maxColors: number }
	| { kind: 'diffTransparent'; prev: Uint8ClampedArray<ArrayBuffer>; threshold: number }
	| { kind: 'composite'; base: Uint8ClampedArray<ArrayBuffer> };

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

function sourceCanvas(src: Raster): OffscreenCanvas {
	const ctx = ctx2d(src.width, src.height, 'src');
	ctx.putImageData(new ImageData(src.data, src.width, src.height), 0, 0);
	return ctx.canvas;
}

function readBack(ctx: OffscreenCanvasRenderingContext2D, w: number, h: number): Raster {
	return { data: ctx.getImageData(0, 0, w, h).data, width: w, height: h };
}

export function applyPixelOp(src: Raster, op: PixelOp): Raster {
	switch (op.kind) {
		case 'crop': {
			const { x, y, width, height } = op.rect;
			const out = new Uint8ClampedArray(width * height * 4);
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
		case 'resize': {
			const ctx = ctx2d(op.width, op.height, 'dst');
			ctx.clearRect(0, 0, op.width, op.height);
			ctx.drawImage(sourceCanvas(src), 0, 0, op.width, op.height);
			return readBack(ctx, op.width, op.height);
		}
		case 'rotate':
			return rotate(src, op.options);
		case 'posterize': {
			if (op.maxColors >= 256) return { ...src, data: src.data.slice() };
			const levels = Math.max(2, Math.round(Math.pow(op.maxColors, 1 / 3)));
			const step = 255 / (levels - 1);
			const lut = new Uint8Array(256);
			for (let v = 0; v < 256; v++) lut[v] = Math.round(Math.round(v / step) * step);
			const d = src.data.slice();
			for (let j = 0; j < d.length; j += 4) {
				d[j] = lut[d[j]];
				d[j + 1] = lut[d[j + 1]];
				d[j + 2] = lut[d[j + 2]];
			}
			return { ...src, data: d };
		}
		case 'diffTransparent': {
			const d = src.data.slice();
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
			const d = op.base.slice();
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

/** Lossless 90° rotations and flips via index remapping (no canvas resampling). */
function rotate(src: Raster, o: RotateOptions): Raster {
	const { width: w, height: h } = src;
	const swap = o.degrees === 90 || o.degrees === 270;
	const ow = swap ? h : w;
	const oh = swap ? w : h;
	const s32 = new Uint32Array(src.data.buffer, src.data.byteOffset, w * h);
	const out = new Uint8ClampedArray(ow * oh * 4);
	const o32 = new Uint32Array(out.buffer);
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
	const indexed = indexFrame(src.data, maxColors);
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
