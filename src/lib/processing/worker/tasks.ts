/**
 * Off-main-thread versions of the frame transforms and GIF decoder.
 * Same semantics as the synchronous functions in ../transforms and ../decoder.
 */
import type { CropRect, FrameData, OptimizeOptions, RotateOptions } from '$lib/types';
import { runTask } from './pool';

type Progress = (pct: number) => void;

export const cropFramesAsync = (frames: FrameData[], rect: CropRect, onProgress?: Progress) =>
	runTask({ op: 'crop', frames, rect: { ...rect } }, onProgress);

export const resizeFramesAsync = (
	frames: FrameData[],
	width: number,
	height: number,
	onProgress?: Progress
) => runTask({ op: 'resize', frames, width, height }, onProgress);

export const rotateFramesAsync = (
	frames: FrameData[],
	options: RotateOptions,
	onProgress?: Progress
) => runTask({ op: 'rotate', frames, options: { ...options } }, onProgress);

export const optimizeFramesAsync = (
	frames: FrameData[],
	options: OptimizeOptions,
	onProgress?: Progress
) => runTask({ op: 'optimize', frames, options: { ...options } }, onProgress);

export const decodeGifAsync = (buffer: ArrayBuffer) => runTask({ op: 'decode', buffer });
