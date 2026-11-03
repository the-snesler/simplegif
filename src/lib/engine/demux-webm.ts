/**
 * Minimal WebM/Matroska demuxer for the first video track: enough to feed
 * WebCodecs (VP8/VP9/AV1 SimpleBlocks and Blocks, including the
 * unknown-size Segment/Cluster elements MediaRecorder produces).
 */
import type { DemuxedVideo, DemuxedSample } from './video-decode';

const ID = {
	EBML: 0x1a45dfa3,
	Segment: 0x18538067,
	Info: 0x1549a966,
	TimecodeScale: 0x2ad7b1,
	Duration: 0x4489,
	Tracks: 0x1654ae6b,
	TrackEntry: 0xae,
	TrackNumber: 0xd7,
	TrackType: 0x83,
	CodecID: 0x86,
	CodecPrivate: 0x63a2,
	DefaultDuration: 0x23e383,
	Video: 0xe0,
	PixelWidth: 0xb0,
	PixelHeight: 0xba,
	Cluster: 0x1f43b675,
	Timecode: 0xe7,
	SimpleBlock: 0xa3,
	BlockGroup: 0xa0,
	Block: 0xa1,
	ReferenceBlock: 0xfb
};

/** Elements we descend into (master elements) */
const MASTER = new Set([
	ID.Segment,
	ID.Info,
	ID.Tracks,
	ID.TrackEntry,
	ID.Video,
	ID.Cluster,
	ID.BlockGroup
]);
/** Children that may appear at Segment level; an unknown-size Cluster ends when one of these starts */
const TOP_LEVEL = new Set([
	ID.Cluster,
	ID.Info,
	ID.Tracks,
	0x1c53bb6b, // Cues
	0x1043a770, // Chapters
	0x1254c367, // Tags
	0x114d9b74, // SeekHead
	0x1941a469 // Attachments
]);

function readVint(
	b: Uint8Array,
	p: number,
	keepMarker: boolean
): { value: number; length: number } | null {
	const first = b[p];
	if (first === undefined || first === 0) return null;
	let length = 1;
	while (!(first & (0x80 >> (length - 1)))) length++;
	if (length > 8 || p + length > b.length) return null;
	let value = keepMarker ? first : first & (0xff >> length);
	let allOnes = value === 0xff >> length;
	for (let i = 1; i < length; i++) {
		value = value * 256 + b[p + i];
		if (b[p + i] !== 0xff) allOnes = false;
	}
	return { value: !keepMarker && allOnes ? -1 : value, length }; // -1 = unknown size
}

function readUint(b: Uint8Array, p: number, n: number) {
	let v = 0;
	for (let i = 0; i < n; i++) v = v * 256 + b[p + i];
	return v;
}

function readFloat(b: Uint8Array, p: number, n: number) {
	const dv = new DataView(b.buffer, b.byteOffset + p, n);
	return n === 4 ? dv.getFloat32(0) : dv.getFloat64(0);
}

function vpxCodec(codecId: string, priv: Uint8Array | null): string | null {
	if (codecId === 'V_VP8') return 'vp8';
	if (codecId === 'V_MPEG4/ISO/AVC' && priv && priv.length >= 4) {
		const hex = (v: number) => v.toString(16).padStart(2, '0');
		return `avc1.${hex(priv[1])}${hex(priv[2])}${hex(priv[3])}`;
	}
	if (codecId === 'V_VP9') return 'vp09.00.10.08';
	if (codecId === 'V_AV1') {
		// av1C in CodecPrivate: seq_profile (3 bits) / level / tier / bitdepth
		if (priv && priv.length >= 4) {
			const profile = priv[1] >> 5;
			const level = priv[1] & 0x1f;
			const tier = priv[2] >> 7 ? 'H' : 'M';
			const highBit = (priv[2] >> 6) & 1;
			const twelve = (priv[2] >> 5) & 1;
			const depth = highBit ? (twelve ? 12 : 10) : 8;
			return `av01.${profile}.${String(level).padStart(2, '0')}${tier}.${String(depth).padStart(2, '0')}`;
		}
		return 'av01.0.04M.08';
	}
	return null;
}

