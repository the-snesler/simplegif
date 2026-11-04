<script lang="ts">
	import ToolPanel from '$lib/components/ToolPanel.svelte';
	import { project } from '$lib/stores/project.svelte';
	import { processing } from '$lib/stores/processing.svelte';
	import { applyAction } from '$lib/stores/applyAction.svelte';
	import { engine } from '$lib/engine/client';

	$effect(() => {
		applyAction.set(applyReverse, 'Reverse Frames');
		return () => applyAction.clear();
	});

	async function applyReverse() {
		processing.start('Reversing frames...');
		try {
			await engine.edit({ op: 'reverse' });
		} catch (err) {
			console.error('Failed to reverse:', err);
		} finally {
			processing.finish();
		}
	}
</script>

<svelte:head>
	<title>Reverse GIF - SimpleGIF</title>
	<meta
		name="description"
		content="Reverse the playback order of your GIF. Free, runs entirely in your browser."
	/>
</svelte:head>

<ToolPanel title="Reverse" description="Reverse the frame order of your GIF.">
	{#if project.isLoaded}
		<p class="text-sm text-zinc-400">
			This will reverse all {project.frameCount} frames.
		</p>
	{/if}
</ToolPanel>
