<script lang="ts">
	import DNMovieCamera from '~icons/dinkie-icons/movie-camera';
	import { project } from '$lib/stores/project.svelte';
	import { processing } from '$lib/stores/processing.svelte';
	import { decodeGif, detectFileType } from '$lib/processing/decoder';
	import { videoToFrames, imageSequenceToFrames } from '$lib/processing/ffmpeg-bridge';

	let isDragging = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		isDragging = true;
	}

	function handleDragLeave() {
		isDragging = false;
	}

	async function handleDrop(e: DragEvent) {
		e.preventDefault();
		isDragging = false;

		const files = e.dataTransfer?.files;
		if (!files || files.length === 0) return;

		if (files.length > 1) {
			await loadImageSequence(Array.from(files));
		} else {
			await loadFile(files[0]);
		}
	}

	function handleClick() {
		fileInput?.click();
	}

	async function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		const files = input.files;
		if (!files || files.length === 0) return;

		if (files.length > 1) {
			await loadImageSequence(Array.from(files));
		} else {
			await loadFile(files[0]);
		}
		input.value = '';
	}

	async function loadFile(file: File) {
		const type = detectFileType(file);

		processing.start('Loading file...');

		try {
			if (type === 'gif') {
				const buffer = await file.arrayBuffer();
				const { frames, width, height } = await decodeGif(buffer);
				const avgDelay = frames.reduce((sum, f) => sum + f.delay, 0) / frames.length;
				const fps = Math.round(1000 / (avgDelay || 100));
				project.setSource(
					{ name: file.name, type: file.type, size: file.size, blob: file },
					frames,
					width,
					height,
					fps
				);
			} else if (type === 'video') {
				const { fetchFile } = await import('@ffmpeg/util');
				const data = await fetchFile(file);
				const { frames, width, height } = await videoToFrames(data, file.name, 10, (pct) =>
					processing.update(pct, 'Extracting frames...')
				);
				project.setSource(
					{ name: file.name, type: file.type, size: file.size, blob: file },
					frames,
					width,
					height,
					10
				);
			} else if (type === 'image') {
				const bitmap = await createImageBitmap(file);
				const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
				const ctx = canvas.getContext('2d')!;
				ctx.drawImage(bitmap, 0, 0);
				const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
				bitmap.close();
				project.setSource(
					{ name: file.name, type: file.type, size: file.size, blob: file },
					[{ imageData, delay: 100 }],
					imageData.width,
					imageData.height,
					10
				);
			}
		} catch (err) {
			console.error('Failed to load file:', err);
		} finally {
			processing.finish();
		}
	}

	async function loadImageSequence(files: File[]) {
		const imageFiles = files.filter(
			(f) => f.type.startsWith('image/') || /\.(png|jpg|jpeg|webp|bmp)$/i.test(f.name)
		);
		if (imageFiles.length === 0) return;

		processing.start('Loading image sequence...');
		try {
			const { frames, width, height } = await imageSequenceToFrames(imageFiles, 10, (pct) =>
				processing.update(pct, 'Processing images...')
			);
			project.setSource(
				{
					name: `${imageFiles.length} images`,
					type: 'image/sequence',
					size: imageFiles.reduce((sum, f) => sum + f.size, 0),
					blob: new Blob()
				},
				frames,
				width,
				height,
				10
			);
		} catch (err) {
			console.error('Failed to load image sequence:', err);
		} finally {
			processing.finish();
		}
	}
</script>

<button
	class="flex w-full flex-1 cursor-pointer flex-col items-center justify-center p-8"
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
	onclick={handleClick}
	type="button"
>
	<div
		class="flex w-full max-w-lg flex-col items-center gap-4 rounded-2xl border-2 border-dashed p-12 transition-colors {isDragging
			? 'border-green-500 bg-green-950/20'
			: 'border-zinc-700 hover:border-zinc-500'}"
	>
		<div
			class="flex h-16 w-16 items-center justify-center rounded-2xl border border-zinc-700 bg-zinc-800"
		>
			<DNMovieCamera class="h-8 w-8 text-zinc-400" />
		</div>
		<div class="text-center">
			<p class="text-lg font-medium text-zinc-200">Drop a file here</p>
			<p class="mt-1 text-sm text-zinc-500">GIF, MP4, WebM, AVI, MOV, or drag multiple images</p>
		</div>
		<div
			class="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-700"
		>
			Browse files
		</div>
	</div>
	<input
		bind:this={fileInput}
		type="file"
		accept="image/*,video/*,.gif,.mp4,.webm,.avi,.mov,.mkv"
		multiple
		class="hidden"
		onchange={handleFileSelect}
	/>
</button>
