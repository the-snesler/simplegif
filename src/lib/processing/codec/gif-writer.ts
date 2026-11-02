/**
 * Minimal streaming GIF89a writer built from independently-encoded frame
 * chunks. Every frame carries its own (minimal-size) local colour table and
 * the logical screen has no global table, so a frame's encoded image block
 * depends only on its pixels — not on its position, delay or disposal. That
 * lets the engine cache encoded frames across edits (reverse, trim, frame
 * rate, undo/redo…) and only re-encode frames whose pixels changed.
 */
// gifenc ships no `exports` map; its LZW encoder is importable directly.
// @ts-expect-error -- untyped deep import
import lzwEncode from 'gifenc/src/lzwEncode.js';
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
	/** Used by gifenc's LZW encoder */
	writeBytesView(data: Uint8Array, offset = 0, length = data.byteLength) {
		this.ensure(length);
		this.buf.set(data.subarray(offset, offset + length), this.pos);
		this.pos += length;
	}
	bytesView(): Uint8Array {
		return this.buf.subarray(0, this.pos);
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
	lzwEncode(width, height, frame.indices, bits, s, accum, htab, codetab);
	return s.bytes();
}

// LZW scratch tables (shared across calls on this thread)
const accum = new Uint8Array(256);
const htab = new Int32Array(5003);
const codetab = new Int32Array(5003);

export const GIF_TRAILER = new Uint8Array([0x3b]);
