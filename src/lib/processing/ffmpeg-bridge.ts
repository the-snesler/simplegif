import { ffmpegStore } from '$lib/stores/ffmpeg.svelte';

export interface RawVideo {
	buffer: ArrayBuffer;
	width: number;
	height: number;
	count: number;
}

/**
 * Extract frames as one raw RGBA stream (no per-frame PNG encode/decode).
 * Output dimensions are read from ffmpeg's log of the output stream.
 */
export async function videoToRaw(
	fileData: Uint8Array,
	fileName: string,
	fps: number = 10,
	onProgress?: (pct: number) => void
): Promise<RawVideo> {
	const ffmpeg = await ffmpegStore.load();
	const inName = `in_${Date.now()}_${fileName.replace(/[^\w.-]/g, '_')}`;
	const outName = 'out.rgba';

	let dims: { width: number; height: number } | null = null;
	let inOutput = false;
	const onLog = ({ message }: { message: string }) => {
		if (/^Output #0/.test(message)) inOutput = true;
		if (!inOutput || dims) return;
		const m = /Video: rawvideo.*?\b(\d{1,5})x(\d{1,5})\b/.exec(message);
		if (m) dims = { width: Number(m[1]), height: Number(m[2]) };
	};
	const onProg = ({ progress }: { progress: number }) => {
		if (progress > 0.01 && progress < 0.99) onProgress?.(progress * 100);
	};
	ffmpeg.on('log', onLog);
	ffmpeg.on('progress', onProg);

	try {
		await ffmpeg.writeFile(inName, fileData);
		await ffmpeg.exec([
			'-i',
			inName,
			'-vf',
			`fps=${fps}`,
			'-f',
			'rawvideo',
			'-pix_fmt',
			'rgba',
			outName
		]);
		const data = await ffmpeg.readFile(outName);
		if (typeof data === 'string') throw new Error('Unexpected ffmpeg output');
		if (!dims) throw new Error('Could not determine video dimensions');
		const { width, height } = dims as { width: number; height: number };
		const count = Math.floor(data.byteLength / (width * height * 4));
		const buffer =
			data.byteOffset === 0 && data.byteLength === data.buffer.byteLength
				? (data.buffer as ArrayBuffer)
				: (data.slice().buffer as ArrayBuffer);
		onProgress?.(100);
		return { buffer, width, height, count };
	} finally {
		ffmpeg.off('log', onLog);
		ffmpeg.off('progress', onProg);
		await ffmpeg.deleteFile(inName).catch(() => {});
		await ffmpeg.deleteFile(outName).catch(() => {});
	}
}
