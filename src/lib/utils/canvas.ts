export function imageDataToCanvas(imageData: ImageData): OffscreenCanvas {
	const canvas = new OffscreenCanvas(imageData.width, imageData.height);
	const ctx = canvas.getContext('2d')!;
	ctx.putImageData(imageData, 0, 0);
	return canvas;
}

export function drawImageDataToCanvas(
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
	imageData: ImageData,
	x: number = 0,
	y: number = 0
): void {
	ctx.putImageData(imageData, x, y);
}
