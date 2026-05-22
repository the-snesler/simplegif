<script lang="ts">
	import ToolPanel from '$lib/components/ToolPanel.svelte';
	import SliderInput from '$lib/components/controls/SliderInput.svelte';
	import { project } from '$lib/stores/project.svelte';
	import { processing } from '$lib/stores/processing.svelte';
	import { videoToFrames } from '$lib/processing/ffmpeg-bridge';

	let fps = $state(10);
	let fileInput = $state<HTMLInputElement | null>(null);

	async function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		processing.start('Loading ffmpeg...');
		try {
			const { fetchFile } = await import('@ffmpeg/util');
			const data = await fetchFile(file);
			processing.update(10, 'Extracting frames...');
			const { frames, width, height } = await videoToFrames(data, file.name, fps, (pct) =>
				processing.update(10 + pct * 0.9, 'Extracting frames...')
			);
			project.setSource(
				{ name: file.name, type: file.type, size: file.size, blob: file },
				frames,
				width,
				height,
				fps
			);
		} catch (err) {
			console.error('Failed to convert video:', err);
		} finally {
			processing.finish();
		}
		input.value = '';
	}
</script>

<svelte:head>
	<title>Video to GIF - SimpleGIF</title>
	<meta
		name="description"
		content="Convert MP4, WebM, AVI, MOV and other video formats to GIF. Free, runs entirely in your browser."
	/>
</svelte:head>

<ToolPanel title="Video to GIF" description="Convert any video file to an animated GIF.">
	<SliderInput label="Frame Rate (FPS)" bind:value={fps} min={1} max={30} suffix=" fps" />

	<button
		onclick={() => fileInput?.click()}
		class="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm transition-colors hover:bg-zinc-700"
	>
		Select Video File
	</button>
	<input
		bind:this={fileInput}
		type="file"
		accept="video/*,.mp4,.webm,.avi,.mov,.mkv,.flv,.wmv,.ogv"
		class="hidden"
		onchange={handleFileSelect}
	/>

	{#if project.isLoaded}
		<p class="text-xs text-zinc-500">
			Extracted {project.frameCount} frames at {fps} fps
		</p>
	{/if}
</ToolPanel>
