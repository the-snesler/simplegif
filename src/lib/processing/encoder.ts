import type { FrameData } from '$lib/types';

export interface EncodeOptions {
	maxColors?: number;
	/** Use dispose=1 (keep) instead of dispose=2 (restore to bg). Required for transparency optimization. */
	transparencyOptimized?: boolean;
}

export async function encodeGif(
	frames: FrameData[],
	width: number,
	height: number,
	options?: EncodeOptions
): Promise<Blob> {
	const { GIFEncoder, quantize, applyPalette } = await import('gifenc');
	const encoder = GIFEncoder();
	const maxColors = options?.maxColors ?? 256;
	const dispose = options?.transparencyOptimized ? 1 : 2;

	for (const frame of frames) {
		const { data } = frame.imageData;
		const palette = quantize(data, maxColors);
		const indexed = applyPalette(data, palette);

		// Detect if frame has transparent pixels
		let hasTransparent = false;
		if (options?.transparencyOptimized) {
			for (let i = 3; i < data.length; i += 4) {
				if (data[i] === 0) {
					hasTransparent = true;
					break;
				}
			}
		}

		encoder.writeFrame(indexed, width, height, {
			palette,
			delay: frame.delay,
			dispose,
			...(hasTransparent && { transparent: true, transparentIndex: 0 })
		});
	}

	encoder.finish();
	const view = encoder.bytesView();
	return new Blob([view.buffer as ArrayBuffer], { type: 'image/gif' });
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
