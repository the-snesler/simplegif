import type { FFmpeg } from '@ffmpeg/ffmpeg';

let instance = $state<FFmpeg | null>(null);
let isLoading = $state(false);
let isReady = $state(false);

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

	async load(): Promise<FFmpeg> {
		if (instance) return instance;
		isLoading = true;

		const { FFmpeg } = await import('@ffmpeg/ffmpeg');
		const { toBlobURL } = await import('@ffmpeg/util');

		const ffmpeg = new FFmpeg();
		const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm'

		await ffmpeg.load({
			coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
			wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
			workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript')
		});

		instance = ffmpeg;
		isLoading = false;
		isReady = true;
		return ffmpeg;
	}
};
