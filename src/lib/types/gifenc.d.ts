declare module 'gifenc' {
	export function GIFEncoder(): {
		writeFrame(
			index: Uint8Array,
			width: number,
			height: number,
			opts?: {
				palette?: number[][];
				delay?: number;
				dispose?: number;
				transparent?: boolean;
				transparentIndex?: number;
			}
		): void;
		finish(): void;
		bytesView(): Uint8Array;
		bytes(): Uint8Array;
	};

	export function quantize(
		rgba: Uint8Array | Uint8ClampedArray,
		maxColors: number,
		options?: { format?: string; oneBitAlpha?: boolean | number }
	): number[][];

	export function applyPalette(
		rgba: Uint8Array | Uint8ClampedArray,
		palette: number[][],
		format?: string
	): Uint8Array;

	export function nearestColorIndex(
		palette: number[][],
		pixel: [number, number, number, number]
	): number;

	export function nearestColor(
		palette: number[][],
		pixel: [number, number, number, number]
	): [number, number, number, number];

	export function snapColorsToPalette(
		palette: number[][],
		knownColors: number[][],
		threshold?: number
	): void;

	export function prequantize(
		rgba: Uint8Array | Uint8ClampedArray,
		options?: { roundRGB?: number; roundAlpha?: number; oneBitAlpha?: boolean | number }
	): void;
}
