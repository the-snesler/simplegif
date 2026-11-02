/// <reference lib="webworker" />
/**
 * The engine owns the project: decoded frames, undo/redo history, encoded-frame
 * cache, and the preview/filmstrip canvases (transferred from the page as
 * OffscreenCanvases). The main thread only ever sees metadata.
 *
 * Heavy per-frame work is fanned out to helper workers via `Pool`; the engine
 * thread itself stays light so preview playback never stalls.
 */
import type {
	EditOp,
	EditResult,
	EngineEvent,
	EngineRequest,
	ProjectMeta,
	RequestEnvelope,
	SourceInfo
} from './protocol';
import type { PixelOp, Raster } from './frame-ops';
import { applyPixelOp, type EncodedFrame } from './frame-ops';
import { Cancelled, Pool, type Priority } from './pool';
import { decodeGifBytes } from '$lib/processing/codec/gif-decoder';
import { encodeGce, encodeGifHeader, GIF_TRAILER } from '$lib/processing/codec/gif-writer';
import type { OptimizeOptions } from '$lib/types';

declare const self: DedicatedWorkerGlobalScope;

// ------------------------------------------------------------------ model

/** Immutable pixel buffer. Object identity is the cache key for encoded data. */
interface Pixels {
	readonly data: Uint8ClampedArray<ArrayBuffer>;
	readonly width: number;
	readonly height: number;
}

interface Frame {
	readonly px: Pixels;
	/** Display duration in ms */
	readonly delay: number;
	/**
	 * Frame only contains pixels that changed since the previous frame (rest is
	 * transparent) and must be drawn over it — produced by transparency optimization.
	 */
	readonly keep: boolean;
}

interface State {
	readonly frames: readonly Frame[];
	readonly width: number;
	readonly height: number;
	readonly frameRate: number;
	/** Exact GIF bytes for this state if known (unedited source file, gifsicle output). */
	readonly bytes: Uint8Array | null;
}

const MAX_COLORS = 256;
const PREENCODE_DELAY_MS = 250;

const pool = new Pool();
let source: SourceInfo | null = null;
let current: State | null = null;
let undoStack: State[] = [];
let redoStack: State[] = [];
let version = 0;

const encoded = new WeakMap<Pixels, EncodedFrame>();
const encoding = new WeakMap<Pixels, ReturnType<Pool['run']>>();

function post(ev: EngineEvent, transfer: Transferable[] = []) {
	self.postMessage(ev, transfer);
}

function pixels(r: Raster): Pixels {
	return { data: r.data, width: r.width, height: r.height };
}

function raster(px: Pixels): Raster {
	return { data: px.data, width: px.width, height: px.height };
}

function meta(): ProjectMeta {
	return {
		isLoaded: current !== null,
		source,
		width: current?.width ?? 0,
		height: current?.height ?? 0,
		frameRate: current?.frameRate ?? 10,
		frameCount: current?.frames.length ?? 0,
		duration: current?.frames.reduce((s, f) => s + f.delay, 0) ?? 0,
		canUndo: undoStack.length > 0,
		canRedo: redoStack.length > 0,
		version
	};
}

function setState(next: State | null, opts: { history: 'push' | 'clear' | 'none' }) {
	const prevCount = current?.frames.length ?? -1;
	if (opts.history === 'push' && current) {
		undoStack.push(current);
		redoStack = [];
	} else if (opts.history === 'clear') {
		undoStack = [];
		redoStack = [];
	}
	current = next;
	version++;
	pool.cancelLow();
	post({ type: 'meta', meta: meta() });
	preview.onStateChange(prevCount !== (next?.frames.length ?? -1) || opts.history === 'clear');
	strip.render();
	schedulePreencode();
}

// ------------------------------------------------------------------ helpers

function progressReporter(id: number, total: number, text?: string) {
	let done = 0;
	let lastPost = 0;
	return () => {
		done++;
		const now = performance.now();
		if (done === total || now - lastPost > 50) {
			lastPost = now;
			post({ type: 'progress', id, pct: (done / total) * 100, text });
		}
	};
}

