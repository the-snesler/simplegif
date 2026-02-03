declare module 'omggif' {
	export class GifReader {
		width: number;
		height: number;

		constructor(buf: Uint8Array);
		numFrames(): number;
		frameInfo(frameIndex: number): {
			x: number;
			y: number;
			width: number;
			height: number;
			has_local_palette: boolean;
			palette_offset: number | null;
			palette_size: number | null;
			data_offset: number;
			data_length: number;
			transparent_index: number | null;
			interlaced: boolean;
			delay: number;
			disposal: number;
		};
		decodeAndBlitFrameRGBA(frameIndex: number, pixels: Uint8ClampedArray | Uint8Array): void;
	}

	export class GifWriter {
		constructor(
			buf: Uint8Array,
			width: number,
			height: number,
			opts?: { palette?: number[]; loop?: number }
		);
		addFrame(
			x: number,
			y: number,
			w: number,
			h: number,
			indexedPixels: number[],
			opts?: {
				palette?: number[];
				delay?: number;
				disposal?: number;
				transparent?: number;
			}
		): number;
		end(): number;
	}
}
