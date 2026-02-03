import type { FrameData } from '$lib/types';

export async function decodeGif(
	buffer: ArrayBuffer
): Promise<{ frames: FrameData[]; width: number; height: number }> {
	const { GifReader } = await import('omggif');
	const reader = new GifReader(new Uint8Array(buffer));
	const width = reader.width;
	const height = reader.height;
	const frames: FrameData[] = [];

	const compositeCanvas = new OffscreenCanvas(width, height);
	const compositeCtx = compositeCanvas.getContext('2d')!;

	for (let i = 0; i < reader.numFrames(); i++) {
		const info = reader.frameInfo(i);

		// Save composite state before drawing frame (for disposal method 3)
		const previousComposite =
			info.disposal === 3 ? compositeCtx.getImageData(0, 0, width, height) : null;

		// Decode frame pixels
		const pixels = new Uint8ClampedArray(width * height * 4);
		reader.decodeAndBlitFrameRGBA(i, pixels);

		// Create frame ImageData and draw onto composite
		const frameCanvas = new OffscreenCanvas(width, height);
		const frameCtx = frameCanvas.getContext('2d')!;
		frameCtx.putImageData(new ImageData(pixels, width, height), 0, 0);

		compositeCtx.drawImage(frameCanvas, 0, 0);

		// Capture the composited frame
		frames.push({
			imageData: compositeCtx.getImageData(0, 0, width, height),
			delay: info.delay * 10 // omggif returns centiseconds
		});

		// Handle disposal
		if (info.disposal === 2) {
			// Dispose to background: clear the frame area
			compositeCtx.clearRect(info.x, info.y, info.width, info.height);
		} else if (info.disposal === 3 && previousComposite) {
			// Restore to previous
			compositeCtx.putImageData(previousComposite, 0, 0);
		}
	}

	return { frames, width, height };
}

export function detectFileType(file: File): 'gif' | 'video' | 'image' | 'unknown' {
	if (file.type === 'image/gif') return 'gif';
	if (file.type.startsWith('video/')) return 'video';
	if (file.type.startsWith('image/')) return 'image';

	const ext = file.name.split('.').pop()?.toLowerCase();
	if (ext === 'gif') return 'gif';
	if (['mp4', 'webm', 'avi', 'mov', 'mkv', 'flv', 'wmv', 'ogv'].includes(ext ?? ''))
		return 'video';
	if (['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tiff'].includes(ext ?? '')) return 'image';

	return 'unknown';
}