/** Apply a pixel op to every frame in parallel across helpers. */
async function mapFrames(
	frames: readonly Frame[],
	makeOp: (frame: Frame, index: number) => PixelOp | null,
	id: number,
	text?: string
): Promise<Frame[]> {
	const tick = progressReporter(id, frames.length, text);
	return Promise.all(
		frames.map(async (f, i) => {
			const op = makeOp(f, i);
			if (!op) {
				tick();
				return f;
			}
			const out = await pool.run({ t: 'pixel', src: raster(f.px), op }).promise;
			tick();
			return { px: pixels(out), delay: f.delay, keep: f.keep };
		})
	);
}

/** Resolve keep-frames into full standalone frames (sequential dependency → done locally). */
function coalesce(frames: readonly Frame[]): readonly Frame[] {
	if (!frames.some((f) => f.keep)) return frames;
	let prev: Pixels | null = null;
	return frames.map((f) => {
		if (!f.keep || !prev) {
			prev = f.px;
			return f.keep ? { ...f, keep: false } : f;
		}
		const out = applyPixelOp(raster(f.px), { kind: 'composite', base: prev.data });
		prev = pixels(out);
		return { px: prev, delay: f.delay, keep: false };
	});
}

function encodeFrame(px: Pixels, priority: Priority): Promise<EncodedFrame> {
	const hit = encoded.get(px);
	if (hit) return Promise.resolve(hit);
	let job = encoding.get(px);
	if (job) {
		if (priority === 'high') pool.promote(job);
	} else {
		job = pool.run({ t: 'encode', src: raster(px), maxColors: MAX_COLORS }, priority);
		encoding.set(px, job);
		job.promise.then(
			(r) => {
				encoded.set(px, r as EncodedFrame);
				encoding.delete(px);
			},
			() => encoding.delete(px)
		);
	}
	return job.promise as Promise<EncodedFrame>;
}

async function encodeState(state: State, id?: number): Promise<Uint8Array> {
	if (state.bytes) return state.bytes;
	const tick =
		id !== undefined ? progressReporter(id, state.frames.length, 'Encoding GIF...') : null;
	const chunks = await Promise.all(
		state.frames.map((f) =>
			encodeFrame(f.px, 'high').then((e) => {
				tick?.();
				return e;
			})
		)
	);
	const parts: Uint8Array[] = [encodeGifHeader(state.width, state.height)];
	state.frames.forEach((f, i) => {
		const dispose = state.frames[i + 1]?.keep ? 1 : 2;
		parts.push(encodeGce(f.delay, dispose, chunks[i].transparentIndex), chunks[i].image);
	});
	parts.push(GIF_TRAILER);
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let o = 0;
	for (const p of parts) {
		out.set(p, o);
		o += p.length;
	}
	return out;
}

let preencodeTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePreencode() {
	if (preencodeTimer) clearTimeout(preencodeTimer);
	preencodeTimer = setTimeout(() => {
		preencodeTimer = null;
		const state = current;
		if (!state) return;
		for (const f of state.frames) {
			encodeFrame(f.px, 'low').catch((e) => {
				if (!(e instanceof Cancelled)) console.warn('pre-encode failed', e);
			});
		}
	}, PREENCODE_DELAY_MS);
}

function stateFromDecoded(
	decoded: {
		width: number;
		height: number;
		frames: { data: Uint8ClampedArray<ArrayBuffer>; delay: number }[];
	},
	frameRate: number,
	bytes: Uint8Array | null
): State {
	return {
		width: decoded.width,
		height: decoded.height,
		frameRate,
		bytes,
		frames: decoded.frames.map((f) => ({
			px: { data: f.data, width: decoded.width, height: decoded.height },
			delay: f.delay,
			keep: false
		}))
	};
}

// ------------------------------------------------------------------ loading

