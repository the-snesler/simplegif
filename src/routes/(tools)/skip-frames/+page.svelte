<script lang="ts">
	import ToolPanel from '$lib/components/ToolPanel.svelte';
	import SliderInput from '$lib/components/controls/SliderInput.svelte';
	import { project } from '$lib/stores/project.svelte';
	import { processing } from '$lib/stores/processing.svelte';
	import { skipFrames } from '$lib/processing/transforms/skip-frames';

	let keepEveryN = $state(2);

	async function applySkip() {
		processing.start('Skipping frames...');
		try {
			const newFrames = skipFrames(project.frames, keepEveryN);
			project.updateFrames(newFrames);
		} catch (err) {
			console.error('Failed to skip frames:', err);
		} finally {
			processing.finish();
		}
	}

	let resultCount = $derived(Math.ceil(project.frameCount / keepEveryN));
</script>

<svelte:head>
	<title>Skip Frames - SimpleGIF</title>
	<meta
		name="description"
		content="Remove frames to reduce GIF file size and speed up playback. Free, in-browser tool."
	/>
</svelte:head>

<ToolPanel
	title="Skip Frames"
	description="Keep every Nth frame to reduce file size."
	onApply={applySkip}
>
	<SliderInput label="Keep every" bind:value={keepEveryN} min={2} max={10} suffix=" frames" />
	<p class="text-xs text-zinc-500">
		{project.frameCount} frames &rarr; {resultCount} frames
	</p>
</ToolPanel>
