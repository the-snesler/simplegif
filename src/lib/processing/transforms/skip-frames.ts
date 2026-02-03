import type { FrameData } from '$lib/types';

export function skipFrames(frames: FrameData[], keepEveryN: number): FrameData[] {
	return frames.filter((_, i) => i % keepEveryN === 0);
}