async function loadGif(id: number, file: Blob, src: SourceInfo) {
	const bytes = new Uint8Array(await file.arrayBuffer());
	let lastPost = 0;
	const decoded = decodeGifBytes(bytes, (i, total) => {
		const now = performance.now();
		if (now - lastPost > 50) {
			lastPost = now;
			post({ type: 'progress', id, pct: ((i + 1) / total) * 100, text: 'Decoding GIF...' });
		}
	});
	if (decoded.frames.length === 0) throw new Error('GIF has no frames');
	const avgDelay = decoded.frames.reduce((s, f) => s + f.delay, 0) / decoded.frames.length;
	source = src;
	setState(stateFromDecoded(decoded, Math.round(1000 / (avgDelay || 100)), bytes), {
		history: 'clear'
	});
}

async function loadImages(id: number, files: Blob[], fps: number, src: SourceInfo) {
	if (files.length === 0) throw new Error('No images');
	const first = await pool.run({ t: 'image', blob: files[0] }).promise;
	const size = { width: first.width, height: first.height };
	const tick = progressReporter(id, files.length, 'Processing images...');
	tick();
	const rest = await Promise.all(
		files.slice(1).map(async (blob) => {
			const r = await pool.run({ t: 'image', blob, size }).promise;
			tick();
			return r;
		})
	);
	const delay = files.length === 1 ? 100 : Math.round(1000 / fps);
	source = src;
	setState(
		{
			width: size.width,
			height: size.height,
			frameRate: fps,
			bytes: null,
			frames: [first, ...rest].map((r) => ({ px: pixels(r), delay, keep: false }))
		},
		{ history: 'clear' }
	);
}

function loadRaw(
	buffer: ArrayBuffer,
	width: number,
	height: number,
	count: number,
	fps: number,
	src: SourceInfo
) {
	const frameBytes = width * height * 4;
	const all = new Uint8ClampedArray(buffer);
	const delay = Math.round(1000 / fps);
	const frames: Frame[] = [];
	for (let i = 0; i < count; i++) {
		// Copy into its own buffer so each frame can be cloned/transferred independently
		const data = all.slice(i * frameBytes, (i + 1) * frameBytes);
		frames.push({ px: { data, width, height }, delay, keep: false });
	}
	if (frames.length === 0) throw new Error('Video produced no frames');
	source = src;
	setState({ width, height, frameRate: fps, bytes: null, frames }, { history: 'clear' });
}

// ------------------------------------------------------------------ edits

function framesSimilar(
	a: Uint8ClampedArray<ArrayBuffer>,
	b: Uint8ClampedArray<ArrayBuffer>,
	threshold: number
) {
	if (a.length !== b.length) return false;
	const pixelCount = a.length / 4;
	const stride = Math.max(1, Math.floor(pixelCount / Math.min(pixelCount, 5000)));
	let total = 0;
	let samples = 0;
	for (let i = 0; i < pixelCount; i += stride) {
		const o = i * 4;
		const dr = a[o] - b[o];
		const dg = a[o + 1] - b[o + 1];
		const db = a[o + 2] - b[o + 2];
		total += Math.sqrt(dr * dr + dg * dg + db * db);
		samples++;
	}
	return total / samples <= threshold;
}

