<script lang="ts">
	import ToolPanel from '$lib/components/ToolPanel.svelte';
	import { project } from '$lib/stores/project.svelte';
	import { processing } from '$lib/stores/processing.svelte';
	import { cropStore } from '$lib/stores/crop.svelte';
	import { cropFrames } from '$lib/processing/transforms/crop';
	import { onMount } from 'svelte';

	onMount(() => {
		if (project.isLoaded) {
			cropStore.activate(project.width, project.height);
		}
		return () => cropStore.deactivate();
	});

	$effect(() => {
		if (project.isLoaded) {
			cropStore.activate(project.width, project.height);
		}
	});

	let hasSelection = $derived(
		cropStore.rect.x !== 0 ||
			cropStore.rect.y !== 0 ||
			cropStore.rect.width !== project.width ||
			cropStore.rect.height !== project.height
	);

	async function applyCrop() {
		const rect = cropStore.rect;
		processing.start('Cropping frames...');
		try {
			const newFrames = cropFrames(project.frames, rect, (pct) => processing.update(pct));
			project.updateFrames(newFrames);
			project.updateDimensions(rect.width, rect.height);
			cropStore.activate(rect.width, rect.height);
		} catch (err) {
			console.error('Failed to crop:', err);
		} finally {
			processing.finish();
		}
	}
</script>

<svelte:head>
	<title>Crop GIF - SimpleGIF</title>
	<meta
		name="description"
		content="Crop your GIF to any size. Free, local-first tool. No upload required."
	/>
</svelte:head>

<ToolPanel title="Crop" description="Drag the handles on the preview to select your crop area." onApply={applyCrop}>
	<div class="space-y-2">
		<div class="flex items-center justify-between text-xs text-zinc-400">
			<span>Selection</span>
			{#if hasSelection}
				<button
					class="text-green-500 hover:text-green-400 transition-colors"
					onclick={() => cropStore.activate(project.width, project.height)}
				>
					Reset
				</button>
			{/if}
		</div>
		<div class="grid grid-cols-2 gap-2 text-sm">
			<div class="bg-zinc-800 rounded px-2.5 py-1.5 text-zinc-300 tabular-nums">
				<span class="text-zinc-500 text-xs">X</span> {cropStore.rect.x}
			</div>
			<div class="bg-zinc-800 rounded px-2.5 py-1.5 text-zinc-300 tabular-nums">
				<span class="text-zinc-500 text-xs">Y</span> {cropStore.rect.y}
			</div>
			<div class="bg-zinc-800 rounded px-2.5 py-1.5 text-zinc-300 tabular-nums">
				<span class="text-zinc-500 text-xs">W</span> {cropStore.rect.width}
			</div>
			<div class="bg-zinc-800 rounded px-2.5 py-1.5 text-zinc-300 tabular-nums">
				<span class="text-zinc-500 text-xs">H</span> {cropStore.rect.height}
			</div>
		</div>
	</div>
</ToolPanel>
