/**
 * Fast colour quantization for GIF encoding.
 *
 * - `buildExactPalette` — lossless path for frames that already have few
 *   enough distinct colours (typical for frames that came from a GIF).
 * - `quantizeWu` — Xiaolin Wu's variance-minimizing quantizer ("Efficient
 *   Statistical Computations for Optimal Color Quantization", Graphics Gems II).
 *   O(pixels + 32³) per frame, vs. gifenc's pairwise-nearest-neighbour which
 *   is quadratic in the number of occupied colour bins and takes seconds on
 *   photographic/video frames.
 *
 * Pixels with alpha < 128 are treated as transparent and mapped to a reserved
 * palette index when present.
 */

export interface IndexedFrame {
	/** Flat RGB triples, length = 3 * colorCount */
	palette: Uint8Array;
	colorCount: number;
	indices: Uint8Array;
	/** Palette index used for transparent pixels, or -1 if the frame is fully opaque. */
	transparentIndex: number;
}

const ALPHA_THRESHOLD = 128;

/**
 * Index the frame losslessly if it has at most `maxColors` distinct opaque
 * colours (plus one slot for transparency, if needed). Returns null otherwise.
 */
export function buildExactPalette(rgba: Uint8ClampedArray, maxColors: number): IndexedFrame | null {
	const pixelCount = rgba.length >> 2;
	const indices = new Uint8Array(pixelCount);
	// Open-addressing hash table: key = 0xRRGGBB + 1 (0 = empty), value = index
	const TABLE = 1024;
	const keys = new Int32Array(TABLE);
	const vals = new Uint8Array(TABLE);
	const palette = new Uint8Array(256 * 3);
	let count = 0;
	let transparentIndex = -1;

	let lastKey = -1;
	let lastIdx = 0;
	for (let p = 0, o = 0; p < pixelCount; p++, o += 4) {
		if (rgba[o + 3] < ALPHA_THRESHOLD) {
			if (transparentIndex < 0) {
				if (count >= 256) return null;
				transparentIndex = count++;
			}
			indices[p] = transparentIndex;
			continue;
		}
		const key = ((rgba[o] << 16) | (rgba[o + 1] << 8) | rgba[o + 2]) + 1;
		if (key === lastKey) {
			indices[p] = lastIdx;
			continue;
		}
		let h = (Math.imul(key, 0x9e3779b1) >>> 22) & (TABLE - 1);
		while (true) {
			const k = keys[h];
			if (k === key) {
				lastIdx = vals[h];
				break;
			}
			if (k === 0) {
				if (count >= 256) return null;
				keys[h] = key;
				vals[h] = count;
				palette[count * 3] = rgba[o];
				palette[count * 3 + 1] = rgba[o + 1];
				palette[count * 3 + 2] = rgba[o + 2];
				lastIdx = count++;
				break;
			}
			h = (h + 1) & (TABLE - 1);
		}
		lastKey = key;
		indices[p] = lastIdx;
	}

	if (count > maxColors) return null;
	return { palette: palette.subarray(0, count * 3), colorCount: count, indices, transparentIndex };
}

// ---------------------------------------------------------------------------
// Wu quantizer
// ---------------------------------------------------------------------------

const SIDE = 33; // 32 levels per channel + 1 for the cumulative-moment base
const SIDE2 = SIDE * SIDE;
const TABLE_SIZE = SIDE * SIDE2;

interface Box {
	r0: number;
	r1: number;
	g0: number;
	g1: number;
	b0: number;
	b1: number;
	vol: number;
}

const DIR_R = 0;
const DIR_G = 1;
const DIR_B = 2;
type Dir = typeof DIR_R | typeof DIR_G | typeof DIR_B;

// Scratch buffers reused across calls (one quantization at a time per thread)
const wt = new Float64Array(TABLE_SIZE);
const mr = new Float64Array(TABLE_SIZE);
const mg = new Float64Array(TABLE_SIZE);
const mb = new Float64Array(TABLE_SIZE);
const m2 = new Float64Array(TABLE_SIZE);
const tag = new Uint8Array(TABLE_SIZE);
const areaW = new Float64Array(SIDE);
const areaR = new Float64Array(SIDE);
const areaG = new Float64Array(SIDE);
const areaB = new Float64Array(SIDE);
const area2 = new Float64Array(SIDE);

