/**
 * Message protocol between the main thread, the engine worker (which owns all
 * frame data, history and preview rendering) and helper workers (stateless
 * CPU workers the engine fans per-frame work out to).
 */
import type { CropRect, OptimizeOptions, RotateOptions } from '$lib/types';
import type { GifsicleOptions } from '$lib/processing/gifsicle-options';
import type { EncodedFrame, PixelOp, Raster } from './frame-ops';

// ---------------------------------------------------------------- main → engine

export type EditOp =
	| { op: 'crop'; rect: CropRect }
	| { op: 'resize'; width: number; height: number }
	| { op: 'rotate'; options: RotateOptions }
	| { op: 'trim'; start: number; end: number }
	| { op: 'reverse' }
	| { op: 'framerate'; fps: number }
	| { op: 'skip'; keepEveryN: number }
	| { op: 'optimize'; options: OptimizeOptions }
	| { op: 'gifsicle'; options: GifsicleOptions };

export interface SourceInfo {
	name: string;
	type: string;
	size: number;
}

export type EngineRequest =
	| { type: 'init'; helpers: MessagePort[] }
	| { type: 'loadGif'; file: Blob; source: SourceInfo }
	| { type: 'loadImages'; files: Blob[]; fps: number; source: SourceInfo }
	| { type: 'loadVideo'; file: Blob; fps: number; source: SourceInfo }
	| {
			type: 'loadRaw';
			buffer: ArrayBuffer;
			width: number;
			height: number;
			count: number;
			fps: number;
			source: SourceInfo;
	  }
	| { type: 'edit'; edit: EditOp }
	| { type: 'undo' }
	| { type: 'redo' }
	| { type: 'reset' }
	| { type: 'export' }
	| { type: 'attachPreview'; canvas: OffscreenCanvas }
	| { type: 'attachStrip'; canvas: OffscreenCanvas }
	| { type: 'stripWidth'; width: number }
	| { type: 'play' }
	| { type: 'pause' }
	| { type: 'seek'; frame: number }
	| { type: 'trimBounds'; enabled: boolean; start: number; end: number }
	| { type: 'helperDied'; index: number };

export interface RequestEnvelope {
	id: number;
	req: EngineRequest;
}

// ---------------------------------------------------------------- engine → main

export interface ProjectMeta {
	isLoaded: boolean;
	source: SourceInfo | null;
	width: number;
	height: number;
	frameRate: number;
	frameCount: number;
	/** Total duration in ms */
	duration: number;
	/** True while frames are still being decoded in the background */
	decoding: boolean;
	canUndo: boolean;
	canRedo: boolean;
	/** Monotonic version, bumps on every state change */
	version: number;
}

export interface EditResult {
	/** For gifsicle: input and output sizes in bytes */
	beforeSize?: number;
	afterSize?: number;
}

export type EngineEvent =
	| { type: 'reply'; id: number; ok: true; result?: unknown }
	| { type: 'reply'; id: number; ok: false; error: string }
	| { type: 'progress'; id: number; pct: number; text?: string }
	| { type: 'meta'; meta: ProjectMeta }
	| { type: 'frame'; index: number; playing: boolean };

// ---------------------------------------------------------------- engine ↔ helper

export type HelperTask =
	| { t: 'pixel'; src: Raster; op: PixelOp }
	| { t: 'encode'; src: Raster; maxColors: number }
	| { t: 'image'; blob: Blob; size?: { width: number; height: number } }
	| { t: 'gifsicle'; bytes: Uint8Array; options: GifsicleOptions };

export interface HelperResults {
	pixel: Raster;
	encode: EncodedFrame;
	image: Raster;
	gifsicle: Uint8Array;
}

export type HelperReply =
	| { id: number; ok: true; result: unknown }
	| { id: number; ok: false; error: string };
