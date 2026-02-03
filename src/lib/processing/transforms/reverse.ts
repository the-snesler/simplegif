import type { FrameData } from '$lib/types';

export function reverseFrames(frames: FrameData[]): FrameData[] {
	return frames.toReversed();
}