function vol(c: Box, m: Float64Array): number {
	return (
		m[c.r1 * SIDE2 + c.g1 * SIDE + c.b1] -
		m[c.r1 * SIDE2 + c.g1 * SIDE + c.b0] -
		m[c.r1 * SIDE2 + c.g0 * SIDE + c.b1] +
		m[c.r1 * SIDE2 + c.g0 * SIDE + c.b0] -
		m[c.r0 * SIDE2 + c.g1 * SIDE + c.b1] +
		m[c.r0 * SIDE2 + c.g1 * SIDE + c.b0] +
		m[c.r0 * SIDE2 + c.g0 * SIDE + c.b1] -
		m[c.r0 * SIDE2 + c.g0 * SIDE + c.b0]
	);
}

function bottom(c: Box, dir: Dir, m: Float64Array): number {
	switch (dir) {
		case DIR_R:
			return (
				-m[c.r0 * SIDE2 + c.g1 * SIDE + c.b1] +
				m[c.r0 * SIDE2 + c.g1 * SIDE + c.b0] +
				m[c.r0 * SIDE2 + c.g0 * SIDE + c.b1] -
				m[c.r0 * SIDE2 + c.g0 * SIDE + c.b0]
			);
		case DIR_G:
			return (
				-m[c.r1 * SIDE2 + c.g0 * SIDE + c.b1] +
				m[c.r1 * SIDE2 + c.g0 * SIDE + c.b0] +
				m[c.r0 * SIDE2 + c.g0 * SIDE + c.b1] -
				m[c.r0 * SIDE2 + c.g0 * SIDE + c.b0]
			);
		case DIR_B:
			return (
				-m[c.r1 * SIDE2 + c.g1 * SIDE + c.b0] +
				m[c.r1 * SIDE2 + c.g0 * SIDE + c.b0] +
				m[c.r0 * SIDE2 + c.g1 * SIDE + c.b0] -
				m[c.r0 * SIDE2 + c.g0 * SIDE + c.b0]
			);
	}
}

function top(c: Box, dir: Dir, pos: number, m: Float64Array): number {
	switch (dir) {
		case DIR_R:
			return (
				m[pos * SIDE2 + c.g1 * SIDE + c.b1] -
				m[pos * SIDE2 + c.g1 * SIDE + c.b0] -
				m[pos * SIDE2 + c.g0 * SIDE + c.b1] +
				m[pos * SIDE2 + c.g0 * SIDE + c.b0]
			);
		case DIR_G:
			return (
				m[c.r1 * SIDE2 + pos * SIDE + c.b1] -
				m[c.r1 * SIDE2 + pos * SIDE + c.b0] -
				m[c.r0 * SIDE2 + pos * SIDE + c.b1] +
				m[c.r0 * SIDE2 + pos * SIDE + c.b0]
			);
		case DIR_B:
			return (
				m[c.r1 * SIDE2 + c.g1 * SIDE + pos] -
				m[c.r1 * SIDE2 + c.g0 * SIDE + pos] -
				m[c.r0 * SIDE2 + c.g1 * SIDE + pos] +
				m[c.r0 * SIDE2 + c.g0 * SIDE + pos]
			);
	}
}

function variance(c: Box): number {
	const dr = vol(c, mr);
	const dg = vol(c, mg);
	const db = vol(c, mb);
	const w = vol(c, wt);
	return vol(c, m2) - (dr * dr + dg * dg + db * db) / w;
}

