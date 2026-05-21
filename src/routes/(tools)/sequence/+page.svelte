<script lang="ts">
	import ToolPanel from '$lib/components/ToolPanel.svelte';
	import SliderInput from '$lib/components/controls/SliderInput.svelte';
	import { project } from '$lib/stores/project.svelte';
	import { processing } from '$lib/stores/processing.svelte';
	import { imageSequenceToFrames } from '$lib/processing/ffmpeg-bridge';

	let fps = $state(10);
	let fileInput = $state<HTMLInputElement | null>(null);

	async function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		const files = input.files;
		if (!files || files.length === 0) return;

		const imageFiles = Array.from(files).filter(
			(f) => f.type.startsWith('image/') || /\.(png|jpg|jpeg|webp|bmp)$/i.test(f.name)
		);
		if (imageFiles.length === 0) return;

		processing.start('Loading images...');
		try {
			const { frames, width, height } = await imageSequenceToFrames(imageFiles, fps, (pct) =>
				processing.update(pct, 'Processing images...')
			);
			project.setSource(
				{
					name: `${imageFiles.length} images`,
					type: 'image/sequence',
					size: imageFiles.reduce((sum, f) => sum + f.size, 0),
					blob: new Blob()
				},
				frames,
				width,
				height,
				fps
			);
		} catch (err) {
			console.error('Failed to load image sequence:', err);
		} finally {
			processing.finish();
		}
		input.value = '';
	}
</script>

<svelte:head>
	<title>Image Sequence to GIF - SimpleGIF</title>
	<meta
		name="description"
		content="Convert a folder of images into an animated GIF. Free, runs entirely in your browser."
	/>
</svelte:head>

<ToolPanel title="Image Sequence" description="Create a GIF from a series of images.">
	<SliderInput label="Frame Rate (FPS)" bind:value={fps} min={1} max={30} suffix=" fps" />

	<button
		onclick={() => fileInput?.click()}
		class="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm transition-colors hover:bg-zinc-700"
	>
		Select Images
	</button>
	<input
		bind:this={fileInput}
		type="file"
		accept="image/png,image/jpeg,image/webp,image/bmp,.png,.jpg,.jpeg,.webp,.bmp"
		multiple
		class="hidden"
		onchange={handleFileSelect}
	/>

	{#if project.isLoaded}
		<p class="text-xs text-zinc-500">
			{project.frameCount} frames at {fps} fps
		</p>
	{/if}
</ToolPanel>
