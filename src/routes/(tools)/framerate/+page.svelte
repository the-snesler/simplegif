<script lang="ts">
	import ToolPanel from '$lib/components/ToolPanel.svelte';
	import SliderInput from '$lib/components/controls/SliderInput.svelte';
	import { project } from '$lib/stores/project.svelte';
	import { processing } from '$lib/stores/processing.svelte';
	import { applyAction } from '$lib/stores/applyAction.svelte';
	import { engine } from '$lib/engine/client';

	$effect(() => {
		applyAction.set(applyFrameRate);
		return () => applyAction.clear();
	});

	let targetFps = $state(10);

	$effect(() => {
		if (project.isLoaded) {
			targetFps = project.frameRate;
		}
	});

	async function applyFrameRate() {
		processing.start('Adjusting frame rate...');
		try {
			await engine.edit({ op: 'framerate', fps: targetFps });
		} catch (err) {
			console.error('Failed to change frame rate:', err);
		} finally {
			processing.finish();
		}
	}

	let delay = $derived(Math.round(1000 / targetFps));
</script>

<svelte:head>
	<title>Frame Rate Control - SimpleGIF</title>
	<meta
		name="description"
		content="Change the frame rate and playback speed of your GIF. Free, runs entirely in your browser."
	/>
</svelte:head>

<ToolPanel title="Frame Rate" description="Adjust the playback speed of your GIF.">
	<SliderInput label="Target FPS" bind:value={targetFps} min={1} max={50} suffix=" fps" />
	<p class="text-xs text-zinc-500">
		Frame delay: {delay}ms
	</p>
</ToolPanel>