async function optimize(id: number, s: State, o: OptimizeOptions): Promise<Partial<State>> {
	switch (o.method) {
		case 'color-reduction':
			if (o.maxColors >= 256) return {};
			return {
				frames: await mapFrames(s.frames, () => ({ kind: 'posterize', maxColors: o.maxColors }), id)
			};
		case 'drop-frames': {
			const frames = coalesce(s.frames);
			if (o.dropEveryN < 2 || frames.length <= 1) return {};
			const out: Frame[] = [];
			let acc = 0;
			frames.forEach((f, i) => {
				if ((i + 1) % o.dropEveryN === 0) acc += f.delay;
				else {
					out.push({ ...f, delay: f.delay + acc });
					acc = 0;
				}
			});
			if (acc > 0 && out.length)
				out[out.length - 1] = { ...out[out.length - 1], delay: out[out.length - 1].delay + acc };
			return { frames: out };
		}
		case 'deduplicate': {
			const frames = coalesce(s.frames);
			if (frames.length <= 1) return {};
			const threshold = (o.fuzzFactor / 100) * 50;
			const out: Frame[] = [frames[0]];
			for (let i = 1; i < frames.length; i++) {
				if (framesSimilar(frames[i - 1].px.data, frames[i].px.data, threshold)) {
					const last = out[out.length - 1];
					out[out.length - 1] = { ...last, delay: last.delay + frames[i].delay };
				} else out.push(frames[i]);
			}
			return { frames: out };
		}
		case 'transparency': {
			const frames = coalesce(s.frames);
			if (frames.length <= 1) return {};
			const threshold = Math.round((o.fuzzFactor / 100) * 30);
			const out = await mapFrames(
				frames,
				(_, i) =>
					i === 0 ? null : { kind: 'diffTransparent', prev: frames[i - 1].px.data, threshold },
				id
			);
			return { frames: out.map((f, i) => (i === 0 ? f : { ...f, keep: true })) };
		}
		case 'coalesce':
			return { frames: [...coalesce(s.frames)] };
		case 'gifsicle':
			return {};
	}
}

async function edit(id: number, e: EditOp): Promise<EditResult | undefined> {
	const s = current;
	if (!s) throw new Error('No project loaded');
	let next: Partial<State> = {};
	let result: EditResult | undefined;

	switch (e.op) {
		case 'crop': {
			const rect = {
				x: Math.round(e.rect.x),
				y: Math.round(e.rect.y),
				width: Math.max(1, Math.round(e.rect.width)),
				height: Math.max(1, Math.round(e.rect.height))
			};
			next = {
				frames: await mapFrames(s.frames, () => ({ kind: 'crop', rect }), id),
				width: rect.width,
				height: rect.height
			};
			break;
		}
		case 'resize': {
			const width = Math.max(1, Math.round(e.width));
			const height = Math.max(1, Math.round(e.height));
			next = {
				frames: await mapFrames(s.frames, () => ({ kind: 'resize', width, height }), id),
				width,
				height
			};
			break;
		}
		case 'rotate': {
			const swap = e.options.degrees === 90 || e.options.degrees === 270;
			next = {
				frames: await mapFrames(s.frames, () => ({ kind: 'rotate', options: e.options }), id),
				width: swap ? s.height : s.width,
				height: swap ? s.width : s.height
			};
			break;
		}
		case 'trim':
			next = { frames: coalesce(s.frames).slice(e.start, e.end + 1) };
			break;
		case 'reverse':
			next = { frames: [...coalesce(s.frames)].reverse() };
			break;
		case 'framerate': {
			const delay = Math.round(1000 / e.fps);
			next = { frames: s.frames.map((f) => ({ ...f, delay })), frameRate: e.fps };
			break;
		}
		case 'skip':
			next = { frames: coalesce(s.frames).filter((_, i) => i % e.keepEveryN === 0) };
			break;
		case 'optimize':
			next = await optimize(id, s, e.options);
			break;
		case 'gifsicle': {
			post({ type: 'progress', id, pct: 0, text: 'Encoding GIF for gifsicle...' });
			const input = await encodeState(s);
			post({ type: 'progress', id, pct: 25, text: 'Running gifsicle...' });
			const output = await pool.run({ t: 'gifsicle', bytes: input, options: e.options }).promise;
			post({ type: 'progress', id, pct: 75, text: 'Updating preview...' });
			const decoded = decodeGifBytes(output);
			const state = stateFromDecoded(decoded, s.frameRate, output);
			result = { beforeSize: input.length, afterSize: output.length };
			setState(state, { history: 'push' });
			return result;
		}
	}

	if (Object.keys(next).length === 0) {
		// No-op edit: still record history so undo behaves like before
		setState({ ...s }, { history: 'push' });
		return result;
	}
	if (next.frames && next.frames.length === 0) throw new Error('Edit would remove all frames');
	setState({ ...s, bytes: null, ...next }, { history: 'push' });
	return result;
}

// ------------------------------------------------------------------ preview

