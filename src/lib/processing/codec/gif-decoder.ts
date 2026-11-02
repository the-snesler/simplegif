/**
 * Fast GIF decoder producing fully-composited RGBA frames.
 *
 * - LZW strings are written straight into the index buffer using a
 *   prefix/suffix/length dictionary (no per-pixel stack pushes).
 * - Palettes are pre-packed to Uint32 so each pixel is a single 32-bit store.
 * - Compositing follows GIF disposal semantics (none/keep, background,
 *   previous) in typed arrays; no canvas involved.
 * - Copy-on-write composite: a frame that fully covers the canvas without
 *   transparency is decoded into a fresh buffer, skipping a copy.
 */

export interface DecodedFrame {
	data: Uint8ClampedArray<ArrayBufferLike>;
	delay: number;
}

export interface DecodedGif {
	width: number;
	height: number;
	frames: DecodedFrame[];
}

interface FrameDesc {
	x: number;
	y: number;
	w: number;
	h: number;
	interlaced: boolean;
	/** Packed RGBA palette (platform byte order, matches a Uint32Array view of RGBA bytes) */
	palette: Uint32Array;
	transparent: number; // -1 if none
	disposal: number;
	delay: number;
	minCodeSize: number;
	/** Offset of the first data sub-block (after the LZW min code size byte) */
	dataOffset: number;
}

const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

function readPalette(bytes: Uint8Array, offset: number, count: number): Uint32Array {
	const pal = new Uint32Array(256);
	for (let i = 0; i < count && offset + i * 3 + 2 < bytes.length; i++) {
		const r = bytes[offset + i * 3];
		const g = bytes[offset + i * 3 + 1];
		const b = bytes[offset + i * 3 + 2];
		pal[i] = LITTLE_ENDIAN
			? (0xff000000 | (b << 16) | (g << 8) | r) >>> 0
			: ((r << 24) | (g << 16) | (b << 8) | 0xff) >>> 0;
	}
	return pal;
}

function skipSubBlocks(bytes: Uint8Array, p: number): number {
	while (p < bytes.length) {
		const n = bytes[p];
		p += 1 + n;
		if (n === 0) break;
	}
	return p;
}

/** Parse the block structure (cheap; no pixel decoding). */
function parseGif(bytes: Uint8Array): { width: number; height: number; frames: FrameDesc[] } {
	const sig = String.fromCharCode(...bytes.subarray(0, 6));
	if (sig !== 'GIF89a' && sig !== 'GIF87a') throw new Error('Not a GIF file');
	const width = bytes[6] | (bytes[7] << 8);
	const height = bytes[8] | (bytes[9] << 8);
	const packed = bytes[10];
	let p = 13;
	let globalPalette: Uint32Array | null = null;
	if (packed & 0x80) {
		const count = 1 << ((packed & 7) + 1);
		globalPalette = readPalette(bytes, p, count);
		p += count * 3;
	}

	const frames: FrameDesc[] = [];
	let gce = { disposal: 0, delay: 0, transparent: -1 };
	while (p < bytes.length) {
		const block = bytes[p++];
		if (block === 0x3b) break; // trailer
		if (block === 0x21) {
			const label = bytes[p++];
			if (label === 0xf9 && bytes[p] >= 4) {
				const flags = bytes[p + 1];
				gce = {
					disposal: (flags >> 2) & 7,
					delay: bytes[p + 2] | (bytes[p + 3] << 8),
					transparent: flags & 1 ? bytes[p + 4] : -1
				};
			}
			p = skipSubBlocks(bytes, p);
		} else if (block === 0x2c) {
			if (p + 9 > bytes.length) break;
			const x = bytes[p] | (bytes[p + 1] << 8);
			const y = bytes[p + 2] | (bytes[p + 3] << 8);
			const w = bytes[p + 4] | (bytes[p + 5] << 8);
			const h = bytes[p + 6] | (bytes[p + 7] << 8);
			const flags = bytes[p + 8];
			p += 9;
			let palette = globalPalette;
			if (flags & 0x80) {
				const count = 1 << ((flags & 7) + 1);
				palette = readPalette(bytes, p, count);
				p += count * 3;
			}
			const minCodeSize = bytes[p++];
			const dataOffset = p;
			p = skipSubBlocks(bytes, p);
			frames.push({
				x,
				y,
				w,
				h,
				interlaced: (flags & 0x40) !== 0,
				palette: palette ?? new Uint32Array(256),
				transparent: gce.transparent,
				disposal: gce.disposal,
				delay: gce.delay,
				minCodeSize,
				dataOffset
			});
			gce = { disposal: 0, delay: 0, transparent: -1 };
		} else {
			break; // unknown block: stop (truncated/corrupt file)
		}
	}
	return { width, height, frames };
}

