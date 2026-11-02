import type { FrameData } from '$lib/types';
import { project } from './project.svelte';

interface Snapshot {
	frames: FrameData[];
	width: number;
	height: number;
	frameRate: number;
}

// Raw state: snapshots hold large, immutable frame arrays that must not be
// deep-proxied. Stacks are replaced (never mutated) so reactivity still fires.
let undoStack = $state.raw<Snapshot[]>([]);
let redoStack = $state.raw<Snapshot[]>([]);

function capture(): Snapshot {
	return {
		frames: project.frames,
		width: project.width,
		height: project.height,
		frameRate: project.frameRate
	};
}

function restore(snap: Snapshot) {
	project.updateFrames(snap.frames);
	project.updateDimensions(snap.width, snap.height);
	project.updateFrameRate(snap.frameRate);
}

export const history = {
	get canUndo() {
		return undoStack.length > 0;
	},
	get canRedo() {
		return redoStack.length > 0;
	},

	/** Save current state before a destructive apply. */
	snapshot() {
		undoStack = [...undoStack, capture()];
		redoStack = [];
	},

	undo() {
		const prev = undoStack.at(-1);
		if (!prev) return;
		undoStack = undoStack.slice(0, -1);
		redoStack = [...redoStack, capture()];
		restore(prev);
	},

	redo() {
		const next = redoStack.at(-1);
		if (!next) return;
		redoStack = redoStack.slice(0, -1);
		undoStack = [...undoStack, capture()];
		restore(next);
	},

	clear() {
		undoStack = [];
		redoStack = [];
	}
};
