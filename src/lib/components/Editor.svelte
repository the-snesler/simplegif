<script lang="ts">
	import type { Snippet } from 'svelte';
	import { project } from '$lib/stores/project.svelte';
	import DropZone from './DropZone.svelte';
	import PreviewCanvas from './PreviewCanvas.svelte';
	import PlaybackControls from './PlaybackControls.svelte';
	import DownloadButton from './DownloadButton.svelte';

	let { children }: { children?: Snippet } = $props();

	let preview = $state<PreviewCanvas | null>(null);
	let currentFrame = $state(0);
	let isPlaying = $state(false);

	function handleTogglePlay() {
		preview?.togglePlayback();
		isPlaying = preview?.getIsPlaying() ?? false;
	}

	function handleFrameChange(frame: number) {
		preview?.setCurrentFrame(frame);
		currentFrame = frame;
	}

	// Sync state from preview on animation
	$effect(() => {
		if (!preview || !project.isLoaded) return;

		const interval = setInterval(() => {
			currentFrame = preview?.getCurrentFrame() ?? 0;
			isPlaying = preview?.getIsPlaying() ?? false;
		}, 50);

		return () => clearInterval(interval);
	});
</script>

{#if !project.isLoaded}
	<DropZone />
{:else}
	<div class="flex-1 flex flex-col min-h-0">
		<PreviewCanvas bind:this={preview} />

		<PlaybackControls
			{currentFrame}
			{isPlaying}
			onTogglePlay={handleTogglePlay}
			onFrameChange={handleFrameChange}
		/>

		{@render children?.()}

		<div class="px-4 py-3 border-t border-zinc-800 bg-zinc-900 flex justify-end">
			<DownloadButton />
		</div>
	</div>
{/if}