function maximize(
	c: Box,
	dir: Dir,
	first: number,
	last: number,
	wholeR: number,
	wholeG: number,
	wholeB: number,
	wholeW: number
): [number, number] {
	const baseR = bottom(c, dir, mr);
	const baseG = bottom(c, dir, mg);
	const baseB = bottom(c, dir, mb);
	const baseW = bottom(c, dir, wt);
	let max = 0;
	let cut = -1;
	for (let i = first; i < last; i++) {
		let halfR = baseR + top(c, dir, i, mr);
		let halfG = baseG + top(c, dir, i, mg);
		let halfB = baseB + top(c, dir, i, mb);
		let halfW = baseW + top(c, dir, i, wt);
		if (halfW === 0) continue;
		let temp = (halfR * halfR + halfG * halfG + halfB * halfB) / halfW;
		halfR = wholeR - halfR;
		halfG = wholeG - halfG;
		halfB = wholeB - halfB;
		halfW = wholeW - halfW;
		if (halfW === 0) continue;
		temp += (halfR * halfR + halfG * halfG + halfB * halfB) / halfW;
		if (temp > max) {
			max = temp;
			cut = i;
		}
	}
	return [max, cut];
}

function cut(set1: Box, set2: Box): boolean {
	const wholeR = vol(set1, mr);
	const wholeG = vol(set1, mg);
	const wholeB = vol(set1, mb);
	const wholeW = vol(set1, wt);

	const [maxR, cutR] = maximize(set1, DIR_R, set1.r0 + 1, set1.r1, wholeR, wholeG, wholeB, wholeW);
	const [maxG, cutG] = maximize(set1, DIR_G, set1.g0 + 1, set1.g1, wholeR, wholeG, wholeB, wholeW);
	const [maxB, cutB] = maximize(set1, DIR_B, set1.b0 + 1, set1.b1, wholeR, wholeG, wholeB, wholeW);

	let dir: Dir;
	if (maxR >= maxG && maxR >= maxB) {
		dir = DIR_R;
		if (cutR < 0) return false; // can't split
	} else if (maxG >= maxR && maxG >= maxB) {
		dir = DIR_G;
	} else {
		dir = DIR_B;
	}

	set2.r1 = set1.r1;
	set2.g1 = set1.g1;
	set2.b1 = set1.b1;
	switch (dir) {
		case DIR_R:
			set2.r0 = set1.r1 = cutR;
			set2.g0 = set1.g0;
			set2.b0 = set1.b0;
			break;
		case DIR_G:
			set2.g0 = set1.g1 = cutG;
			set2.r0 = set1.r0;
			set2.b0 = set1.b0;
			break;
		case DIR_B:
			set2.b0 = set1.b1 = cutB;
			set2.r0 = set1.r0;
			set2.g0 = set1.g0;
			break;
	}
	set1.vol = (set1.r1 - set1.r0) * (set1.g1 - set1.g0) * (set1.b1 - set1.b0);
	set2.vol = (set2.r1 - set2.r0) * (set2.g1 - set2.g0) * (set2.b1 - set2.b0);
	return true;
}

/**
 * Quantize opaque pixels to at most `maxColors` colours (one fewer if the
 * frame has transparent pixels, which get their own index).
 */
