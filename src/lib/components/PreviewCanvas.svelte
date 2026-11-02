<script lang="ts">
	import { project } from '$lib/stores/project.svelte';
	import { filmstrip } from '$lib/stores/filmstrip.svelte';
	import { cropStore } from '$lib/stores/crop.svelte';
	import { playback } from '$lib/stores/playback.svelte';
	import type { FrameData } from '$lib/types';
	import CropOverlay from './controls/CropOverlay.svelte';
	import { untrack } from 'svelte';

	// Skip GPU bitmap caching above this many bytes of RGBA (falls back to putImageData).
	const MAX_BITMAP_BYTES = 512 * 1024 * 1024;

	let canvas = $state<HTMLCanvasElement | null>(null);

	// Not reactive — only used for animation / render bookkeeping
	let animationId: number | null = null;
	let lastFrameTime = 0;
	let ctx: CanvasRenderingContext2D | null = null;
	let bitmaps: ImageBitmap[] | null = null;
	let bitmapsFor: FrameData[] | null = null;
	let bitmapGeneration = 0;

	export function getCurrentFrame() {
		return playback.currentFrame;
	}

	export function setCurrentFrame(frame: number) {
		playback.currentFrame = frame;
		renderFrame();
	}

	export function getIsPlaying() {
		return playback.isPlaying;
	}

	export function togglePlayback() {
		if (playback.isPlaying) {
			pause();
		} else {
			play();
		}
	}

	export function play() {
		playback.isPlaying = true;
		lastFrameTime = performance.now();
		if (animationId === null) animate();
	}

	export function pause() {
		playback.isPlaying = false;
		if (animationId !== null) {
			cancelAnimationFrame(animationId);
			animationId = null;
		}
	}

	function animate() {
		animationId = null;
		if (!playback.isPlaying || project.frameCount === 0) return;

		const now = performance.now();
		const current = playback.currentFrame;
		const frame = project.frames[current];
		const delay = frame?.delay || 100;

		if (now - lastFrameTime >= delay) {
			// When trim mode is active, loop within trim bounds
			if (filmstrip.trimMode) {
				const start = filmstrip.trimStart;
				const end = filmstrip.trimEnd;
				playback.currentFrame = current >= end ? start : current + 1;
			} else {
				playback.currentFrame = (current + 1) % project.frameCount;
			}
			renderFrame();
			lastFrameTime = now;
		}

		animationId = requestAnimationFrame(animate);
	}

	function renderFrame() {
		if (!canvas || project.frameCount === 0) return;

		const frames = project.frames;
		const index = playback.currentFrame;
		const frame = frames[index];
		if (!frame) return;

		// Only touch canvas dimensions when they change — assigning width/height
		// reallocates the backing store and clears it.
		if (canvas.width !== project.width) canvas.width = project.width;
		if (canvas.height !== project.height) canvas.height = project.height;

		ctx ??= canvas.getContext('2d');
		if (!ctx) return;

		const bitmap = bitmapsFor === frames ? bitmaps?.[index] : undefined;
		if (bitmap) {
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			ctx.drawImage(bitmap, 0, 0);
		} else {
			ctx.putImageData(frame.imageData, 0, 0);
		}
	}

	function releaseBitmaps() {
		bitmaps?.forEach((b) => b.close());
		bitmaps = null;
		bitmapsFor = null;
	}

	// Build GPU-backed bitmaps whenever the frame array changes. Until they're
	// ready, renderFrame falls back to putImageData.
	$effect(() => {
		const frames = project.frames;
		const generation = ++bitmapGeneration;

		const bytes = frames.reduce((sum, f) => sum + f.imageData.data.byteLength, 0);
		if (frames.length > 0 && bytes <= MAX_BITMAP_BYTES) {
			Promise.all(frames.map((f) => createImageBitmap(f.imageData)))
				.then((result) => {
					if (generation !== bitmapGeneration) {
						result.forEach((b) => b.close());
						return;
					}
					bitmaps = result;
					bitmapsFor = frames;
					untrack(renderFrame);
				})
				.catch((err) => console.warn('Failed to create frame bitmaps:', err));
		}

		return () => {
			// Invalidate any in-flight build and free bitmaps for the old frames
			bitmapGeneration++;
			releaseBitmaps();
		};
	});

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
				playback.currentFrame = 0;
				renderFrame();
				if (count > 1) {
					play();
				} else {
					playback.isPlaying = false;
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

	$effect(() => {
		// Canvas element replaced (e.g. remount) — drop the cached context
		void canvas;
		ctx = null;
	});
</script>

<div class="relative flex min-h-48 flex-1 items-center justify-center bg-zinc-950 p-4">
	<div
		class="relative max-h-full max-w-full"
		style="aspect-ratio: {project.width}/{project.height};"
	>
		<canvas
			bind:this={canvas}
			width={project.width}
			height={project.height}
			class="max-h-full max-w-full rounded bg-zinc-900 object-contain"
			style="image-rendering: pixelated;"
		></canvas>
		{#if cropStore.active && canvas}
			<CropOverlay canvasEl={canvas} maxWidth={project.width} maxHeight={project.height} />
		{/if}
	</div>
</div>
