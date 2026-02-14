<script lang="ts">
	import { project } from '$lib/stores/project.svelte';
	import { filmstrip } from '$lib/stores/filmstrip.svelte';
	import { cropStore } from '$lib/stores/crop.svelte';
	import CropOverlay from './controls/CropOverlay.svelte';
	import { untrack } from 'svelte';

	let canvas = $state<HTMLCanvasElement | null>(null);
	let currentFrame = $state(0);
	let isPlaying = $state(true);

	// Not reactive — only used for animation bookkeeping
	let animationId: number | null = null;
	let lastFrameTime = 0;

	export function getCurrentFrame() {
		return currentFrame;
	}

	export function setCurrentFrame(frame: number) {
		currentFrame = frame;
		renderFrame();
	}

	export function getIsPlaying() {
		return isPlaying;
	}

	export function togglePlayback() {
		if (isPlaying) {
			pause();
		} else {
			play();
		}
	}

	function play() {
		isPlaying = true;
		lastFrameTime = performance.now();
		animate();
	}

	function pause() {
		isPlaying = false;
		if (animationId !== null) {
			cancelAnimationFrame(animationId);
			animationId = null;
		}
	}

	function animate() {
		if (!isPlaying || project.frameCount === 0) return;

		const now = performance.now();
		const frame = project.frames[currentFrame];
		const delay = frame?.delay || 100;

		if (now - lastFrameTime >= delay) {
			// When trim mode is active, loop within trim bounds
			if (filmstrip.trimMode) {
				const start = filmstrip.trimStart;
				const end = filmstrip.trimEnd;
				currentFrame = currentFrame >= end ? start : currentFrame + 1;
			} else {
				currentFrame = (currentFrame + 1) % project.frameCount;
			}
			renderFrame();
			lastFrameTime = now;
		}

		animationId = requestAnimationFrame(animate);
	}

	function renderFrame() {
		if (!canvas || project.frameCount === 0) return;

		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const frame = project.frames[currentFrame];
		if (!frame) return;

		canvas.width = project.width;
		canvas.height = project.height;
		ctx.putImageData(frame.imageData, 0, 0);
	}

	$effect(() => {
		// Track only these dependencies
		const loaded = project.isLoaded;
		const count = project.frameCount;

		if (loaded && count > 0) {
			untrack(() => {
				// Stop any existing animation before restarting
				if (animationId !== null) {
					cancelAnimationFrame(animationId);
					animationId = null;
				}
				currentFrame = 0;
				renderFrame();
				if (count > 1) {
					play();
				}
			});
		}

		return () => {
			if (animationId !== null) {
				cancelAnimationFrame(animationId);
				animationId = null;
			}
		};
	});
</script>

<div class="flex-1 flex items-center justify-center bg-zinc-950 min-h-48 p-4 relative">
	<div class="relative max-w-full max-h-full" style="aspect-ratio: {project.width}/{project.height};">
		<canvas
			bind:this={canvas}
			width={project.width}
			height={project.height}
			class="max-w-full max-h-full object-contain rounded bg-zinc-900"
			style="image-rendering: pixelated;"
		></canvas>
		{#if cropStore.active && canvas}
			<CropOverlay canvasEl={canvas} maxWidth={project.width} maxHeight={project.height} />
		{/if}
	</div>
</div>
