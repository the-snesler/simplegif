import type { FrameData } from '$lib/types';

export function trimFrames(frames: FrameData[], startFrame: number, endFrame: number): FrameData[] {
	return frames.slice(startFrame, endFrame + 1);
}
