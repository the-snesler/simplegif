import type { FrameData } from '$lib/types';
import { project } from './project.svelte';

interface Snapshot {
	frames: FrameData[];
	width: number;
	height: number;
	frameRate: number;
}

let undoStack = $state<Snapshot[]>([]);
let redoStack = $state<Snapshot[]>([]);

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
		undoStack.push(capture());
		redoStack = [];
	},

	undo() {
		const prev = undoStack.pop();
		if (!prev) return;
		redoStack.push(capture());
		restore(prev);
	},

	redo() {
		const next = redoStack.pop();
		if (!next) return;
		undoStack.push(capture());
		restore(next);
	},

	clear() {
		undoStack = [];
		redoStack = [];
	}
};
