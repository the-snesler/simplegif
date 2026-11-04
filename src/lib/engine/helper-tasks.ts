import type { HelperTask } from './protocol';
import { applyPixelOp, decodeImageFile, encodeRaster } from './frame-ops';
import { runGifsicleBytes } from './gifsicle-runner';
import { isShared } from './pixels';

/** Execute a helper task (on a helper worker, or on the engine as a fallback). */
export async function runHelperTask(task: HelperTask): Promise<unknown> {
	switch (task.t) {
		case 'pixel':
			return applyPixelOp(task.src, task.op);
		case 'encode':
			return encodeRaster(task.src, task.maxColors);
		case 'image':
			return decodeImageFile(task.blob, task.size);
		case 'gifsicle':
			return runGifsicleBytes(task.bytes, task.options);
	}
}

/** Buffers in a result that can be transferred back zero-copy. */
export function resultTransferables(result: unknown): Transferable[] {
	// Shared buffers are shared by postMessage, not transferred
	const buf = (v: ArrayBufferView) => (isShared(v) ? [] : [v.buffer as ArrayBuffer]);
	if (result instanceof Uint8Array) return buf(result);
	if (result && typeof result === 'object') {
		const r = result as { data?: Uint8ClampedArray; image?: Uint8Array };
		if (r.data instanceof Uint8ClampedArray) return buf(r.data);
		if (r.image instanceof Uint8Array) return buf(r.image);
	}
	return [];
}
