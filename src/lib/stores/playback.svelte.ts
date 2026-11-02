/**
 * Shared preview playback state. Written by PreviewCanvas, read by the editor
 * and playback controls — replaces polling the preview component.
 */
let currentFrame = $state(0);
let isPlaying = $state(false);

export const playback = {
	get currentFrame() {
		return currentFrame;
	},
	set currentFrame(v: number) {
		currentFrame = v;
	},
	get isPlaying() {
		return isPlaying;
	},
	set isPlaying(v: boolean) {
		isPlaying = v;
	}
};
