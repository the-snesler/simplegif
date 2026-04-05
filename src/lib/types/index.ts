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

export type OptimizeMethod =
	| 'gifsicle'
	| 'color-reduction'
	| 'drop-frames'
	| 'deduplicate'
	| 'transparency'
	| 'coalesce';

export interface OptimizeOptions {
	method: OptimizeMethod;
	/** Max colors per frame (2–256). Used by color-reduction. */
	maxColors: number;
	/** Drop every Nth frame (2 = every other, 3 = every third, etc.) */
	dropEveryN: number;
	/** Fuzz factor 0–100 for duplicate detection and transparency diff. */
	fuzzFactor: number;
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
