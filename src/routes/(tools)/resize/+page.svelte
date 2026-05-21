<script lang="ts">
	import ToolPanel from '$lib/components/ToolPanel.svelte';
	import NumberInput from '$lib/components/controls/NumberInput.svelte';
	import { project } from '$lib/stores/project.svelte';
	import { processing } from '$lib/stores/processing.svelte';
	import { applyAction } from '$lib/stores/applyAction.svelte';
	import { resizeFrames } from '$lib/processing/transforms/resize';

	$effect(() => {
		applyAction.set(applyResize);
		return () => applyAction.clear();
	});

	let targetWidth = $state(project.width || 320);
	let targetHeight = $state(project.height || 240);
	let maintainAspect = $state(true);
	let aspectRatio = $state(1);

	$effect(() => {
		if (project.isLoaded) {
			targetWidth = project.width;
			targetHeight = project.height;
			aspectRatio = project.width / project.height;
		}
	});

	const presets = [75, 50, 25];

	function applyPreset(pct: number) {
		if (!project.isLoaded) return;
		targetWidth = Math.round(project.width * (pct / 100));
		targetHeight = Math.round(project.height * (pct / 100));
	}

	function onWidthChange() {
		if (maintainAspect && aspectRatio) {
			targetHeight = Math.round(targetWidth / aspectRatio);
		}
	}

	function onHeightChange() {
		if (maintainAspect && aspectRatio) {
			targetWidth = Math.round(targetHeight * aspectRatio);
		}
	}

	async function applyResize() {
		processing.start('Resizing frames...');
		try {
			const newFrames = resizeFrames(project.frames, targetWidth, targetHeight, (pct) =>
				processing.update(pct)
			);
			project.updateFrames(newFrames);
			project.updateDimensions(targetWidth, targetHeight);
		} catch (err) {
			console.error('Failed to resize:', err);
		} finally {
			processing.finish();
		}
	}
</script>

<svelte:head>
	<title>Resize GIF - SimpleGIF</title>
	<meta
		name="description"
		content="Resize your GIF to any resolution. Free, runs entirely in your browser."
	/>
</svelte:head>

<ToolPanel title="Resize" description="Change the resolution of your GIF.">
	{#if project.isLoaded}
		<div class="flex gap-2">
			{#each presets as pct (pct)}
				<button
					onclick={() => applyPreset(pct)}
					class="flex-1 rounded-md border border-zinc-700 bg-zinc-800 py-1 text-xs text-zinc-300 transition-colors hover:border-green-600 hover:text-white"
				>
					{pct}%
				</button>
			{/each}
		</div>
	{/if}

	<div class="grid grid-cols-2 gap-3">
		<div>
			<NumberInput
				label="Width"
				bind:value={targetWidth}
				min={1}
				max={4096}
				oninput={onWidthChange}
			/>
		</div>
		<div>
			<NumberInput
				label="Height"
				bind:value={targetHeight}
				min={1}
				max={4096}
				oninput={onHeightChange}
			/>
		</div>
	</div>

	<label class="flex items-center gap-2 text-sm text-zinc-300">
		<input type="checkbox" bind:checked={maintainAspect} class="rounded border-zinc-600" />
		Maintain aspect ratio
	</label>

	{#if project.isLoaded}
		<p class="text-xs text-zinc-500">
			Original: {project.width}&times;{project.height}
		</p>
	{/if}
</ToolPanel>
