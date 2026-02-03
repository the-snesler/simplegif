<script lang="ts">
	import ToolPanel from '$lib/components/ToolPanel.svelte';
	import NumberInput from '$lib/components/controls/NumberInput.svelte';
	import { project } from '$lib/stores/project.svelte';
	import { processing } from '$lib/stores/processing.svelte';
	import { cropFrames } from '$lib/processing/transforms/crop';
	import type { CropRect } from '$lib/types';

	let cropRect = $state<CropRect>({
		x: 0,
		y: 0,
		width: project.width || 100,
		height: project.height || 100
	});

	$effect(() => {
		if (project.isLoaded) {
			cropRect = { x: 0, y: 0, width: project.width, height: project.height };
		}
	});

	async function applyCrop() {
		processing.start('Cropping frames...');
		try {
			const newFrames = cropFrames(project.frames, cropRect, (pct) => processing.update(pct));
			project.updateFrames(newFrames);
			project.updateDimensions(cropRect.width, cropRect.height);
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

<ToolPanel title="Crop" description="Crop the viewport of your GIF." onApply={applyCrop}>
	<div class="grid grid-cols-2 gap-3">
		<NumberInput label="X" bind:value={cropRect.x} min={0} max={project.width - 1} />
		<NumberInput label="Y" bind:value={cropRect.y} min={0} max={project.height - 1} />
		<NumberInput
			label="Width"
			bind:value={cropRect.width}
			min={1}
			max={project.width - cropRect.x}
		/>
		<NumberInput
			label="Height"
			bind:value={cropRect.height}
			min={1}
			max={project.height - cropRect.y}
		/>
	</div>
</ToolPanel>
