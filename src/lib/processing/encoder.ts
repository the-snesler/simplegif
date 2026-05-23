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

/**
 * Encode up to 5 evenly-spaced sample frames individually and return the
 * average bytes-per-pixel-per-frame. Used as a content-aware multiplier for
 * cheap size estimates without encoding the full GIF.
 */
export async function estimateCompressionRatio(
	frames: FrameData[],
	width: number,
	height: number,
	options?: EncodeOptions
): Promise<number> {
	const n = frames.length;
	if (n === 0 || width === 0 || height === 0) return 0;

	const raw = [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4), n - 1];
	const indices = [...new Set(raw.filter((i) => i >= 0 && i < n))];

	const { GIFEncoder, quantize, applyPalette } = await import('gifenc');
	const maxColors = options?.maxColors ?? 256;
	const dispose = options?.transparencyOptimized ? 1 : 2;

	let totalBytes = 0;
	for (const idx of indices) {
		const frame = frames[idx];
		const { data } = frame.imageData;
		const palette = quantize(data, maxColors);
		const indexed = applyPalette(data, palette);

		let hasTransparent = false;
		if (options?.transparencyOptimized) {
			for (let i = 3; i < data.length; i += 4) {
				if (data[i] === 0) {
					hasTransparent = true;
					break;
				}
			}
		}

		const encoder = GIFEncoder();
		encoder.writeFrame(indexed, width, height, {
			palette,
			delay: frame.delay,
			dispose,
			...(hasTransparent && { transparent: true, transparentIndex: 0 })
		});
		encoder.finish();
		totalBytes += encoder.bytesView().byteLength;
	}

	const pixelsPerFrame = width * height;
	return totalBytes / (indices.length * pixelsPerFrame);
}