// LZW dictionary (shared; decoding is single-threaded per worker)
const prefix = new Uint16Array(4096);
const suffix = new Uint8Array(4096);
const length = new Uint16Array(4096);

/**
 * Decode a frame's LZW stream into `out[0..pixelCount)`. Pixels the stream
 * doesn't reach are left untouched. Returns the number of pixels decoded.
 */
export function lzwDecode(
	bytes: Uint8Array,
	dataOffset: number,
	minCodeSize: number,
	out: Uint8Array,
	pixelCount: number
): number {
	minCodeSize = Math.min(11, Math.max(2, minCodeSize));
	const clear = 1 << minCodeSize;
	const eoi = clear + 1;
	for (let i = 0; i < clear; i++) {
		suffix[i] = i;
		length[i] = 1;
		prefix[i] = 0;
	}
	let codeSize = minCodeSize + 1;
	let codeMask = (1 << codeSize) - 1;
	let next = eoi + 1;
	let prev = -1;
	let pos = 0;

	let acc = 0;
	let bits = 0;
	let p = dataOffset;
	let blockEnd = p; // p points at a sub-block length byte
	const n = bytes.length;

	outer: while (pos < pixelCount) {
		while (bits < codeSize) {
			if (p >= blockEnd) {
				if (p >= n) break outer;
				const len = bytes[p++];
				if (len === 0) break outer;
				blockEnd = Math.min(n, p + len);
				continue;
			}
			acc |= bytes[p++] << bits;
			bits += 8;
		}
		const code = acc & codeMask;
		acc >>>= codeSize;
		bits -= codeSize;

		if (code === clear) {
			codeSize = minCodeSize + 1;
			codeMask = (1 << codeSize) - 1;
			next = eoi + 1;
			prev = -1;
			continue;
		}
		if (code === eoi) break;

		if (prev === -1) {
			if (code >= clear) break; // corrupt
			out[pos++] = code;
			prev = code;
			continue;
		}

		let len: number;
		let first: number;
		if (code < next) {
			const full = length[code];
			len = Math.min(full, pixelCount - pos);
			let c = code;
			for (let skip = full - len; skip > 0; skip--) c = prefix[c];
			for (let i = pos + len - 1; i > pos; i--) {
				out[i] = suffix[c];
				c = prefix[c];
			}
			first = suffix[c];
			out[pos] = first;
		} else if (code === next) {
			// KwKwK case: string(prev) + first char of string(prev)
			const plen = length[prev];
			let c = prev;
			for (let i = pos + plen - 1; i > pos; i--) {
				if (i < pixelCount) out[i] = suffix[c];
				c = prefix[c];
			}
			first = suffix[c];
			out[pos] = first;
			if (pos + plen < pixelCount) out[pos + plen] = first;
			len = Math.min(plen + 1, pixelCount - pos);
		} else {
			break; // corrupt
		}
		pos += len;

		if (next < 4096) {
			prefix[next] = prev;
			suffix[next] = first;
			length[next] = length[prev] + 1;
			next++;
			if (next === codeMask + 1 && codeSize < 12) {
				codeSize++;
				codeMask = (1 << codeSize) - 1;
			}
		}
		prev = code;
	}
	return pos;
}

const PASS_START = [0, 4, 2, 1];
const PASS_STEP = [8, 8, 4, 2];

