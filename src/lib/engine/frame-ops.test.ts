import { describe, expect, it } from 'vitest';
import { applyPixelOp, type Raster } from './frame-ops';

function raster(w: number, h: number, seed: number, alpha?: (i: number) => number): Raster {
	const data = new Uint8ClampedArray(w * h * 4);
	let s = seed;
	for (let i = 0; i < data.length; i += 4) {
		s = (Math.imul(s, 1103515245) + 12345) >>> 0;
		data[i] = s >>> 24;
		data[i + 1] = (s >>> 16) & 255;
		data[i + 2] = (s >>> 8) & 255;
		data[i + 3] = alpha ? alpha(i / 4) : 255;
	}
	return { data, width: w, height: h };
}

/** Straightforward premultiplied bilinear reference (canvas semantics). */
function refResize(src: Raster, dw: number, dh: number) {
	const out = new Uint8ClampedArray(dw * dh * 4);
	const px = (x: number, y: number, k: number) => src.data[(y * src.width + x) * 4 + k];
	for (let y = 0; y < dh; y++)
		for (let x = 0; x < dw; x++) {
			const fx = Math.max(0, ((x + 0.5) * src.width) / dw - 0.5);
			const fy = Math.max(0, ((y + 0.5) * src.height) / dh - 0.5);
			const x0 = Math.min(src.width - 1, Math.floor(fx));
			const y0 = Math.min(src.height - 1, Math.floor(fy));
			const x1 = Math.min(src.width - 1, x0 + 1);
			const y1 = Math.min(src.height - 1, y0 + 1);
			const wx = fx - x0;
			const wy = fy - y0;
			const pts: [number, number, number][] = [
				[x0, y0, (1 - wx) * (1 - wy)],
				[x1, y0, wx * (1 - wy)],
				[x0, y1, (1 - wx) * wy],
				[x1, y1, wx * wy]
			];
			let A = 0;
			const c = [0, 0, 0];
			for (const [px_, py, w] of pts) {
				const a = px(px_, py, 3) * w;
				A += a;
				for (let k = 0; k < 3; k++) c[k] += px(px_, py, k) * a;
			}
			const o = (y * dw + x) * 4;
			if (A > 0) for (let k = 0; k < 3; k++) out[o + k] = c[k] / A;
			out[o + 3] = A;
		}
	return out;
}

const maxDiff = (a: ArrayLike<number>, b: ArrayLike<number>) => {
	let m = 0;
	for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
	return m;
};

describe('frame ops', () => {
	it('resize matches the premultiplied bilinear reference (opaque, transparent, up/down)', () => {
		const cases: [Raster, number, number][] = [
			[raster(48, 36, 1), 24, 18],
			[raster(48, 36, 2), 31, 17],
			[raster(20, 15, 3), 47, 33],
			[raster(40, 30, 4, (i) => (i % 7 === 0 ? 0 : i % 5 === 0 ? 128 : 255)), 23, 19]
		];
		for (const [src, dw, dh] of cases) {
			const out = applyPixelOp(src, { kind: 'resize', width: dw, height: dh });
			expect([out.width, out.height]).toEqual([dw, dh]);
			// Clamped-array rounding may differ by one level
			expect(maxDiff(out.data, refResize(src, dw, dh))).toBeLessThanOrEqual(1);
		}
	});

	it('crop copies the exact sub-rectangle and pads outside with transparency', () => {
		const src = raster(10, 8, 5);
		const out = applyPixelOp(src, { kind: 'crop', rect: { x: 7, y: 6, width: 5, height: 4 } });
		expect([out.width, out.height]).toEqual([5, 4]);
		for (let y = 0; y < 4; y++)
			for (let x = 0; x < 5; x++)
				for (let k = 0; k < 4; k++) {
					const inside = x + 7 < 10 && y + 6 < 8;
					const expected = inside ? src.data[((y + 6) * 10 + x + 7) * 4 + k] : 0;
					expect(out.data[(y * 5 + x) * 4 + k]).toBe(expected);
				}
	});

	it('rotating four times by 90° (and flipping twice) is the identity', () => {
		const src = raster(7, 5, 6);
		let r = src;
		for (let i = 0; i < 4; i++)
			r = applyPixelOp(r, { kind: 'rotate', options: { degrees: 90, flipH: false, flipV: false } });
		expect(Array.from(r.data)).toEqual(Array.from(src.data));
		const once = applyPixelOp(src, {
			kind: 'rotate',
			options: { degrees: 0, flipH: true, flipV: true }
		});
		const half = applyPixelOp(src, {
			kind: 'rotate',
			options: { degrees: 180, flipH: false, flipV: false }
		});
		expect(Array.from(once.data)).toEqual(Array.from(half.data));
	});

	it('composite draws opaque pixels over the base', () => {
		const base = raster(4, 4, 7);
		const top = raster(4, 4, 8, (i) => (i % 2 ? 0 : 255));
		const out = applyPixelOp(top, { kind: 'composite', base: base.data });
		for (let i = 0; i < 16; i++) {
			const from = i % 2 ? base.data : top.data;
			expect(Array.from(out.data.slice(i * 4, i * 4 + 4))).toEqual(
				Array.from(from.slice(i * 4, i * 4 + 4))
			);
		}
	});
});
