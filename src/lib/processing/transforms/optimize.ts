import type { FrameData, OptimizeOptions } from '$lib/types';

/**
 * Apply the selected optimization method to frames.
 * Each method is a pure function: FrameData[] → FrameData[].
 */
export function optimizeFrames(
	frames: FrameData[],
	options: OptimizeOptions,
	onProgress?: (pct: number) => void
): FrameData[] {
	switch (options.method) {
		case 'gifsicle':
			// Gifsicle runs on raw GIF binary, handled separately in the optimize page
			return frames;
		case 'color-reduction':
			return applyColorReduction(frames, options.maxColors, onProgress);
		case 'drop-frames':
			return applyDropFrames(frames, options.dropEveryN, onProgress);
		case 'deduplicate':
			return applyDeduplicate(frames, options.fuzzFactor, onProgress);
		case 'transparency':
			return applyTransparencyOptimization(frames, options.fuzzFactor, onProgress);
		case 'coalesce':
			return applyCoalesce(frames, onProgress);
	}
}

/**
 * Posterize frames to reduce unique colors, helping gifenc's quantize()
 * produce smaller output. Levels per channel derived from target color count.
 */
function applyColorReduction(
	frames: FrameData[],
	maxColors: number,
	onProgress?: (pct: number) => void
): FrameData[] {
	if (maxColors >= 256) return frames;

	const levelsPerChannel = Math.max(2, Math.round(Math.pow(maxColors, 1 / 3)));
	const step = 255 / (levelsPerChannel - 1);

	const result: FrameData[] = [];
	for (let i = 0; i < frames.length; i++) {
		const src = frames[i].imageData;
		const data = new Uint8ClampedArray(src.data);

		for (let j = 0; j < data.length; j += 4) {
			data[j] = Math.round(Math.round(data[j] / step) * step);
			data[j + 1] = Math.round(Math.round(data[j + 1] / step) * step);
			data[j + 2] = Math.round(Math.round(data[j + 2] / step) * step);
		}

		result.push({
			imageData: new ImageData(data, src.width, src.height),
			delay: frames[i].delay
		});
		onProgress?.(((i + 1) / frames.length) * 100);
	}

	return result;
}

/**
 * Drop every Nth frame, adding the dropped frame's delay to the
 * preceding kept frame so total animation duration is preserved.
 */
function applyDropFrames(
	frames: FrameData[],
	dropEveryN: number,
	onProgress?: (pct: number) => void
): FrameData[] {
	if (dropEveryN < 2 || frames.length <= 1) return frames;

	const result: FrameData[] = [];
	let accumulatedDelay = 0;

	for (let i = 0; i < frames.length; i++) {
		if ((i + 1) % dropEveryN === 0) {
			accumulatedDelay += frames[i].delay;
		} else {
			result.push({
				imageData: frames[i].imageData,
				delay: frames[i].delay + accumulatedDelay
			});
			accumulatedDelay = 0;
		}
		onProgress?.(((i + 1) / frames.length) * 100);
	}

	// Distribute any trailing accumulated delay to the last kept frame
	if (accumulatedDelay > 0 && result.length > 0) {
		const last = result[result.length - 1];
		result[result.length - 1] = { ...last, delay: last.delay + accumulatedDelay };
	}

	return result;
}

/**
 * Remove consecutive frames that are nearly identical, merging their delays.
 * Uses sampled pixel comparison for performance.
 */
function applyDeduplicate(
	frames: FrameData[],
	fuzzFactor: number,
	onProgress?: (pct: number) => void
): FrameData[] {
	if (frames.length <= 1) return frames;

	// fuzzFactor 0–100 → per-pixel RGB distance threshold 0–50
	const threshold = (fuzzFactor / 100) * 50;
	const result: FrameData[] = [{ ...frames[0] }];

	for (let i = 1; i < frames.length; i++) {
		if (areFramesSimilar(frames[i - 1].imageData.data, frames[i].imageData.data, threshold)) {
			const last = result[result.length - 1];
			result[result.length - 1] = { ...last, delay: last.delay + frames[i].delay };
		} else {
			result.push({ ...frames[i] });
		}
		onProgress?.(((i + 1) / frames.length) * 100);
	}

	return result;
}

/** Sample-based pixel similarity check between two RGBA buffers. */
function areFramesSimilar(a: Uint8ClampedArray, b: Uint8ClampedArray, threshold: number): boolean {
	if (a.length !== b.length) return false;

	const pixelCount = a.length / 4;
	const sampleSize = Math.min(pixelCount, 5000);
	const stride = Math.max(1, Math.floor(pixelCount / sampleSize));

	let totalDiff = 0;
	let samples = 0;

	for (let i = 0; i < pixelCount; i += stride) {
		const off = i * 4;
		const dr = a[off] - b[off];
		const dg = a[off + 1] - b[off + 1];
		const db = a[off + 2] - b[off + 2];
		totalDiff += Math.sqrt(dr * dr + dg * dg + db * db);
		samples++;
	}

	return totalDiff / samples <= threshold;
}

/**
 * Transparency optimization: for frames after the first, pixels that are
 * unchanged from the previous frame (within fuzz tolerance) become transparent.
 * This dramatically improves LZW compression for GIFs with large static areas.
 *
 * Important: the encoder must use dispose mode 1 (keep previous) for correct rendering.
 */
function applyTransparencyOptimization(
	frames: FrameData[],
	fuzzFactor: number,
	onProgress?: (pct: number) => void
): FrameData[] {
	if (frames.length <= 1) return frames;

	// fuzzFactor 0–100 → per-channel difference threshold 0–30
	const threshold = Math.round((fuzzFactor / 100) * 30);
	const result: FrameData[] = [frames[0]];

	for (let i = 1; i < frames.length; i++) {
		const prev = frames[i - 1].imageData;
		const curr = frames[i].imageData;
		const data = new Uint8ClampedArray(curr.data);

		for (let j = 0; j < data.length; j += 4) {
			const dr = Math.abs(data[j] - prev.data[j]);
			const dg = Math.abs(data[j + 1] - prev.data[j + 1]);
			const db = Math.abs(data[j + 2] - prev.data[j + 2]);

			if (dr <= threshold && dg <= threshold && db <= threshold) {
				data[j] = 0;
				data[j + 1] = 0;
				data[j + 2] = 0;
				data[j + 3] = 0;
			}
		}

		result.push({
			imageData: new ImageData(data, curr.width, curr.height),
			delay: frames[i].delay
		});
		onProgress?.(((i + 1) / frames.length) * 100);
	}

	return result;
}

/**
 * Coalesce: ensure every frame is a complete standalone image.
 * Undoes any transparency optimization by compositing each frame fully.
 * May increase file size but ensures maximum compatibility.
 */
function applyCoalesce(frames: FrameData[], onProgress?: (pct: number) => void): FrameData[] {
	const result: FrameData[] = [];
	const w = frames[0]?.imageData.width ?? 0;
	const h = frames[0]?.imageData.height ?? 0;
	const canvas = new OffscreenCanvas(w, h);
	const ctx = canvas.getContext('2d')!;

	for (let i = 0; i < frames.length; i++) {
		ctx.clearRect(0, 0, w, h);
		ctx.putImageData(frames[i].imageData, 0, 0);

		result.push({
			imageData: ctx.getImageData(0, 0, w, h),
			delay: frames[i].delay
		});
		onProgress?.(((i + 1) / frames.length) * 100);
	}

	return result;
}
