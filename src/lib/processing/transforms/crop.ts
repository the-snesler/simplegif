import type { CropRect, FrameData } from '$lib/types';

export function cropFrames(
	frames: FrameData[],
	rect: CropRect,
	onProgress?: (pct: number) => void
): FrameData[] {
	const result: FrameData[] = [];
	const canvas = new OffscreenCanvas(rect.width, rect.height);
	const ctx = canvas.getContext('2d')!;
	const srcCanvas = new OffscreenCanvas(
		frames[0]?.imageData.width ?? 0,
		frames[0]?.imageData.height ?? 0
	);
	const srcCtx = srcCanvas.getContext('2d')!;

	for (let i = 0; i < frames.length; i++) {
		srcCtx.putImageData(frames[i].imageData, 0, 0);
		ctx.clearRect(0, 0, rect.width, rect.height);
		ctx.drawImage(
			srcCanvas,
			rect.x,
			rect.y,
			rect.width,
			rect.height,
			0,
			0,
			rect.width,
			rect.height
		);

		result.push({
			imageData: ctx.getImageData(0, 0, rect.width, rect.height),
			delay: frames[i].delay
		});
		onProgress?.(((i + 1) / frames.length) * 100);
	}

	return result;
}
