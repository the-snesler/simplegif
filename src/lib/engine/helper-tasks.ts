import type { HelperTask } from './protocol';
import { applyPixelOp, decodeImageFile, encodeRaster } from './frame-ops';
import { runGifsicleBytes } from './gifsicle-runner';

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
	if (result instanceof Uint8Array) return [result.buffer as ArrayBuffer];
	if (result && typeof result === 'object') {
		const r = result as { data?: Uint8ClampedArray; image?: Uint8Array };
		if (r.data instanceof Uint8ClampedArray) return [r.data.buffer as ArrayBuffer];
		if (r.image instanceof Uint8Array) return [r.image.buffer as ArrayBuffer];
	}
	return [];
}
