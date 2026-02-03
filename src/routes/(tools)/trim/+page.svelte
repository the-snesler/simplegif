<script lang="ts">
	import ToolPanel from '$lib/components/ToolPanel.svelte';
	import SliderInput from '$lib/components/controls/SliderInput.svelte';
	import { project } from '$lib/stores/project.svelte';
	import { processing } from '$lib/stores/processing.svelte';
	import { trimFrames } from '$lib/processing/transforms/trim';

	let startFrame = $state(0);
	let endFrame = $state(0);

	$effect(() => {
		if (project.isLoaded) {
			startFrame = 0;
			endFrame = project.frameCount - 1;
		}
	});

	async function applyTrim() {
		processing.start('Trimming frames...');
		try {
			const newFrames = trimFrames(project.frames, startFrame, endFrame);
			project.updateFrames(newFrames);
		} catch (err) {
			console.error('Failed to trim:', err);
		} finally {
			processing.finish();
		}
	}

	let keptFrames = $derived(Math.max(0, endFrame - startFrame + 1));
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
	description="Remove frames from the start and/or end."
	onApply={applyTrim}
>
	<SliderInput
		label="Start Frame"
		bind:value={startFrame}
		min={0}
		max={Math.max(0, project.frameCount - 1)}
	/>
	<SliderInput
		label="End Frame"
		bind:value={endFrame}
		min={0}
		max={Math.max(0, project.frameCount - 1)}
	/>
	<p class="text-xs text-zinc-500">
		Keeping {keptFrames} of {project.frameCount} frames
	</p>
</ToolPanel>