export function quantizeWu(rgba: Uint8ClampedArray, maxColors: number): IndexedFrame {
	const pixelCount = rgba.length >> 2;
	wt.fill(0);
	mr.fill(0);
	mg.fill(0);
	mb.fill(0);
	m2.fill(0);

	// 1. Histogram (5 bits per channel, offset by 1 for the moment base row)
	let hasTransparent = false;
	for (let o = 0; o < rgba.length; o += 4) {
		if (rgba[o + 3] < ALPHA_THRESHOLD) {
			hasTransparent = true;
			continue;
		}
		const r = rgba[o];
		const g = rgba[o + 1];
		const b = rgba[o + 2];
		const i = ((r >> 3) + 1) * SIDE2 + ((g >> 3) + 1) * SIDE + (b >> 3) + 1;
		wt[i] += 1;
		mr[i] += r;
		mg[i] += g;
		mb[i] += b;
		m2[i] += r * r + g * g + b * b;
	}

	// 2. Cumulative moments
	for (let r = 1; r < SIDE; r++) {
		areaW.fill(0);
		areaR.fill(0);
		areaG.fill(0);
		areaB.fill(0);
		area2.fill(0);
		for (let g = 1; g < SIDE; g++) {
			let lineW = 0,
				lineR = 0,
				lineG = 0,
				lineB = 0,
				line2 = 0;
			for (let b = 1; b < SIDE; b++) {
				const i1 = r * SIDE2 + g * SIDE + b;
				lineW += wt[i1];
				lineR += mr[i1];
				lineG += mg[i1];
				lineB += mb[i1];
				line2 += m2[i1];
				areaW[b] += lineW;
				areaR[b] += lineR;
				areaG[b] += lineG;
				areaB[b] += lineB;
				area2[b] += line2;
				const i2 = i1 - SIDE2;
				wt[i1] = wt[i2] + areaW[b];
				mr[i1] = mr[i2] + areaR[b];
				mg[i1] = mg[i2] + areaG[b];
				mb[i1] = mb[i2] + areaB[b];
				m2[i1] = m2[i2] + area2[b];
			}
		}
	}

	// 3. Recursive variance-minimizing splits
	const opaqueSlots = Math.max(1, Math.min(256, maxColors) - (hasTransparent ? 1 : 0));
	const boxes: Box[] = [{ r0: 0, r1: 32, g0: 0, g1: 32, b0: 0, b1: 32, vol: 0 }];
	const vv: number[] = [0];
	let k = opaqueSlots;
	let next = 0;
	for (let i = 1; i < k; i++) {
		const b: Box = { r0: 0, r1: 0, g0: 0, g1: 0, b0: 0, b1: 0, vol: 0 };
		if (cut(boxes[next], b)) {
			boxes.push(b);
			vv[next] = boxes[next].vol > 1 ? variance(boxes[next]) : 0;
			vv[i] = b.vol > 1 ? variance(b) : 0;
		} else {
			vv[next] = 0;
			i--;
		}
		next = 0;
		let temp = vv[0];
		for (let j = 1; j <= i; j++) {
			if (vv[j] > temp) {
				temp = vv[j];
				next = j;
			}
		}
		if (temp <= 0) {
			k = i + 1;
			break;
		}
	}
	k = Math.min(k, boxes.length);

	// 4. Palette = mean colour of each box; tag table maps histogram cells → index
	const palette = new Uint8Array((k + (hasTransparent ? 1 : 0)) * 3);
	let count = 0;
	for (let i = 0; i < k; i++) {
		const box = boxes[i];
		const w = vol(box, wt);
		if (w <= 0) continue;
		palette[count * 3] = Math.round(vol(box, mr) / w);
		palette[count * 3 + 1] = Math.round(vol(box, mg) / w);
		palette[count * 3 + 2] = Math.round(vol(box, mb) / w);
		for (let r = box.r0 + 1; r <= box.r1; r++) {
			for (let g = box.g0 + 1; g <= box.g1; g++) {
				const base = r * SIDE2 + g * SIDE;
				tag.fill(count, base + box.b0 + 1, base + box.b1 + 1);
			}
		}
		count++;
	}
	if (count === 0) {
		// Fully transparent (or empty) frame: still need one opaque palette entry
		count = 1;
	}
	const transparentIndex = hasTransparent ? count++ : -1;

	// 5. Map pixels
	const indices = new Uint8Array(pixelCount);
	for (let p = 0, o = 0; p < pixelCount; p++, o += 4) {
		if (rgba[o + 3] < ALPHA_THRESHOLD) {
			indices[p] = transparentIndex;
		} else {
			indices[p] =
				tag[
					((rgba[o] >> 3) + 1) * SIDE2 + ((rgba[o + 1] >> 3) + 1) * SIDE + (rgba[o + 2] >> 3) + 1
				];
		}
	}

	return { palette: palette.subarray(0, count * 3), colorCount: count, indices, transparentIndex };
}

/** Index a frame: lossless if possible, otherwise Wu quantization. */
export function indexFrame(rgba: Uint8ClampedArray, maxColors: number): IndexedFrame {
	return buildExactPalette(rgba, maxColors) ?? quantizeWu(rgba, maxColors);
}
