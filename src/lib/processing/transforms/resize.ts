import type { FrameData } from '$lib/types';

export function resizeFrames(
	frames: FrameData[],
	targetWidth: number,
	targetHeight: number,
	onProgress?: (pct: number) => void
): FrameData[] {
	const result: FrameData[] = [];
	const canvas = new OffscreenCanvas(targetWidth, targetHeight);
	const ctx = canvas.getContext('2d')!;
	const srcCanvas = new OffscreenCanvas(frames[0]?.imageData.width ?? 0, frames[0]?.imageData.height ?? 0);
	const srcCtx = srcCanvas.getContext('2d')!;

	for (let i = 0; i < frames.length; i++) {
		srcCtx.putImageData(frames[i].imageData, 0, 0);
		ctx.clearRect(0, 0, targetWidth, targetHeight);
		ctx.drawImage(srcCanvas, 0, 0, targetWidth, targetHeight);

		result.push({
			imageData: ctx.getImageData(0, 0, targetWidth, targetHeight),
			delay: frames[i].delay
		});
		onProgress?.(((i + 1) / frames.length) * 100);
	}

	return result;
}
