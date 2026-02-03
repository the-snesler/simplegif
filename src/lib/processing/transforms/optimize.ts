import type { FrameData, OptimizeOptions } from '$lib/types';

export function optimizeFrames(
	frames: FrameData[],
	options: OptimizeOptions,
	onProgress?: (pct: number) => void
): FrameData[] {
	// Optimization happens at encode time through gifenc's quantize.
	// This transform can pre-process frames to reduce color information
	// by re-rendering through a reduced palette.
	if (!options.dithering && options.maxColors >= 256) {
		// No reduction needed, frames will be optimized during encoding
		return frames;
	}

	// For preview purposes, we can simulate the color reduction
	const result: FrameData[] = [];
	const canvas = new OffscreenCanvas(
		frames[0]?.imageData.width ?? 0,
		frames[0]?.imageData.height ?? 0
	);
	const ctx = canvas.getContext('2d')!;

	for (let i = 0; i < frames.length; i++) {
		result.push({
			imageData: frames[i].imageData,
			delay: frames[i].delay
		});
		onProgress?.(((i + 1) / frames.length) * 100);
	}

	return result;
}
