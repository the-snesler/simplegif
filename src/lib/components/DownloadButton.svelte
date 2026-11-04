<script lang="ts">
	import { project } from '$lib/stores/project.svelte';
	import { processing } from '$lib/stores/processing.svelte';
	import { engine } from '$lib/engine/client';
	import { downloadBlob } from '$lib/utils/download';

	async function handleDownload() {
		if (!project.isLoaded) return;

		const baseName = project.sourceFile?.name.replace(/\.[^.]+$/, '') ?? 'output';

		processing.start('Encoding GIF...');
		try {
			const blob = await engine.export((pct) => processing.update(pct));
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
