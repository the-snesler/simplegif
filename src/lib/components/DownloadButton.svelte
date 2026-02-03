<script lang="ts">
	import { project } from '$lib/stores/project.svelte';
	import { processing } from '$lib/stores/processing.svelte';
	import { encodeGif } from '$lib/processing/encoder';
	import { downloadBlob } from '$lib/utils/download';

	let { maxColors = 256 }: { maxColors?: number } = $props();

	async function handleDownload() {
		if (!project.isLoaded) return;

		processing.start('Encoding GIF...');
		try {
			const blob = await encodeGif(project.frames, project.width, project.height, {
				maxColors
			});
			const baseName = project.sourceFile?.name.replace(/\.[^.]+$/, '') ?? 'output';
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
	class="px-4 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
>
	Download GIF
</button>
