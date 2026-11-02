/**
 * Canvas-free GIF decoder: composites frames directly in typed arrays.
 * omggif's decodeAndBlitFrameRGBA writes only the frame's sub-rectangle and
 * skips transparent indices, so blitting into the running composite buffer
 * reproduces GIF "draw over" semantics without any canvas round trips.
 */
import { GifReader } from 'omggif';

export interface DecodedFrame {
	data: Uint8ClampedArray<ArrayBuffer>;
	delay: number;
}

export interface DecodedGif {
	width: number;
	height: number;
	frames: DecodedFrame[];
}

export function decodeGifBytes(
	bytes: Uint8Array,
	onFrame?: (index: number, total: number) => void
): DecodedGif {
	const reader = new GifReader(bytes);
	const width = reader.width;
	const height = reader.height;
	const total = reader.numFrames();
	const frames: DecodedFrame[] = [];
	let composite = new Uint8ClampedArray(width * height * 4);

	for (let i = 0; i < total; i++) {
		const info = reader.frameInfo(i);
		const saved = info.disposal === 3 ? composite.slice() : null;

		reader.decodeAndBlitFrameRGBA(i, composite);
		frames.push({ data: composite.slice(), delay: info.delay * 10 });

		if (info.disposal === 2) {
			// Restore to background (transparent) within the frame rect
			const x0 = Math.max(0, info.x);
			const x1 = Math.min(width, info.x + info.width);
			const y1 = Math.min(height, info.y + info.height);
			for (let y = Math.max(0, info.y); y < y1; y++) {
				composite.fill(0, (y * width + x0) * 4, (y * width + x1) * 4);
			}
		} else if (saved) {
			composite = saved;
		}
		onFrame?.(i, total);
	}

	return { width, height, frames };
}
