import type { FrameData } from '$lib/types';
import { runTask } from './worker/pool';

export interface EncodeOptions {
	maxColors?: number;
	/** Use dispose=1 (keep) instead of dispose=2 (restore to bg). Required for transparency optimization. */
	transparencyOptimized?: boolean;
}

const GIF_TRAILER = new Uint8Array([0x3b]);

/**
 * Encode frames to a GIF. Each frame is quantized, palettized and LZW-encoded
 * independently across the worker pool, then the chunks are concatenated in order.
 */
export async function encodeGif(
	frames: FrameData[],
	width: number,
	height: number,
	options?: EncodeOptions,
	onProgress?: (pct: number) => void
): Promise<Blob> {
	const maxColors = options?.maxColors ?? 256;
	const transparencyOptimized = options?.transparencyOptimized ?? false;
	let completed = 0;

	const chunks = await Promise.all(
		frames.map(async (frame, index) => {
			const bytes = await runTask({
				op: 'encodeFrame',
				imageData: frame.imageData,
				width,
				height,
				delay: frame.delay,
				index,
				maxColors,
				transparencyOptimized
			});
			completed++;
			onProgress?.((completed / frames.length) * 100);
			return bytes;
		})
	);

	return new Blob([...chunks, GIF_TRAILER] as BlobPart[], { type: 'image/gif' });
}

/**
 * Encode frames and return the resulting blob size in bytes.
 * Useful for showing size estimates before the user commits to applying.
 */
export async function estimateGifSize(
	frames: FrameData[],
	width: number,
	height: number,
	options?: EncodeOptions
): Promise<number> {
	const blob = await encodeGif(frames, width, height, options);
	return blob.size;
}
