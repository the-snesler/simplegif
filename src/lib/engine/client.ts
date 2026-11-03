/**
 * Main-thread handle to the engine worker. Creates the engine and its helper
 * workers, wires helpers to the engine with MessageChannels, and mirrors the
 * engine's metadata/playback events into Svelte stores.
 */
import type { EditOp, EditResult, EngineEvent, EngineRequest, SourceInfo } from './protocol';
import { project } from '$lib/stores/project.svelte';
import { playback } from '$lib/stores/playback.svelte';

type Progress = (pct: number, text?: string) => void;

interface Pending {
	resolve: (v: unknown) => void;
	reject: (e: Error) => void;
	onProgress?: Progress;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function helperCount() {
	const cores = navigator.hardwareConcurrency || 4;
	// Leave a core for the main thread; the engine thread is mostly idle.
	return Math.max(1, Math.min(cores - 1, 8));
}

function onEvent(ev: EngineEvent) {
	switch (ev.type) {
		case 'reply': {
			const p = pending.get(ev.id);
			if (!p) return;
			pending.delete(ev.id);
			if (ev.ok) p.resolve(ev.result);
			else p.reject(new Error(ev.error));
			return;
		}
		case 'progress':
			pending.get(ev.id)?.onProgress?.(ev.pct, ev.text);
			return;
		case 'meta':
			project._sync(ev.meta);
			return;
		case 'frame':
			playback.currentFrame = ev.index;
			playback.isPlaying = ev.playing;
			return;
	}
}

function ensureEngine(): Worker {
	if (worker) return worker;
	const w = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
	w.onmessage = (e: MessageEvent<EngineEvent>) => onEvent(e.data);
	w.onerror = (e) => console.error('Engine worker error:', e.message);
	worker = w;

	const ports: MessagePort[] = [];
	const n = helperCount();
	for (let i = 0; i < n; i++) {
		try {
			const helper = new Worker(new URL('./helper.worker.ts', import.meta.url), {
				type: 'module'
			});
			const channel = new MessageChannel();
			helper.postMessage({ port: channel.port1 }, [channel.port1]);
			helper.onerror = (e) => {
				e.preventDefault();
				console.warn('Helper worker failed:', e.message);
				send({ type: 'helperDied', index: i });
			};
			ports.push(channel.port2);
		} catch (err) {
			console.warn('Could not start helper worker:', err);
			break;
		}
	}
	send({ type: 'init', helpers: ports }, ports);
	return w;
}

function send<T = void>(req: EngineRequest, transfer: Transferable[] = [], onProgress?: Progress) {
	const w = ensureEngine();
	const id = nextId++;
	return new Promise<T>((resolve, reject) => {
		pending.set(id, { resolve: resolve as (v: unknown) => void, reject, onProgress });
		w.postMessage({ id, req }, transfer);
	});
}

export const engine = {
	/** Start workers early (e.g. on page load) so the first import doesn't pay startup cost. */
	warmup() {
		ensureEngine();
	},
	loadGif(file: File, onProgress?: Progress) {
		return send({ type: 'loadGif', file, source: sourceOf(file) }, [], onProgress);
	},
	/** Native (WebCodecs) video import; resolves { native: false } if unsupported. */
	loadVideo(file: File, fps: number, onProgress?: Progress) {
		return send<{ native: boolean } | undefined>(
			{ type: 'loadVideo', file, fps, source: sourceOf(file) },
			[],
			onProgress
		);
	},
	loadImages(files: Blob[], fps: number, source: SourceInfo, onProgress?: Progress) {
		return send({ type: 'loadImages', files, fps, source }, [], onProgress);
	},
	loadRaw(
		raw: { buffer: ArrayBuffer; width: number; height: number; count: number },
		fps: number,
		source: SourceInfo
	) {
		return send({ type: 'loadRaw', ...raw, fps, source }, [raw.buffer]);
	},
	edit(edit: EditOp, onProgress?: Progress) {
		return send<EditResult | undefined>({ type: 'edit', edit }, [], onProgress);
	},
	undo: () => send({ type: 'undo' }),
	redo: () => send({ type: 'redo' }),
	reset: () => send({ type: 'reset' }),
	export(onProgress?: Progress) {
		return send<Blob>({ type: 'export' }, [], onProgress);
	},
	attachPreview(canvas: OffscreenCanvas) {
		return send({ type: 'attachPreview', canvas }, [canvas]);
	},
	attachStrip(canvas: OffscreenCanvas) {
		return send({ type: 'attachStrip', canvas }, [canvas]);
	},
	setStripWidth: (width: number) => send({ type: 'stripWidth', width }),
	play: () => send({ type: 'play' }),
	pause: () => send({ type: 'pause' }),
	seek(frame: number) {
		playback.currentFrame = frame;
		return send({ type: 'seek', frame });
	},
	setTrimBounds: (enabled: boolean, start: number, end: number) =>
		send({ type: 'trimBounds', enabled, start, end })
};

export function sourceOf(file: File): SourceInfo {
	return { name: file.name, type: file.type, size: file.size };
}
