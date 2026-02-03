export interface ProjectFile {
	name: string;
	type: string;
	size: number;
	blob: Blob;
}

export interface FrameData {
	imageData: ImageData;
	delay: number;
}

export interface CropRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface ResizeOptions {
	width: number;
	height: number;
	maintainAspect: boolean;
}

export interface TrimOptions {
	startFrame: number;
	endFrame: number;
}

export interface OptimizeOptions {
	maxColors: number;
	dithering: boolean;
}

export interface RotateOptions {
	degrees: 0 | 90 | 180 | 270;
	flipH: boolean;
	flipV: boolean;
}

export interface FrameRateOptions {
	targetFps: number;
}

export interface SkipFramesOptions {
	keepEveryN: number;
}

export type ToolId =
	| 'convert'
	| 'sequence'
	| 'crop'
	| 'resize'
	| 'trim'
	| 'optimize'
	| 'rotate'
	| 'reverse'
	| 'framerate'
	| 'skip-frames';

export interface ToolDefinition {
	id: ToolId;
	label: string;
	path: string;
	description: string;
}
