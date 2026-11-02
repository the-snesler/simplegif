import type { FFmpeg } from '@ffmpeg/ffmpeg';

let instance = $state<FFmpeg | null>(null);
let isLoading = $state(false);
let isReady = $state(false);
let loadPromise: Promise<FFmpeg> | null = null;

export const ffmpegStore = {
	get instance() {
		return instance;
	},
	get isLoading() {
		return isLoading;
	},
	get isReady() {
		return isReady;
	},

	/** Load ffmpeg.wasm (deduplicated; safe to call early to prefetch). */
	load(): Promise<FFmpeg> {
		loadPromise ??= (async () => {
			isLoading = true;
			try {
				const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
					import('@ffmpeg/ffmpeg'),
					import('@ffmpeg/util')
				]);
				// Single-threaded core: the multi-threaded build was no faster in testing
				// and intermittently stalled.
				const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';
				const [coreURL, wasmURL] = await Promise.all([
					toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
					toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm')
				]);
				const ffmpeg = new FFmpeg();
				await ffmpeg.load({ coreURL, wasmURL });
				instance = ffmpeg;
				isReady = true;
				return ffmpeg;
			} catch (err) {
				loadPromise = null;
				throw err;
			} finally {
				isLoading = false;
			}
		})();
		return loadPromise;
	}
};
