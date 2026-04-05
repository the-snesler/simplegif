<script lang="ts">
	import type { Snippet } from 'svelte';
	import { project } from '$lib/stores/project.svelte';
	import { processing } from '$lib/stores/processing.svelte';
	import { applyAction } from '$lib/stores/applyAction.svelte';
	import { history } from '$lib/stores/history.svelte';
	import DropZone from './DropZone.svelte';
	import PreviewCanvas from './PreviewCanvas.svelte';
	import PlaybackControls from './PlaybackControls.svelte';
	import DownloadButton from './DownloadButton.svelte';
	import PIUndo from '~icons/pixelarticons/undo';
	import PIRedo from '~icons/pixelarticons/redo';

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

	async function handleApply() {
		if (!applyAction.onApply) return;
		history.snapshot();
		await applyAction.onApply();
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
	<div class="overflow-y-scroll h-full flex flex-1 flex-col">
		<div class="flex min-h-96 flex-1 flex-col">
			<PreviewCanvas bind:this={preview} />

			<PlaybackControls
				{currentFrame}
				{isPlaying}
				onTogglePlay={handleTogglePlay}
				onFrameChange={handleFrameChange}
			/>

			{@render children?.()}

			<div class="flex justify-end gap-2 px-4 py-3 bg-zinc-950">
				<button
					onclick={() => history.undo()}
					disabled={!history.canUndo || processing.isProcessing}
					class="inline-flex size-9 items-center justify-center rounded-lg bg-zinc-800 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-30"
					title="Undo"
				>
					<PIUndo class="size-4" />
				</button>
				<button
					onclick={() => history.redo()}
					disabled={!history.canRedo || processing.isProcessing}
					class="inline-flex size-9 items-center justify-center rounded-lg bg-zinc-800 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-30"
					title="Redo"
				>
					<PIRedo class="size-4" />
				</button>
				{#if applyAction.onApply}
					<button
						onclick={handleApply}
						disabled={processing.isProcessing}
						class="rounded-lg bg-green-700 px-4 py-2 text-sm font-medium transition-colors hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{applyAction.label}
					</button>
				{/if}
				<DownloadButton />
			</div>
		</div>
	</div>
{/if}
