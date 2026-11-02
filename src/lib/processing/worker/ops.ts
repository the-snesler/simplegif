/**
 * Pure processing operations that can run either inside a Web Worker or on
 * the main thread (fallback). Keep this module free of DOM / Svelte imports.
 */
import type { CropRect, FrameData, OptimizeOptions, RotateOptions } from '../../types';
import { cropFrames } from '../transforms/crop';
import { resizeFrames } from '../transforms/resize';
import { rotateFrames } from '../transforms/rotate';
import { optimizeFrames } from '../transforms/optimize';
import { decodeGif } from '../decoder';

export interface EncodeFrameArgs {
	imageData: ImageData;
	width: number;
	height: number;
	delay: number;
	/** Frame 0 also writes the GIF header, logical screen descriptor and loop extension. */
	index: number;
	maxColors: number;
	transparencyOptimized: boolean;
}

export type OpRequest =
	| { op: 'crop'; frames: FrameData[]; rect: CropRect }
	| { op: 'resize'; frames: FrameData[]; width: number; height: number }
	| { op: 'rotate'; frames: FrameData[]; options: RotateOptions }
	| { op: 'optimize'; frames: FrameData[]; options: OptimizeOptions }
	| { op: 'decode'; buffer: ArrayBuffer }
	| ({ op: 'encodeFrame' } & EncodeFrameArgs)
	| { op: 'warmup' };

export interface OpResults {
	crop: FrameData[];
	resize: FrameData[];
	rotate: FrameData[];
	optimize: FrameData[];
	decode: { frames: FrameData[]; width: number; height: number };
	encodeFrame: Uint8Array;
	warmup: null;
}

export async function runOp(
	req: OpRequest,
	onProgress?: (pct: number) => void
): Promise<OpResults[OpRequest['op']]> {
	switch (req.op) {
		case 'crop':
			return cropFrames(req.frames, req.rect, onProgress);
		case 'resize':
			return resizeFrames(req.frames, req.width, req.height, onProgress);
		case 'rotate':
			return rotateFrames(req.frames, req.options, onProgress);
		case 'optimize':
			return optimizeFrames(req.frames, req.options, onProgress);
		case 'decode':
			return decodeGif(req.buffer);
		case 'encodeFrame':
			return encodeFrame(req);
		case 'warmup':
			// Pre-load the encoder so the first real task doesn't pay for it
			await import('gifenc');
			return null;
	}
}

/**
 * Quantize, palettize and LZW-encode a single frame into a standalone GIF
 * byte chunk. Concatenating chunks for frames 0..N-1 plus the trailer byte
 * (0x3B) yields a byte-identical file to gifenc's auto mode.
 */
async function encodeFrame(args: EncodeFrameArgs): Promise<Uint8Array> {
	const { GIFEncoder, quantize, applyPalette } = await import('gifenc');
	const { data } = args.imageData;
	const palette = quantize(data, args.maxColors);
	const indexed = applyPalette(data, palette);

	let hasTransparent = false;
	if (args.transparencyOptimized) {
		for (let i = 3; i < data.length; i += 4) {
			if (data[i] === 0) {
				hasTransparent = true;
				break;
			}
		}
	}

	const first = args.index === 0;
	const encoder = GIFEncoder({ auto: false });
	if (first) encoder.writeHeader();
	encoder.writeFrame(indexed, args.width, args.height, {
		palette,
		delay: args.delay,
		dispose: args.transparencyOptimized ? 1 : 2,
		first,
		...(hasTransparent && { transparent: true, transparentIndex: 0 })
	});
	return encoder.bytes();
}

/** Collect unique ArrayBuffers in a result so they can be transferred (zero-copy). */
export function collectTransferables(result: unknown): Transferable[] {
	const set = new Set<ArrayBuffer>();
	const addFrames = (frames: FrameData[]) => {
		for (const f of frames) set.add(f.imageData.data.buffer as ArrayBuffer);
	};
	if (result instanceof Uint8Array) {
		set.add(result.buffer as ArrayBuffer);
	} else if (Array.isArray(result)) {
		addFrames(result as FrameData[]);
	} else if (result && typeof result === 'object' && 'frames' in result) {
		addFrames((result as { frames: FrameData[] }).frames);
	}
	return [...set];
}
