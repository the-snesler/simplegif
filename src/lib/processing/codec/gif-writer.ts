/**
 * Minimal streaming GIF89a writer built from independently-encoded frame
 * chunks. Every frame carries its own (minimal-size) local colour table and
 * the logical screen has no global table, so a frame's encoded image block
 * depends only on its pixels — not on its position, delay or disposal. That
 * lets the engine cache encoded frames across edits (reverse, trim, frame
 * rate, undo/redo…) and only re-encode frames whose pixels changed.
 */
import type { IndexedFrame } from './quantize';

class ByteStream {
	private buf: Uint8Array;
	private pos = 0;
	constructor(capacity: number) {
		this.buf = new Uint8Array(Math.max(256, capacity));
	}
	private ensure(extra: number) {
		if (this.pos + extra <= this.buf.length) return;
		let cap = this.buf.length * 2;
		while (cap < this.pos + extra) cap *= 2;
		const next = new Uint8Array(cap);
		next.set(this.buf.subarray(0, this.pos));
		this.buf = next;
	}
	writeByte(b: number) {
		this.ensure(1);
		this.buf[this.pos++] = b;
	}
	writeBytes(data: ArrayLike<number>, offset = 0, length = data.length) {
		this.ensure(length);
		for (let i = 0; i < length; i++) this.buf[this.pos++] = data[offset + i];
	}
	get position() {
		return this.pos;
	}
	/** Ensure `extra` writable bytes and expose the raw buffer for direct writes. */
	reserve(extra: number): { bytes: Uint8Array; offset: number } {
		this.ensure(extra);
		return { bytes: this.buf, offset: this.pos };
	}
	/** Advance the cursor after direct writes into a reserved region. */
	commit(position: number) {
		this.pos = position;
	}
	writeU16(v: number) {
		this.writeByte(v & 0xff);
		this.writeByte((v >> 8) & 0xff);
	}
	bytes(): Uint8Array {
		return this.buf.slice(0, this.pos);
	}
}

/** Number of bits needed for a colour table holding `count` entries (1..8). */
function tableBits(count: number): number {
	let bits = 1;
	while (1 << bits < count) bits++;
	return bits;
}

