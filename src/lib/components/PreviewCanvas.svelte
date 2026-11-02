<script lang="ts">
	import { project } from '$lib/stores/project.svelte';
	import { cropStore } from '$lib/stores/crop.svelte';
	import { engine } from '$lib/engine/client';
	import CropOverlay from './controls/CropOverlay.svelte';

	let canvas = $state<HTMLCanvasElement | null>(null);

	// Rendering and playback happen in the engine worker; hand it the canvas once.
	$effect(() => {
		if (!canvas) return;
		engine.attachPreview(canvas.transferControlToOffscreen());
	});
</script>

<div class="relative flex min-h-48 flex-1 items-center justify-center bg-zinc-950 p-4">
	<div
		class="relative max-h-full max-w-full"
		style="aspect-ratio: {project.width}/{project.height};"
	>
		<canvas
			bind:this={canvas}
			class="max-h-full max-w-full rounded bg-zinc-900 object-contain"
			style="image-rendering: pixelated;"
		></canvas>
		{#if cropStore.active && canvas}
			<CropOverlay canvasEl={canvas} maxWidth={project.width} maxHeight={project.height} />
		{/if}
	</div>
</div>