export function demuxWebm(bytes: Uint8Array): DemuxedVideo | null {
	if (readUint(bytes, 0, 4) !== ID.EBML) return null;

	let timecodeScale = 1_000_000; // ns per tick
	let durationTicks = 0;
	let videoTrack = -1;
	let codecId = '';
	let codecPrivate: Uint8Array | null = null;
	let width = 0;
	let height = 0;
	let defaultDurationNs = 0;
	const samples: DemuxedSample[] = [];

	// Per-TrackEntry scratch (committed when the entry ends)
	let entry = { number: 0, type: 0, codec: '', priv: null as Uint8Array | null, w: 0, h: 0, dd: 0 };
	let clusterTime = 0;

	const handleBlock = (p: number, end: number, simple: boolean, keyFromGroup: boolean) => {
		const tn = readVint(bytes, p, false);
		if (!tn || tn.value !== videoTrack) return;
		p += tn.length;
		const rel = ((bytes[p] << 24) >> 16) | bytes[p + 1]; // signed 16-bit
		const flags = bytes[p + 2];
		p += 3;
		if (flags & 0x06) return; // lacing: not used for video in practice; skip
		const key = simple ? (flags & 0x80) !== 0 : keyFromGroup;
		const timeNs = (clusterTime + rel) * timecodeScale;
		samples.push({ data: bytes.subarray(p, end), timestampUs: timeNs / 1000, key });
	};

	// Iterative walk with an explicit stack of [end offset, id]
	const stack: { end: number; id: number }[] = [{ end: bytes.length, id: 0 }];
	let p = 0;
	while (p < bytes.length) {
		// Pop finished parents
		while (stack.length > 1 && p >= stack[stack.length - 1].end) {
			const done = stack.pop()!;
			if (done.id === ID.TrackEntry) {
				if (entry.type === 1 && videoTrack < 0) {
					videoTrack = entry.number;
					codecId = entry.codec;
					codecPrivate = entry.priv;
					width = entry.w;
					height = entry.h;
					defaultDurationNs = entry.dd;
				}
				entry = { number: 0, type: 0, codec: '', priv: null, w: 0, h: 0, dd: 0 };
			}
		}
		const idv = readVint(bytes, p, true);
		if (!idv) break;
		const sz = readVint(bytes, p + idv.length, false);
		if (!sz) break;
		const id = idv.value;
		const dataStart = p + idv.length + sz.length;
		const parentEnd = stack[stack.length - 1].end;

		// An unknown-size cluster ends when a sibling top-level element begins
		if (TOP_LEVEL.has(id) && stack[stack.length - 1].id === ID.Cluster) {
			stack.pop();
			continue;
		}

		const end = sz.value < 0 ? parentEnd : Math.min(parentEnd, dataStart + sz.value);
		if (MASTER.has(id)) {
			stack.push({ end, id });
			p = dataStart;
			continue;
		}
		const n = end - dataStart;
		switch (id) {
			case ID.TimecodeScale:
				timecodeScale = readUint(bytes, dataStart, n);
				break;
			case ID.Duration:
				durationTicks = readFloat(bytes, dataStart, n);
				break;
			case ID.TrackNumber:
				entry.number = readUint(bytes, dataStart, n);
				break;
			case ID.TrackType:
				entry.type = readUint(bytes, dataStart, n);
				break;
			case ID.CodecID:
				entry.codec = String.fromCharCode(...bytes.subarray(dataStart, end));
				break;
			case ID.CodecPrivate:
				entry.priv = bytes.subarray(dataStart, end);
				break;
			case ID.DefaultDuration:
				entry.dd = readUint(bytes, dataStart, n);
				break;
			case ID.PixelWidth:
				entry.w = readUint(bytes, dataStart, n);
				break;
			case ID.PixelHeight:
				entry.h = readUint(bytes, dataStart, n);
				break;
			case ID.Timecode:
				clusterTime = readUint(bytes, dataStart, n);
				break;
			case ID.SimpleBlock:
				handleBlock(dataStart, end, true, false);
				break;
			case ID.Block: {
				// Keyframe if the enclosing BlockGroup has no ReferenceBlock
				let hasRef = false;
				const groupEnd = stack[stack.length - 1].end;
				for (let q = end; q < groupEnd; ) {
					const i2 = readVint(bytes, q, true);
					const s2 = i2 && readVint(bytes, q + i2.length, false);
					if (!i2 || !s2 || s2.value < 0) break;
					if (i2.value === ID.ReferenceBlock) hasRef = true;
					q += i2.length + s2.length + s2.value;
				}
				handleBlock(dataStart, end, false, !hasRef);
				break;
			}
		}
		p = end;
	}

	const codec = vpxCodec(codecId, codecPrivate);
	if (videoTrack < 0 || !codec || samples.length === 0) return null;
	samples.sort((a, b) => a.timestampUs - b.timestampUs); // VPx has no B-frames; just in case
	const frameUs = defaultDurationNs
		? defaultDurationNs / 1000
		: samples.length > 1
			? (samples[samples.length - 1].timestampUs - samples[0].timestampUs) / (samples.length - 1)
			: 100_000;
	const endUs = Math.max(
		durationTicks ? (durationTicks * timecodeScale) / 1000 : 0,
		samples[samples.length - 1].timestampUs + frameUs
	);
	return {
		codec,
		description:
			(codecId === 'V_AV1' || codecId === 'V_MPEG4/ISO/AVC') && codecPrivate
				? codecPrivate
				: undefined,
		codedWidth: width,
		codedHeight: height,
		rotation: 0,
		samples,
		startUs: samples[0].timestampUs,
		endUs
	};
}