/** "GIF89a" + logical screen descriptor (no global table) + loop-forever extension. */
export function encodeGifHeader(width: number, height: number): Uint8Array {
	const s = new ByteStream(32);
	s.writeBytes([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); // GIF89a
	s.writeU16(width);
	s.writeU16(height);
	s.writeByte(0x70); // no GCT, colour resolution = 8 bits
	s.writeByte(0); // background colour index
	s.writeByte(0); // pixel aspect ratio
	// NETSCAPE2.0 application extension: loop forever
	s.writeBytes([0x21, 0xff, 0x0b]);
	s.writeBytes([0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30]);
	s.writeBytes([0x03, 0x01, 0x00, 0x00, 0x00]);
	return s.bytes();
}

/**
 * Graphic control extension for a frame.
 * @param delayMs display duration (rounded to centiseconds)
 * @param dispose 1 = keep, 2 = restore to background
 */
export function encodeGce(delayMs: number, dispose: number, transparentIndex: number): Uint8Array {
	const cs = Math.max(0, Math.min(0xffff, Math.round(delayMs / 10)));
	const hasT = transparentIndex >= 0;
	return new Uint8Array([
		0x21,
		0xf9,
		0x04,
		((dispose & 7) << 2) | (hasT ? 1 : 0),
		cs & 0xff,
		(cs >> 8) & 0xff,
		hasT ? transparentIndex : 0,
		0x00
	]);
}

// ---------------------------------------------------------------------------
// LZW encoder
//
// Dictionary lookups use a direct-indexed child table
// (code * alphabetSize + symbol → child code) instead of hash probing. Entries
// are stamped with a generation number so a CLEAR doesn't need to zero the
// table: stale entries simply fail the generation check.
// ---------------------------------------------------------------------------

const MAX_CODES = 4096;
let childTable = new Int32Array(0);
let generation = 0;

function lzwEncode(indices: Uint8Array, pixelCount: number, minCodeSize: number, out: ByteStream) {
	const alphabet = 1 << minCodeSize;
	const tableSize = MAX_CODES * alphabet;
	if (childTable.length < tableSize) {
		childTable = new Int32Array(tableSize);
		generation = 0;
	}
	const table = childTable;
	const clear = alphabet;
	const eoi = clear + 1;

	out.writeByte(minCodeSize);
	// Output: data sub-blocks of up to 255 bytes, written straight into the
	// stream's buffer. Worst case: one 12-bit code per pixel, plus CLEARs.
	const dataBytes = Math.ceil(((pixelCount + (pixelCount >> 10) + 4) * 12) / 8);
	const buf = out.reserve(dataBytes + Math.ceil(dataBytes / 255) + 16);
	const bytes = buf.bytes;
	let w = buf.offset;
	let blockStart = w++; // length byte placeholder
	let acc = 0;
	let bits = 0;

	let codeSize = minCodeSize + 1;
	let next = eoi + 1;
	if (++generation > 0x7ffff) {
		table.fill(0);
		generation = 1;
	}
	let gen = generation << 12;

	const emit = (code: number) => {
		acc |= code << bits;
		bits += codeSize;
		while (bits >= 8) {
			bytes[w++] = acc & 0xff;
			acc >>>= 8;
			bits -= 8;
			if (w - blockStart === 256) {
				bytes[blockStart] = 255;
				blockStart = w++;
			}
		}
	};

	emit(clear);
	if (pixelCount === 0) {
		emit(eoi);
	} else {
		let prefix = indices[0];
		for (let i = 1; i < pixelCount; i++) {
			const k = indices[i];
			const slot = prefix * alphabet + k;
			const entry = table[slot];
			if (entry >>> 12 === generation) {
				prefix = entry & 0xfff;
				continue;
			}
			emit(prefix);
			if (next < MAX_CODES) {
				table[slot] = gen | next;
				next++;
				if (next === (1 << codeSize) + 1 && codeSize < 12) codeSize++;
			} else {
				emit(clear);
				codeSize = minCodeSize + 1;
				next = eoi + 1;
				if (++generation > 0x7ffff) {
					table.fill(0);
					generation = 1;
				}
				gen = generation << 12;
			}
			prefix = k;
		}
		emit(prefix);
		emit(eoi);
	}
	if (bits > 0) {
		bytes[w++] = acc & 0xff;
		if (w - blockStart === 256) {
			bytes[blockStart] = 255;
			blockStart = w++;
		}
	}
	const tail = w - blockStart - 1;
	if (tail > 0) {
		bytes[blockStart] = tail;
		bytes[w++] = 0; // block terminator
	} else {
		bytes[blockStart] = 0; // empty block doubles as terminator
	}
	out.commit(w);
}

/** Image descriptor + local colour table + LZW-compressed pixels for one full-canvas frame. */
export function encodeFrameImage(frame: IndexedFrame, width: number, height: number): Uint8Array {
	const bits = tableBits(frame.colorCount);
	const tableLen = 1 << bits;
	const s = new ByteStream(((width * height) >> 1) + tableLen * 3 + 64);
	s.writeByte(0x2c);
	s.writeU16(0);
	s.writeU16(0);
	s.writeU16(width);
	s.writeU16(height);
	s.writeByte(0x80 | (bits - 1)); // local colour table present
	s.writeBytes(frame.palette, 0, frame.colorCount * 3);
	for (let i = frame.colorCount; i < tableLen; i++) {
		s.writeByte(0);
		s.writeByte(0);
		s.writeByte(0);
	}
	lzwEncode(frame.indices, width * height, Math.max(2, bits), s);
	return s.bytes();
}

export const GIF_TRAILER = new Uint8Array([0x3b]);