const preview = (() => {
	let canvas: OffscreenCanvas | null = null;
	let ctx: OffscreenCanvasRenderingContext2D | null = null;
	let index = 0;
	let playing = false;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let nextAt = 0;
	const trim = { enabled: false, start: 0, end: 0 };
	// One-entry cache of the composited buffer for keep-frames
	let comp: { version: number; index: number; data: Uint8ClampedArray<ArrayBuffer> } | null = null;

	function frameCount() {
		return current?.frames.length ?? 0;
	}

	function composited(i: number): Uint8ClampedArray<ArrayBuffer> {
		const frames = current!.frames;
		if (!frames[i].keep) return frames[i].px.data;
		let base: Uint8ClampedArray<ArrayBuffer>;
		let start: number;
		if (comp && comp.version === version && comp.index === i - 1) {
			base = comp.data;
			start = i;
		} else {
			let j = i;
			while (j > 0 && frames[j].keep) j--;
			base = frames[j].px.data;
			start = j + 1;
		}
		for (let k = start; k <= i; k++) {
			base = applyPixelOp(raster(frames[k].px), { kind: 'composite', base }).data;
		}
		comp = { version, index: i, data: base };
		return base;
	}

	function render() {
		const s = current;
		if (!canvas || !ctx || !s || s.frames.length === 0) return;
		if (canvas.width !== s.width) canvas.width = s.width;
		if (canvas.height !== s.height) canvas.height = s.height;
		const i = Math.min(index, s.frames.length - 1);
		ctx.putImageData(new ImageData(composited(i), s.width, s.height), 0, 0);
	}

	function announce() {
		post({ type: 'frame', index, playing });
	}

	function advance() {
		const n = frameCount();
		if (n === 0) return;
		if (trim.enabled) index = index >= trim.end ? trim.start : index + 1;
		else index = (index + 1) % n;
	}

	function delayOf(i: number) {
		return current?.frames[i]?.delay || 100;
	}

	function tick() {
		timer = null;
		if (!playing || frameCount() === 0) return;
		advance();
		render();
		announce();
		const now = performance.now();
		nextAt += delayOf(index);
		if (nextAt < now - 250) nextAt = now + delayOf(index); // fell behind: resync
		timer = setTimeout(tick, Math.max(0, nextAt - now));
	}

	function play() {
		if (frameCount() <= 1) {
			playing = false;
			announce();
			return;
		}
		playing = true;
		if (timer) clearTimeout(timer);
		nextAt = performance.now() + delayOf(index);
		timer = setTimeout(tick, delayOf(index));
		announce();
	}

	function pause() {
		playing = false;
		if (timer) clearTimeout(timer);
		timer = null;
		announce();
	}

	return {
		attach(c: OffscreenCanvas) {
			canvas = c;
			ctx = c.getContext('2d');
			render();
		},
		onStateChange(reset: boolean) {
			comp = null;
			if (!current) {
				pause();
				index = 0;
				return;
			}
			if (reset) {
				index = 0;
				render();
				play();
			} else {
				index = Math.min(index, frameCount() - 1);
				render();
				announce();
			}
		},
		play,
		pause,
		seek(frame: number) {
			index = Math.max(0, Math.min(frameCount() - 1, frame));
			render();
			if (playing) nextAt = performance.now() + delayOf(index);
			announce();
		},
		setTrim(enabled: boolean, start: number, end: number) {
			trim.enabled = enabled;
			trim.start = start;
			trim.end = end;
		}
	};
})();

// ------------------------------------------------------------------ filmstrip

