import type { FrameData } from '$lib/types';

export function changeFrameRate(frames: FrameData[], targetFps: number): FrameData[] {
	const delay = Math.round(1000 / targetFps);
	return frames.map((frame) => ({
		...frame,
		delay
	}));
}
