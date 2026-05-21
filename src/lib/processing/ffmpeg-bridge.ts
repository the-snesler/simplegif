import type { FrameData } from '$lib/types';
import { ffmpegStore } from '$lib/stores/ffmpeg.svelte';

export async function videoToFrames(
	fileData: Uint8Array,
	fileName: string,
	fps: number = 10,
	onProgress?: (pct: number) => void
): Promise<{ frames: FrameData[]; width: number; height: number }> {
	const ffmpeg = await ffmpegStore.load();

	ffmpeg.on('progress', ({ progress }) => {
		if (progress > 0.01 && progress < 0.99) {
			onProgress?.(progress * 100);
		}
	});

	await ffmpeg.writeFile(fileName, fileData);

	await ffmpeg.exec(['-i', fileName, '-vf', `fps=${fps}`, '-f', 'image2', 'frame_%04d.png']);

	const frames: FrameData[] = [];
	let i = 1;
	while (true) {
		const frameName = `frame_${String(i).padStart(4, '0')}.png`;
		try {
			const data = await ffmpeg.readFile(frameName);
			const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
			const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'image/png' });
			const bitmap = await createImageBitmap(blob);
			const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
			const ctx = canvas.getContext('2d')!;
			ctx.drawImage(bitmap, 0, 0);
			frames.push({
				imageData: ctx.getImageData(0, 0, bitmap.width, bitmap.height),
				delay: Math.round(1000 / fps)
			});
			bitmap.close();
			await ffmpeg.deleteFile(frameName);
			i++;
		} catch {
			break;
		}
	}

	await ffmpeg.deleteFile(fileName);
	onProgress?.(100);

	return {
		frames,
		width: frames[0]?.imageData.width ?? 0,
		height: frames[0]?.imageData.height ?? 0
	};
}

export async function imageSequenceToFrames(
	files: File[],
	fps: number = 10,
	onProgress?: (pct: number) => void
): Promise<{ frames: FrameData[]; width: number; height: number }> {
	const sorted = [...files].sort((a, b) =>
		a.name.localeCompare(b.name, undefined, { numeric: true })
	);
	const frames: FrameData[] = [];
	const delay = Math.round(1000 / fps);

	for (let i = 0; i < sorted.length; i++) {
		const file = sorted[i];
		const bitmap = await createImageBitmap(file);
		const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
		const ctx = canvas.getContext('2d')!;
		ctx.drawImage(bitmap, 0, 0);
		frames.push({
			imageData: ctx.getImageData(0, 0, bitmap.width, bitmap.height),
			delay
		});
		bitmap.close();
		onProgress?.(((i + 1) / sorted.length) * 100);
	}

	return {
		frames,
		width: frames[0]?.imageData.width ?? 0,
		height: frames[0]?.imageData.height ?? 0
	};
}
