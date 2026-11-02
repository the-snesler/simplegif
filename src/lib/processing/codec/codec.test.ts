import { describe, expect, it } from 'vitest';
import { GifReader } from 'omggif';
import { buildExactPalette, indexFrame, quantizeWu, type IndexedFrame } from './quantize';
import { encodeFrameImage, encodeGce, encodeGifHeader, GIF_TRAILER } from './gif-writer';
import { decodeGifBytes, lzwDecode } from './gif-decoder';

// ---------------------------------------------------------------- helpers

function rng(seed: number) {
	let s = seed >>> 0 || 1;
	return () => {
		s = (Math.imul(s, 1103515245) + 12345) >>> 0;
		return s / 0x100000000;
	};
}

function concat(parts: Uint8Array[]): Uint8Array {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let o = 0;
	for (const p of parts) {
		out.set(p, o);
		o += p.length;
	}
	return out;
}

function encodeGif(frames: IndexedFrame[], w: number, h: number, delay = 50): Uint8Array {
	const parts = [encodeGifHeader(w, h)];
	for (const f of frames)
		parts.push(encodeGce(delay, 2, f.transparentIndex), encodeFrameImage(f, w, h));
	parts.push(GIF_TRAILER);
	return concat(parts);
}

/** Reference compositor: omggif + the original app's disposal handling. */
function referenceDecode(bytes: Uint8Array) {
	const r = new GifReader(bytes);
	const W = r.width;
	const H = r.height;
	const frames: { data: Uint8ClampedArray; delay: number }[] = [];
	let comp = new Uint8ClampedArray(W * H * 4);
	for (let i = 0; i < r.numFrames(); i++) {
		const info = r.frameInfo(i);
		const prev = info.disposal === 3 ? comp.slice() : null;
		const px = new Uint8ClampedArray(W * H * 4);
		r.decodeAndBlitFrameRGBA(i, px);
		for (let j = 0; j < px.length; j += 4) {
			if (px[j + 3]) comp.set(px.subarray(j, j + 4), j);
		}
		frames.push({ data: comp.slice(), delay: info.delay * 10 });
		if (info.disposal === 2) {
			for (let y = info.y; y < Math.min(H, info.y + info.height); y++) {
				comp.fill(0, (y * W + info.x) * 4, (y * W + Math.min(W, info.x + info.width)) * 4);
			}
		} else if (prev) comp = prev;
	}
	return { width: W, height: H, frames };
}

/** Build a GIF by hand with sub-rectangles, disposal modes, interlacing and transparency. */
function handBuiltGif(): Uint8Array {
	const W = 13;
	const H = 11;
	const bytes: number[] = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, W, 0, H, 0, 0xf1, 0, 0];
	// 4-entry global palette
	bytes.push(255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255);
	bytes.push(
		0x21,
		0xff,
		0x0b,
		...'NETSCAPE2.0'.split('').map((c) => c.charCodeAt(0)),
		3,
		1,
		0,
		0,
		0
	);
	const frame = (
		x: number,
		y: number,
		w: number,
		h: number,
		disposal: number,
		trans: number,
		interlaced: boolean,
		seed: number
	) => {
		bytes.push(
			0x21,
			0xf9,
			4,
			(disposal << 2) | (trans >= 0 ? 1 : 0),
			7,
			0,
			trans >= 0 ? trans : 0,
			0
		);
		bytes.push(0x2c, x, 0, y, 0, w, 0, h, 0, interlaced ? 0x40 : 0);
		const r = rng(seed);
		const idx = new Uint8Array(w * h).map(() => Math.floor(r() * 4));
		const img = encodeFrameImage(
			{ palette: new Uint8Array(12), colorCount: 4, indices: idx, transparentIndex: -1 },
			w,
			h
		);
		// Strip our descriptor + local table (10 + 12 bytes); keep LZW min code size + data
		bytes.push(...img.subarray(10 + 12));
	};
	frame(0, 0, W, H, 1, -1, false, 1);
	frame(2, 3, 5, 4, 2, 3, false, 2);
	frame(4, 1, 7, 9, 3, 0, true, 3);
	frame(1, 1, 11, 9, 0, 2, true, 4);
	frame(0, 5, 13, 6, 1, -1, false, 5);
	bytes.push(0x3b);
	return new Uint8Array(bytes);
}

// ---------------------------------------------------------------- tests

describe('gif decoder', () => {
	it('matches the omggif-based reference on sub-rects, disposal, interlace and transparency', () => {
		const gif = handBuiltGif();
		const ref = referenceDecode(gif);
		const ours = decodeGifBytes(gif);
		expect(ours.width).toBe(ref.width);
		expect(ours.frames.length).toBe(ref.frames.length);
		ours.frames.forEach((f, i) => {
			expect(f.delay).toBe(ref.frames[i].delay);
			expect(Array.from(f.data)).toEqual(Array.from(ref.frames[i].data));
		});
	});

	it('keeps decodable frames from a truncated file', () => {
		const gif = handBuiltGif();
		const truncated = gif.subarray(0, gif.length - 40);
		const out = decodeGifBytes(truncated);
		expect(out.frames.length).toBeGreaterThan(0);
		expect(out.frames.length).toBeLessThanOrEqual(5);
	});
});

