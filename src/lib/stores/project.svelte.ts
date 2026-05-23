import type { FrameData, ProjectFile } from '$lib/types';
import { estimateCompressionRatio } from '$lib/processing/encoder';

let sourceFile = $state<ProjectFile | null>(null);
let frames = $state<FrameData[]>([]);
let width = $state(0);
let height = $state(0);
let frameRate = $state(10);
let isLoaded = $state(false);
let optimizedBlob = $state<Blob | null>(null);
let compressionRatio = $state<number | null>(null);
let sampleToken = 0;

function resampleCompressionRatio() {
	compressionRatio = null;
	if (frames.length === 0 || width === 0 || height === 0) return;
	const token = ++sampleToken;
	const snapshot = frames;
	const w = width;
	const h = height;
	estimateCompressionRatio(snapshot, w, h)
		.then((ratio) => {
			if (token === sampleToken) compressionRatio = ratio;
		})
		.catch(() => {
			if (token === sampleToken) compressionRatio = null;
		});
}

export const project = {
	get sourceFile() {
		return sourceFile;
	},
	get frames() {
		return frames;
	},
	get width() {
		return width;
	},
	get height() {
		return height;
	},
	get frameRate() {
		return frameRate;
	},
	get isLoaded() {
		return isLoaded;
	},
	get optimizedBlob() {
		return optimizedBlob;
	},
	get frameCount() {
		return frames.length;
	},
	get duration() {
		return frames.reduce((sum, f) => sum + f.delay, 0);
	},
	get compressionRatio() {
		return compressionRatio;
	},
	get estimatedBytes() {
		if (compressionRatio == null) return null;
		return Math.round(width * height * frames.length * compressionRatio);
	},

	setSource(file: ProjectFile, decodedFrames: FrameData[], w: number, h: number, fps: number) {
		sourceFile = file;
		frames = decodedFrames;
		width = w;
		height = h;
		frameRate = fps;
		isLoaded = true;
		resampleCompressionRatio();
	},

	updateFrames(newFrames: FrameData[]) {
		frames = newFrames;
		optimizedBlob = null;
		resampleCompressionRatio();
	},

	setOptimizedBlob(blob: Blob | null) {
		optimizedBlob = blob;
	},

	updateDimensions(w: number, h: number) {
		width = w;
		height = h;
		resampleCompressionRatio();
	},

	updateFrameRate(fps: number) {
		frameRate = fps;
	},

	reset() {
		sourceFile = null;
		frames = [];
		width = 0;
		height = 0;
		frameRate = 10;
		isLoaded = false;
		optimizedBlob = null;
		compressionRatio = null;
		sampleToken++;
	}
};