/** Blit decoded indices for frame `f` onto the 32-bit canvas view. */
function blit(
	f: FrameDesc,
	indices: Uint8Array,
	canvas32: Uint32Array,
	width: number,
	height: number
) {
	const pal = f.palette;
	const trans = f.transparent;
	const x0 = f.x;
	const visibleW = Math.min(width, f.x + f.w) - x0;
	if (visibleW <= 0) return;

	let row = 0;
	let pass = 0;
	for (let r = 0; r < f.h; r++) {
		let ry = r;
		if (f.interlaced) {
			while (row >= f.h && pass < 3) {
				pass++;
				row = PASS_START[pass];
			}
			ry = row;
			row += PASS_STEP[pass];
		}
		const cy = f.y + ry;
		if (cy >= height) continue;
		let k = r * f.w;
		let o = cy * width + x0;
		if (trans < 0) {
			for (let x = 0; x < visibleW; x++) canvas32[o++] = pal[indices[k++]];
		} else {
			for (let x = 0; x < visibleW; x++, o++) {
				const idx = indices[k++];
				if (idx !== trans) canvas32[o] = pal[idx];
			}
		}
	}
}

let indexBuf = new Uint8Array(0);

/**
 * Incremental decoder: the block structure (frame count, size, delays) is
 * known up front; frames are composited one at a time via `next()`.
 */
export class GifDecoder {
	readonly width: number;
	readonly height: number;
	readonly delays: number[];
	private readonly descs: FrameDesc[];
	private readonly pixelBytes: number;
	private index = 0;
	// `composite` may alias the most recently emitted frame (copy-on-write)
	private composite: Uint8ClampedArray<ArrayBufferLike>;
	private shared = false;
	private readonly bytes: Uint8Array;
	private readonly alloc: (byteLength: number) => Uint8ClampedArray<ArrayBufferLike>;

	/** @param alloc allocator for frame buffers (e.g. SharedArrayBuffer-backed) */
	constructor(
		bytes: Uint8Array,
		alloc: (byteLength: number) => Uint8ClampedArray<ArrayBufferLike> = (n) =>
			new Uint8ClampedArray(n)
	) {
		this.bytes = bytes;
		this.alloc = alloc;
		const parsed = parseGif(bytes);
		this.width = parsed.width;
		this.height = parsed.height;
		this.descs = parsed.frames;
		this.delays = parsed.frames.map((f) => f.delay * 10);
		this.pixelBytes = this.width * this.height * 4;
		this.composite = alloc(this.pixelBytes);
	}

	private copy(src: Uint8ClampedArray<ArrayBufferLike>) {
		const out = this.alloc(src.length);
		out.set(src);
		return out;
	}

	get frameCount() {
		return this.descs.length;
	}

	get decodedCount() {
		return this.index;
	}

	next(): DecodedFrame | null {
		const f = this.descs[this.index];
		if (!f) return null;
		const { width, height, pixelBytes } = this;
		const count = f.w * f.h;
		if (indexBuf.length < count) indexBuf = new Uint8Array(count);
		// Pixels a truncated stream doesn't reach decode as index 0 (like omggif/browsers)
		indexBuf.fill(0, 0, count);
		lzwDecode(this.bytes, f.dataOffset, f.minCodeSize, indexBuf, count);

		const covers = f.x === 0 && f.y === 0 && f.w >= width && f.h >= height && f.transparent < 0;
		const saved = f.disposal === 3 ? this.composite : null;
		if (covers) {
			this.composite = this.alloc(pixelBytes);
		} else if (this.shared || saved) {
			this.composite = this.copy(this.composite);
		}
		blit(
			f,
			indexBuf,
			new Uint32Array(this.composite.buffer, this.composite.byteOffset, width * height),
			width,
			height
		);
		const frame = { data: this.composite, delay: f.delay * 10 };
		this.shared = true;

		if (f.disposal === 2) {
			// Restore to background (transparent) within the frame rect
			const c = this.copy(this.composite);
			const x0 = Math.max(0, f.x);
			const x1 = Math.min(width, f.x + f.w);
			const y1 = Math.min(height, f.y + f.h);
			for (let y = Math.max(0, f.y); y < y1; y++) {
				c.fill(0, (y * width + x0) * 4, (y * width + x1) * 4);
			}
			this.composite = c;
			this.shared = false;
		} else if (saved) {
			this.composite = saved;
			this.shared = true;
		}
		this.index++;
		return frame;
	}
}

export function decodeGifBytes(
	bytes: Uint8Array,
	alloc?: (byteLength: number) => Uint8ClampedArray<ArrayBufferLike>
): DecodedGif {
	const dec = new GifDecoder(bytes, alloc);
	const frames: DecodedFrame[] = [];
	for (let f = dec.next(); f; f = dec.next()) frames.push(f);
	return { width: dec.width, height: dec.height, frames };
}
