<script lang="ts">
	import type { Snippet } from 'svelte';
	import { project } from '$lib/stores/project.svelte';
	import { processing } from '$lib/stores/processing.svelte';
	import { applyAction } from '$lib/stores/applyAction.svelte';
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

		<div class="px-4 py-3 flex justify-end gap-2">
			{#if applyAction.onApply}
				<button
					onclick={applyAction.onApply}
					disabled={processing.isProcessing}
					class="px-4 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
				>
					{applyAction.label}
				</button>
			{/if}
			<DownloadButton />
		</div>
	</div>
{/if}
