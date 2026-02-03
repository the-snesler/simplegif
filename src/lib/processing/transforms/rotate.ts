import type { FrameData, RotateOptions } from '$lib/types';

export function rotateFrames(
	frames: FrameData[],
	options: RotateOptions,
	onProgress?: (pct: number) => void
): FrameData[] {
	if (frames.length === 0) return [];

	const srcW = frames[0].imageData.width;
	const srcH = frames[0].imageData.height;
	const swapDims = options.degrees === 90 || options.degrees === 270;
	const outW = swapDims ? srcH : srcW;
	const outH = swapDims ? srcW : srcH;

	const result: FrameData[] = [];
	const canvas = new OffscreenCanvas(outW, outH);
	const ctx = canvas.getContext('2d')!;
	const srcCanvas = new OffscreenCanvas(srcW, srcH);
	const srcCtx = srcCanvas.getContext('2d')!;

	for (let i = 0; i < frames.length; i++) {
		srcCtx.putImageData(frames[i].imageData, 0, 0);

		ctx.clearRect(0, 0, outW, outH);
		ctx.save();
		ctx.translate(outW / 2, outH / 2);

		if (options.degrees !== 0) {
			ctx.rotate((options.degrees * Math.PI) / 180);
		}

		const scaleX = options.flipH ? -1 : 1;
		const scaleY = options.flipV ? -1 : 1;
		ctx.scale(scaleX, scaleY);

		ctx.drawImage(srcCanvas, -srcW / 2, -srcH / 2);
		ctx.restore();

		result.push({
			imageData: ctx.getImageData(0, 0, outW, outH),
			delay: frames[i].delay
		});
		onProgress?.(((i + 1) / frames.length) * 100);
	}

	return result;
}
