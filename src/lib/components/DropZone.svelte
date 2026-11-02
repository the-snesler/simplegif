<script lang="ts">
	import DNMovieCamera from '~icons/dinkie-icons/movie-camera';
	import { processing } from '$lib/stores/processing.svelte';
	import { importFile, importSequence } from '$lib/engine/import';

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
		await load(Array.from(files));
	}

	function handleClick() {
		fileInput?.click();
	}

	async function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		const files = input.files;
		if (!files || files.length === 0) return;
		await load(Array.from(files));
		input.value = '';
	}

	async function load(files: File[]) {
		const multiple = files.length > 1;
		processing.start(multiple ? 'Loading image sequence...' : 'Loading file...');
		try {
			if (multiple) await importSequence(files, 10);
			else await importFile(files[0]);
		} catch (err) {
			console.error('Failed to load file:', err);
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
