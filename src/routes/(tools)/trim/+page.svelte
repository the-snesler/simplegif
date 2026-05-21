<script lang="ts">
	import ToolPanel from '$lib/components/ToolPanel.svelte';
	import { project } from '$lib/stores/project.svelte';
	import { processing } from '$lib/stores/processing.svelte';
	import { filmstrip } from '$lib/stores/filmstrip.svelte';
	import { applyAction } from '$lib/stores/applyAction.svelte';
	import { trimFrames } from '$lib/processing/transforms/trim';

	// Enable trim mode on mount, disable on unmount
	$effect(() => {
		if (project.isLoaded) {
			filmstrip.enableTrim(0, project.frameCount - 1);
		}
		return () => {
			filmstrip.disableTrim();
		};
	});

	$effect(() => {
		applyAction.set(applyTrim);
		return () => applyAction.clear();
	});

	async function applyTrim() {
		processing.start('Trimming frames...');
		try {
			const newFrames = trimFrames(project.frames, filmstrip.trimStart, filmstrip.trimEnd);
			project.updateFrames(newFrames);
			filmstrip.enableTrim(0, newFrames.length - 1);
		} catch (err) {
			console.error('Failed to trim:', err);
		} finally {
			processing.finish();
		}
	}

	let keptFrames = $derived(Math.max(0, filmstrip.trimEnd - filmstrip.trimStart + 1));
</script>

<svelte:head>
	<title>Trim GIF - SimpleGIF</title>
	<meta
		name="description"
		content="Trim the start and end of your GIF. Free, runs entirely in your browser."
	/>
</svelte:head>

<ToolPanel
	title="Trim"
	description="Drag the gold handles on the filmstrip to select the range of frames to keep."
>
	{#if project.isLoaded}
		<div class="space-y-2 text-sm">
			<div class="flex justify-between text-zinc-400">
				<span>Start frame</span>
				<span class="text-zinc-300 tabular-nums">{filmstrip.trimStart + 1}</span>
			</div>
			<div class="flex justify-between text-zinc-400">
				<span>End frame</span>
				<span class="text-zinc-300 tabular-nums">{filmstrip.trimEnd + 1}</span>
			</div>
			<div class="flex justify-between border-t border-zinc-800 pt-1 text-zinc-400">
				<span>Keeping</span>
				<span class="text-zinc-300 tabular-nums">{keptFrames} of {project.frameCount} frames</span>
			</div>
		</div>
	{/if}
</ToolPanel>