describe('gif writer + lzw', () => {
	it('round-trips random indexed frames exactly (fuzz)', () => {
		const r = rng(42);
		for (let iter = 0; iter < 60; iter++) {
			const w = 1 + Math.floor(r() * 90);
			const h = 1 + Math.floor(r() * 70);
			const colors = 1 + Math.floor(r() * 256);
			// Mix of noise and runs so we hit both dictionary growth and long strings
			const runny = r() < 0.5;
			const indices = new Uint8Array(w * h);
			let v = 0;
			for (let i = 0; i < indices.length; i++) {
				if (!runny || r() < 0.1) v = Math.floor(r() * colors);
				indices[i] = v;
			}
			const palette = new Uint8Array(colors * 3).map(() => Math.floor(r() * 256));
			const frame: IndexedFrame = { palette, colorCount: colors, indices, transparentIndex: -1 };
			const out = decodeGifBytes(encodeGif([frame], w, h));
			const ref = referenceDecode(encodeGif([frame], w, h));
			for (let p = 0; p < w * h; p++) {
				const c = indices[p];
				expect(out.frames[0].data[p * 4]).toBe(palette[c * 3]);
				expect(out.frames[0].data[p * 4 + 2]).toBe(palette[c * 3 + 2]);
			}
			expect(Array.from(out.frames[0].data)).toEqual(Array.from(ref.frames[0].data));
		}
	});

	it('handles streams long enough to need several CLEAR codes', () => {
		const r = rng(7);
		const w = 300;
		const h = 200;
		const indices = new Uint8Array(w * h).map(() => Math.floor(r() * 256));
		const palette = new Uint8Array(256 * 3).map((_, i) => i & 255);
		const gif = encodeGif([{ palette, colorCount: 256, indices, transparentIndex: -1 }], w, h);
		const decoded = new Uint8Array(w * h);
		// Locate the image data: header(13) + netscape(19) + gce(8) + descriptor(10) + table(768)
		const dataStart = 13 + 19 + 8 + 10 + 768;
		expect(gif[dataStart]).toBe(8); // min code size
		expect(lzwDecode(gif, dataStart + 1, 8, decoded, w * h)).toBe(w * h);
		expect(decoded).toEqual(indices);
	});

	it('writes transparency and delays that standard decoders read back', () => {
		const frame: IndexedFrame = {
			palette: new Uint8Array([10, 20, 30, 0, 0, 0]),
			colorCount: 2,
			indices: new Uint8Array([0, 1, 1, 0]),
			transparentIndex: 1
		};
		const gif = encodeGif([frame, frame], 2, 2, 120);
		const reader = new GifReader(gif);
		expect(reader.numFrames()).toBe(2);
		expect(reader.frameInfo(0).delay).toBe(12);
		expect(reader.frameInfo(0).transparent_index).toBe(1);
		const out = decodeGifBytes(gif);
		expect(Array.from(out.frames[0].data)).toEqual([
			10, 20, 30, 255, 0, 0, 0, 0, 0, 0, 0, 0, 10, 20, 30, 255
		]);
	});
});

describe('quantizer', () => {
	const W = 64;
	const H = 48;
	function image(seed: number, opts: { colors?: number; transparent?: boolean } = {}) {
		const r = rng(seed);
		const d = new Uint8ClampedArray(W * H * 4);
		for (let i = 0; i < d.length; i += 4) {
			if (opts.colors) {
				const c = Math.floor(r() * opts.colors);
				d[i] = (c * 37) & 255;
				d[i + 1] = (c * 91) & 255;
				d[i + 2] = (c * 53) & 255;
			} else {
				d[i] = Math.floor(r() * 256);
				d[i + 1] = Math.floor(r() * 256);
				d[i + 2] = Math.floor(r() * 256);
			}
			d[i + 3] = opts.transparent && r() < 0.2 ? 0 : 255;
		}
		return d;
	}

	it('indexes frames with few colours losslessly', () => {
		const d = image(1, { colors: 40, transparent: true });
		const q = indexFrame(d, 256, W);
		expect(q.colorCount).toBeLessThanOrEqual(41);
		for (let p = 0; p < W * H; p++) {
			if (d[p * 4 + 3] < 128) {
				expect(q.indices[p]).toBe(q.transparentIndex);
				continue;
			}
			const c = q.indices[p];
			expect([q.palette[c * 3], q.palette[c * 3 + 1], q.palette[c * 3 + 2]]).toEqual([
				d[p * 4],
				d[p * 4 + 1],
				d[p * 4 + 2]
			]);
		}
	});

	it('falls back to Wu when there are too many colours', () => {
		const d = image(2);
		expect(buildExactPalette(d, 256)).toBeNull();
		for (const maxColors of [2, 16, 255, 256]) {
			const q = quantizeWu(d, maxColors, W);
			expect(q.colorCount).toBeLessThanOrEqual(maxColors);
			for (const idx of q.indices) expect(idx).toBeLessThan(q.colorCount);
		}
	});

	it('reserves a transparent index within the colour budget', () => {
		const d = image(3, { transparent: true });
		const q = quantizeWu(d, 16, W);
		expect(q.colorCount).toBeLessThanOrEqual(16);
		expect(q.transparentIndex).toBeGreaterThanOrEqual(0);
		for (let p = 0; p < W * H; p++) {
			expect(q.indices[p] === q.transparentIndex).toBe(d[p * 4 + 3] < 128);
		}
	});

	it('handles fully transparent and single-colour frames', () => {
		const clear = new Uint8ClampedArray(W * H * 4);
		const q = quantizeWu(clear, 256, W);
		expect(q.indices.every((i) => i === q.transparentIndex)).toBe(true);
		const solid = new Uint8ClampedArray(W * H * 4).fill(200);
		const s = indexFrame(solid, 256, W);
		expect(s.colorCount).toBe(1);
	});
});