const strip = (() => {
	const HEIGHT = 48;
	let canvas: OffscreenCanvas | null = null;
	let width = 0;
	let token = 0;

	async function render() {
		const s = current;
		const my = ++token;
		if (!canvas || !s || width === 0 || s.frames.length === 0) return;
		const tw = s.height > 0 ? Math.max(1, Math.round((s.width / s.height) * HEIGHT)) : 36;
		const count = Math.max(1, Math.ceil(width / tw));
		const picks = Array.from({ length: count }, (_, i) =>
			Math.min(
				Math.round((i / Math.max(1, count - 1)) * (s.frames.length - 1)),
				s.frames.length - 1
			)
		);
		const bitmaps = await Promise.all(
			picks.map((fi) =>
				createImageBitmap(new ImageData(s.frames[fi].px.data, s.width, s.height), {
					resizeWidth: tw,
					resizeHeight: HEIGHT,
					resizeQuality: 'medium'
				})
			)
		);
		if (my !== token || !canvas) {
			bitmaps.forEach((b) => b.close());
			return;
		}
		canvas.width = count * tw;
		canvas.height = HEIGHT;
		const ctx = canvas.getContext('2d')!;
		ctx.fillStyle = '#18181b';
		ctx.fillRect(0, 0, canvas.width, HEIGHT);
		bitmaps.forEach((b, i) => {
			ctx.drawImage(b, i * tw, 0, tw, HEIGHT);
			b.close();
		});
	}

	return {
		attach(c: OffscreenCanvas) {
			canvas = c;
			render();
		},
		setWidth(w: number) {
			width = w;
			render();
		},
		render() {
			render().catch((e) => console.warn('filmstrip render failed', e));
		}
	};
})();

// ------------------------------------------------------------------ dispatch

let queue: Promise<unknown> = Promise.resolve();

/** Serialize state-changing requests; control messages are handled immediately. */
function enqueue(id: number, fn: () => Promise<unknown> | unknown) {
	queue = queue.then(async () => {
		try {
			const result = await fn();
			post({ type: 'reply', id, ok: true, result });
		} catch (err) {
			console.error(err);
			post({
				type: 'reply',
				id,
				ok: false,
				error: err instanceof Error ? err.message : String(err)
			});
		}
	});
}

function reply(id: number) {
	post({ type: 'reply', id, ok: true });
}

self.onmessage = (e: MessageEvent<RequestEnvelope>) => {
	const { id, req } = e.data;
	handle(id, req);
};

function handle(id: number, req: EngineRequest) {
	switch (req.type) {
		case 'init':
			pool.setHelpers(req.helpers);
			return reply(id);
		case 'helperDied':
			pool.markDead(req.index);
			return reply(id);
		case 'attachPreview':
			preview.attach(req.canvas);
			return reply(id);
		case 'attachStrip':
			strip.attach(req.canvas);
			return reply(id);
		case 'stripWidth':
			strip.setWidth(req.width);
			return reply(id);
		case 'play':
			preview.play();
			return reply(id);
		case 'pause':
			preview.pause();
			return reply(id);
		case 'seek':
			preview.seek(req.frame);
			return reply(id);
		case 'trimBounds':
			preview.setTrim(req.enabled, req.start, req.end);
			return reply(id);
		case 'loadGif':
			return enqueue(id, () => loadGif(id, req.file, req.source));
		case 'loadImages':
			return enqueue(id, () => loadImages(id, req.files, req.fps, req.source));
		case 'loadRaw':
			return enqueue(id, () =>
				loadRaw(req.buffer, req.width, req.height, req.count, req.fps, req.source)
			);
		case 'edit':
			return enqueue(id, () => edit(id, req.edit));
		case 'undo':
			return enqueue(id, () => {
				const prev = undoStack.pop();
				if (!prev || !current) return;
				redoStack.push(current);
				const r = redoStack;
				setState(prev, { history: 'none' });
				redoStack = r;
			});
		case 'redo':
			return enqueue(id, () => {
				const next = redoStack.pop();
				if (!next || !current) return;
				undoStack.push(current);
				const r = redoStack;
				setState(next, { history: 'none' });
				redoStack = r;
			});
		case 'reset':
			return enqueue(id, () => {
				source = null;
				setState(null, { history: 'clear' });
			});
		case 'export':
			return enqueue(id, async () => {
				if (!current) throw new Error('No project loaded');
				const bytes = await encodeState(current, id);
				return new Blob([bytes as BlobPart], { type: 'image/gif' });
			});
	}
}
