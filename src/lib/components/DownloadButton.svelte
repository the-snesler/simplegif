<script lang="ts">
	import { project } from '$lib/stores/project.svelte';
	import { processing } from '$lib/stores/processing.svelte';
	import { encodeGif, type EncodeOptions } from '$lib/processing/encoder';
	import { downloadBlob } from '$lib/utils/download';

	let {
		maxColors = 256,
		transparencyOptimized = false
	}: {
		maxColors?: number;
		transparencyOptimized?: boolean;
	} = $props();

	async function handleDownload() {
		if (!project.isLoaded) return;

		const baseName = project.sourceFile?.name.replace(/\.[^.]+$/, '') ?? 'output';

		// If gifsicle produced an optimized blob, download it directly
		// (avoids re-encoding which would undo gifsicle's optimizations)
		if (project.optimizedBlob) {
			downloadBlob(project.optimizedBlob, `${baseName}.gif`);
			return;
		}

		processing.start('Encoding GIF...');
		try {
			const opts: EncodeOptions = { maxColors, transparencyOptimized };
			const blob = await encodeGif(project.frames, project.width, project.height, opts);
			downloadBlob(blob, `${baseName}.gif`);
		} catch (err) {
			console.error('Failed to encode GIF:', err);
		} finally {
			processing.finish();
		}
	}
</script>

<button
	onclick={handleDownload}
	disabled={!project.isLoaded || processing.isProcessing}
	class="rounded-lg border-2 border-green-700 px-4 py-2 text-sm leading-0 font-medium transition-colors hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50"
>
	Download GIF
</button>
