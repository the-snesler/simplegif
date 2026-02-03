import type { FrameData, ProjectFile } from '$lib/types';

let sourceFile = $state<ProjectFile | null>(null);
let frames = $state<FrameData[]>([]);
let width = $state(0);
let height = $state(0);
let frameRate = $state(10);
let isLoaded = $state(false);

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
	get frameCount() {
		return frames.length;
	},
	get duration() {
		return frames.reduce((sum, f) => sum + f.delay, 0);
	},

	setSource(file: ProjectFile, decodedFrames: FrameData[], w: number, h: number, fps: number) {
		sourceFile = file;
		frames = decodedFrames;
		width = w;
		height = h;
		frameRate = fps;
		isLoaded = true;
	},

	updateFrames(newFrames: FrameData[]) {
		frames = newFrames;
	},

	updateDimensions(w: number, h: number) {
		width = w;
		height = h;
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
	}
};
