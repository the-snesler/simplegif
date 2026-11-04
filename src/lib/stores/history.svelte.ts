import { project } from './project.svelte';
import { engine } from '$lib/engine/client';

/** Undo/redo live in the engine worker; this is a thin facade for the UI. */
export const history = {
	get canUndo() {
		return project.canUndo;
	},
	get canRedo() {
		return project.canRedo;
	},
	undo: () => engine.undo(),
	redo: () => engine.redo()
};
