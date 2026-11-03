/** File import entry points used by the drop zone and the convert/sequence pages. */
import { engine, sourceOf } from './client';
import { processing } from '$lib/stores/processing.svelte';

export function detectFileType(file: File): 'gif' | 'video' | 'image' | 'unknown' {
	if (file.type === 'image/gif') return 'gif';
	if (file.type.startsWith('video/')) return 'video';
	if (file.type.startsWith('image/')) return 'image';
	const ext = file.name.split('.').pop()?.toLowerCase();
	if (ext === 'gif') return 'gif';
	if (['mp4', 'webm', 'avi', 'mov', 'mkv', 'flv', 'wmv', 'ogv'].includes(ext ?? '')) return 'video';
	if (['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tiff'].includes(ext ?? '')) return 'image';
	return 'unknown';
}

const progress = (pct: number, text?: string) => processing.update(pct, text);

/** Bumped by every import, so a slow (ffmpeg) import can tell it was superseded. */
let importToken = 0;

/** Invalidate any in-flight import (e.g. when the project is cleared). */
export function cancelPendingImports() {
	importToken++;
}

export async function importVideo(file: File, fps: number) {
	const token = ++importToken;
	processing.update(0, 'Decoding video...');
	try {
		const native = await engine.loadVideo(file, fps, progress);
		if (native?.native !== false) return;
	} catch (err) {
		console.warn('Native video decode failed, falling back to ffmpeg:', err);
	}
	if (token !== importToken) return;
	processing.update(0, 'Loading ffmpeg...');
	const [{ fetchFile }, { videoToRaw }] = await Promise.all([
		import('@ffmpeg/util'),
		import('$lib/processing/ffmpeg-bridge')
	]);
	const data = await fetchFile(file);
	processing.update(10, 'Extracting frames...');
	const raw = await videoToRaw(data, file.name, fps, (pct) =>
		processing.update(10 + pct * 0.9, 'Extracting frames...')
	);
	if (token !== importToken) return; // a newer import started while ffmpeg ran
	await engine.loadRaw(raw, fps, sourceOf(file));
}

export function filterImages(files: File[]) {
	return files
		.filter((f) => f.type.startsWith('image/') || /\.(png|jpg|jpeg|webp|bmp)$/i.test(f.name))
		.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export async function importSequence(files: File[], fps: number) {
	importToken++;
	const images = filterImages(files);
	if (images.length === 0) return;
	await engine.loadImages(
		images,
		fps,
		{
			name: `${images.length} images`,
			type: 'image/sequence',
			size: images.reduce((s, f) => s + f.size, 0)
		},
		progress
	);
}

export async function importFile(file: File) {
	if (detectFileType(file) !== 'video') importToken++;
	switch (detectFileType(file)) {
		case 'gif':
			return engine.loadGif(file, progress);
		case 'video':
			return importVideo(file, 10);
		case 'image':
			return engine.loadImages([file], 10, sourceOf(file), progress);
		default:
			throw new Error(`Unsupported file type: ${file.name}`);
	}
}
