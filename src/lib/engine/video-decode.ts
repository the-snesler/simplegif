/**
 * Native video import via WebCodecs: demux (MP4/MOV with mp4box, WebM/MKV
 * with a small built-in demuxer), decode with VideoDecoder (hardware where
 * available), and sample frames at the target fps like ffmpeg's `fps` filter
 * (each output slot shows the latest frame whose timestamp rounds to ≤ it).
 *
 * Avoids downloading the ~31 MB ffmpeg.wasm core for common formats. Returns
 * null when the container/codec isn't supported so callers can fall back.
 */
import { clonePixels, type PixelArray } from './pixels';

export interface DemuxedSample {
	data: Uint8Array;
	timestampUs: number;
	key: boolean;
}

export interface DemuxedVideo {
	codec: string;
	description?: Uint8Array;
	codedWidth: number;
	codedHeight: number;
	/** Clockwise display rotation from container metadata */
	rotation: 0 | 90 | 180 | 270;
	/** In decode order */
	samples: DemuxedSample[];
	startUs: number;
	endUs: number;
}

export async function demux(bytes: Uint8Array): Promise<DemuxedVideo | null> {
	// ISO BMFF: 'ftyp' box near the start
	const isMp4 = bytes.length > 12 && String.fromCharCode(...bytes.subarray(4, 8)) === 'ftyp';
	if (isMp4) return demuxMp4(bytes);
	const { demuxWebm } = await import('./demux-webm');
	return demuxWebm(bytes);
}

async function demuxMp4(bytes: Uint8Array): Promise<DemuxedVideo | null> {
	const { createFile, DataStream, Endianness, MP4BoxBuffer } = await import('mp4box');
	const file = createFile();
	let result: DemuxedVideo | null = null;
	let error: string | null = null;
	const samples: DemuxedSample[] = [];
	let trackId = -1;
	let lastEndUs = 0;

	file.onError = (_module: string, message: string) => {
		error = message;
	};
	file.onReady = (info) => {
		const track = info.videoTracks[0];
		if (!track) return;
		trackId = track.id;
		const trak = file.getTrackById(track.id);
		const entry = trak.mdia.minf.stbl.stsd.entries[0] as unknown as Record<
			string,
			{ write(ds: InstanceType<typeof DataStream>): void } | undefined
		>;
		const box = entry.avcC ?? entry.hvcC ?? entry.vpcC ?? entry.av1C;
		let description: Uint8Array | undefined;
		if (box) {
			const ds = new DataStream(undefined, 0, Endianness.BIG_ENDIAN);
			box.write(ds);
			description = new Uint8Array(ds.buffer as ArrayBuffer, 8); // skip box header
		}
		const m = track.matrix as unknown as ArrayLike<number>;
		// Mirrored matrices (negative determinant) aren't a pure rotation; ignore them
		const mirrored = m[0] * m[4] - m[1] * m[3] < 0;
		const angle = mirrored ? 0 : (Math.round((Math.atan2(m[1], m[0]) * 180) / Math.PI) + 360) % 360;
		result = {
			codec: track.codec,
			description,
			codedWidth: track.video?.width ?? 0,
			codedHeight: track.video?.height ?? 0,
			rotation: ([0, 90, 180, 270].includes(angle) ? angle : 0) as DemuxedVideo['rotation'],
			samples,
			startUs: 0,
			endUs: 0
		};
		file.setExtractionOptions(track.id, null, { nbSamples: Infinity });
		file.start();
	};
	file.onSamples = (id, _user, batch) => {
		if (id !== trackId) return;
		for (const s of batch) {
			if (!s.data) continue;
			const ts = (s.cts * 1e6) / s.timescale;
			samples.push({ data: s.data, timestampUs: ts, key: s.is_sync });
			lastEndUs = Math.max(lastEndUs, ts + (s.duration * 1e6) / s.timescale);
		}
	};

	const ab =
		bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
			? (bytes.buffer as ArrayBuffer)
			: (bytes.slice().buffer as ArrayBuffer);
	file.appendBuffer(MP4BoxBuffer.fromArrayBuffer(ab, 0));
	file.flush();

	const r = result as DemuxedVideo | null;
	if (error || !r || samples.length === 0) return null;
	r.startUs = Math.min(...samples.slice(0, 64).map((s) => s.timestampUs));
	r.endUs = lastEndUs;
	return r;
}

