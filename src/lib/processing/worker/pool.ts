/**
 * Small Web Worker pool for frame processing. Tasks are queued and handed to
 * idle workers; each worker runs one task at a time. If workers are not
 * available (or fail to load), tasks run on the main thread via the same
 * `runOp` implementation.
 *
 * Inputs are structured-cloned (never transferred) because the caller's frames
 * are still referenced by the project and undo history. Results are
 * transferred back zero-copy.
 */
import { runOp, type OpRequest, type OpResults } from './ops';

interface Task {
	req: OpRequest;
	onProgress?: (pct: number) => void;
	resolve: (value: unknown) => void;
	reject: (err: Error) => void;
}

const MAX_WORKERS =
	typeof navigator !== 'undefined'
		? Math.max(1, Math.min(navigator.hardwareConcurrency || 4, 8))
		: 1;

const idle: Worker[] = [];
const queue: Task[] = [];
let workerCount = 0;
let workersBroken = typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined';

function createWorker(): Worker {
	return new Worker(new URL('./processing.worker.ts', import.meta.url), { type: 'module' });
}

function runLocal(task: Task) {
	runOp(task.req, task.onProgress).then(task.resolve, task.reject);
}

function dispatch() {
	while (queue.length > 0) {
		if (workersBroken) {
			runLocal(queue.shift()!);
			continue;
		}
		let worker = idle.pop();
		if (!worker) {
			if (workerCount >= MAX_WORKERS) return;
			try {
				worker = createWorker();
				workerCount++;
			} catch {
				workersBroken = true;
				continue;
			}
		}
		runOnWorker(worker, queue.shift()!);
	}
}

function runOnWorker(worker: Worker, task: Task) {
	const release = () => {
		worker.onmessage = null;
		worker.onerror = null;
	};

	worker.onmessage = (e: MessageEvent) => {
		const msg = e.data;
		if (msg.type === 'progress') {
			task.onProgress?.(msg.pct);
			return;
		}
		release();
		idle.push(worker);
		if (msg.type === 'done') task.resolve(msg.result);
		else task.reject(new Error(msg.message));
		dispatch();
	};

	// Fires when the worker script fails to load or throws outside our handler.
	// Retire the worker and fall back to the main thread for this and future tasks.
	worker.onerror = (e) => {
		e.preventDefault();
		release();
		worker.terminate();
		workerCount--;
		console.warn('Processing worker failed, falling back to main thread:', e.message);
		workersBroken = true;
		runLocal(task);
		dispatch();
	};

	worker.postMessage({ req: task.req });
}

/**
 * Spin up the full pool ahead of time (workers + encoder module) so the first
 * encode/transform doesn't pay worker startup cost. Safe to call repeatedly.
 */
export function warmupWorkers() {
	if (workersBroken) return;
	for (let i = workerCount; i < MAX_WORKERS; i++) {
		runTask({ op: 'warmup' }).catch(() => {});
	}
}

export function runTask<R extends OpRequest>(
	req: R,
	onProgress?: (pct: number) => void
): Promise<OpResults[R['op']]> {
	return new Promise((resolve, reject) => {
		queue.push({ req, onProgress, resolve: resolve as (v: unknown) => void, reject });
		dispatch();
	});
}
