import type { FrameData } from '$lib/types';

export async function encodeGif(
	frames: FrameData[],
	width: number,
	height: number,
	options?: { maxColors?: number }
): Promise<Blob> {
	const { GIFEncoder, quantize, applyPalette } = await import('gifenc');
	const encoder = GIFEncoder();

	for (const frame of frames) {
		const { data } = frame.imageData;
		const palette = quantize(data, options?.maxColors ?? 256);
		const indexed = applyPalette(data, palette);
		encoder.writeFrame(indexed, width, height, {
			palette,
			delay: frame.delay,
			dispose: 2
		});
	}

	encoder.finish();
	const view = encoder.bytesView();
	return new Blob([view.buffer as ArrayBuffer], { type: 'image/gif' });
}