export interface DecodeCallbacks {
	/** Called once, before the first frame, with output size and frame count */
	onStart(info: { width: number; height: number; count: number }): void;
	/** Called for each output slot in order; repeated slots reuse the same buffer */
	onFrame(data: PixelArray, slot: number): void;
	/** Return true to abort */
	cancelled(): boolean;
}

/**
 * Decode and sample. Resolves false if the codec config isn't supported
 * (nothing has been emitted in that case).
 */
export async function decodeVideo(
	video: DemuxedVideo,
	fps: number,
	cb: DecodeCallbacks
): Promise<boolean> {
	if (typeof VideoDecoder === 'undefined') return false;
	const config: VideoDecoderConfig = {
		codec: video.codec,
		codedWidth: video.codedWidth || undefined,
		codedHeight: video.codedHeight || undefined,
		description: video.description
	};
	try {
		const support = await VideoDecoder.isConfigSupported(config);
		if (!support.supported) return false;
	} catch {
		return false;
	}

	const count = Math.max(1, Math.round(((video.endUs - video.startUs) * fps) / 1e6));
	let width = 0;
	let height = 0;
	let ctx: OffscreenCanvasRenderingContext2D | null = null;
	let started = false;
	let nextSlot = 0;
	let last: VideoFrame | null = null;
	let failure: unknown = null;

	// Output size is fixed by the first frame; later frames with a different
	// resolution (e.g. MediaRecorder window capture) are scaled to it, like ffmpeg.
	let baseW = 0;
	let baseH = 0;
	const convert = (frame: VideoFrame): PixelArray => {
		if (!ctx) {
			baseW = frame.visibleRect?.width ?? frame.displayWidth;
			baseH = frame.visibleRect?.height ?? frame.displayHeight;
			const swap = video.rotation === 90 || video.rotation === 270;
			width = swap ? baseH : baseW;
			height = swap ? baseW : baseH;
			ctx = new OffscreenCanvas(width, height).getContext('2d', { willReadFrequently: true })!;
		}
		ctx.save();
		ctx.translate(width / 2, height / 2);
		ctx.rotate((video.rotation * Math.PI) / 180);
		ctx.drawImage(frame, -baseW / 2, -baseH / 2, baseW, baseH);
		ctx.restore();
		return clonePixels(ctx.getImageData(0, 0, width, height).data);
	};

	/** Emit `frame` for slots [nextSlot, upTo] */
	const emit = (frame: VideoFrame, upTo: number) => {
		upTo = Math.min(upTo, count - 1);
		if (upTo < nextSlot) return;
		const data = convert(frame);
		if (!started) {
			started = true;
			cb.onStart({ width, height, count });
		}
		for (; nextSlot <= upTo; nextSlot++) cb.onFrame(data, nextSlot);
	};

	const decoder = new VideoDecoder({
		output(frame) {
			try {
				if (cb.cancelled()) return frame.close();
				const slot = Math.round(((frame.timestamp - video.startUs) * fps) / 1e6);
				if (last) {
					emit(last, slot - 1);
					last.close();
				}
				last = frame;
			} catch (err) {
				failure = err;
				frame.close();
			}
		},
		error(err) {
			failure = err;
		}
	});
	decoder.configure(config);

	let sawKey = false;
	for (const s of video.samples) {
		if (cb.cancelled() || failure) break;
		if (!sawKey && !s.key) continue; // must start at a keyframe
		sawKey = true;
		decoder.decode(
			new EncodedVideoChunk({
				type: s.key ? 'key' : 'delta',
				timestamp: s.timestampUs,
				data: s.data
			})
		);
		// Light backpressure so a huge file doesn't queue everything at once
		if (decoder.decodeQueueSize > 32) {
			await new Promise<void>((resolve) =>
				decoder.addEventListener('dequeue', () => resolve(), { once: true })
			);
		}
	}
	try {
		if (!failure && !cb.cancelled()) await decoder.flush();
	} catch (err) {
		failure ??= err;
	}
	const tail = last as VideoFrame | null;
	if (tail) {
		if (!failure && !cb.cancelled()) emit(tail, count - 1);
		tail.close();
	}
	decoder.close();
	if (failure && !started) return false; // nothing emitted: let the caller fall back
	if (failure) throw failure instanceof Error ? failure : new Error(String(failure));
	return started;
}
