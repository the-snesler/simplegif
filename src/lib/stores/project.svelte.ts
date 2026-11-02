/**
 * Main-thread mirror of the project held by the engine worker. Pixel data
 * never lives here — only metadata needed to render the UI.
 */
import type { ProjectMeta, SourceInfo } from '$lib/engine/protocol';

let meta = $state.raw<ProjectMeta>({
	isLoaded: false,
	source: null,
	width: 0,
	height: 0,
	frameRate: 10,
	frameCount: 0,
	duration: 0,
	decoding: false,
	canUndo: false,
	canRedo: false,
	version: 0
});

export const project = {
	get isLoaded() {
		return meta.isLoaded;
	},
	get sourceFile(): SourceInfo | null {
		return meta.source;
	},
	get width() {
		return meta.width;
	},
	get height() {
		return meta.height;
	},
	get frameRate() {
		return meta.frameRate;
	},
	get frameCount() {
		return meta.frameCount;
	},
	get duration() {
		return meta.duration;
	},
	/** Frames are still streaming in from the engine */
	get decoding() {
		return meta.decoding;
	},
	get canUndo() {
		return meta.canUndo;
	},
	get canRedo() {
		return meta.canRedo;
	},
	/** Bumps on every engine state change */
	get version() {
		return meta.version;
	},
	async reset() {
		const { engine } = await import('$lib/engine/client');
		await engine.reset();
	},
	/** @internal called by the engine client */
	_sync(next: ProjectMeta) {
		meta = next;
	}
};
