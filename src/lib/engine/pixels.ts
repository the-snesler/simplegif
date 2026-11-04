/**
 * Pixel buffer allocation. When the page is cross-origin isolated, frame
 * buffers live in SharedArrayBuffers so the engine and helper workers can pass
 * them around with zero copies (postMessage shares instead of cloning a
 * multi-megabyte buffer per frame per hop). Otherwise plain ArrayBuffers are
 * used and messages fall back to structured cloning.
 *
 * Frame buffers are immutable once published, so no Atomics are needed:
 * postMessage establishes the happens-before edge between writer and readers.
 */

export type PixelArray = Uint8ClampedArray<ArrayBufferLike>;

export const SHARED_MEMORY =
	typeof SharedArrayBuffer !== 'undefined' &&
	(globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === true;

export function allocPixels(byteLength: number): PixelArray {
	return SHARED_MEMORY
		? new Uint8ClampedArray(new SharedArrayBuffer(byteLength))
		: new Uint8ClampedArray(byteLength);
}

/** Copy into a newly allocated (shared, if available) buffer. */
export function clonePixels(src: ArrayLike<number> & { length: number }): PixelArray {
	const out = allocPixels(src.length);
	out.set(src);
	return out;
}

export function isShared(arr: ArrayBufferView): boolean {
	return typeof SharedArrayBuffer !== 'undefined' && arr.buffer instanceof SharedArrayBuffer;
}

// Reusable unshared scratch buffers for APIs that reject shared memory (ImageData)
const scratch = new Map<number, Uint8ClampedArray<ArrayBuffer>>();

/**
 * Wrap pixels in an ImageData. Shared buffers are copied into a reusable
 * scratch buffer (ImageData can't view shared memory), so the result is only
 * valid until the next call with the same size — use it immediately.
 */
export function toImageData(data: PixelArray, width: number, height: number): ImageData {
	if (!isShared(data)) return new ImageData(data as Uint8ClampedArray<ArrayBuffer>, width, height);
	let buf = scratch.get(data.length);
	if (!buf) {
		if (scratch.size > 4) scratch.clear();
		buf = new Uint8ClampedArray(data.length);
		scratch.set(data.length, buf);
	}
	buf.set(data);
	return new ImageData(buf, width, height);
}

/** Like toImageData but always returns an owned copy (safe to keep / hand to async APIs). */
export function toOwnedImageData(data: PixelArray, width: number, height: number): ImageData {
	const copy = new Uint8ClampedArray(data.length);
	copy.set(data);
	return new ImageData(copy, width, height);
}
