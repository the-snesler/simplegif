<script lang="ts">
	import { project } from '$lib/stores/project.svelte';

	let {
		currentFrame = 0,
		isPlaying = false,
		onTogglePlay,
		onFrameChange
	}: {
		currentFrame?: number;
		isPlaying?: boolean;
		onTogglePlay?: () => void;
		onFrameChange?: (frame: number) => void;
	} = $props();

	function handleScrub(e: Event) {
		const input = e.target as HTMLInputElement;
		onFrameChange?.(parseInt(input.value));
	}

	function stepFrame(delta: number) {
		const next = Math.max(0, Math.min(project.frameCount - 1, currentFrame + delta));
		onFrameChange?.(next);
	}

</script>

<div class="flex items-center gap-3 px-4 py-2 border-t border-zinc-800 bg-zinc-900 text-sm">
	<button
		onclick={onTogglePlay}
		class="w-8 h-8 flex items-center justify-center rounded hover:bg-zinc-800 text-zinc-300 transition-colors"
		title={isPlaying ? 'Pause' : 'Play'}
	>
		{#if isPlaying}
			<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
				<rect x="6" y="4" width="4" height="16" />
				<rect x="14" y="4" width="4" height="16" />
			</svg>
		{:else}
			<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
				<polygon points="5,3 19,12 5,21" />
			</svg>
		{/if}
	</button>

	<button
		onclick={() => stepFrame(-1)}
		class="w-6 h-6 flex items-center justify-center rounded hover:bg-zinc-800 text-zinc-400 transition-colors"
		title="Previous frame"
	>
		<svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
			<polygon points="15,3 5,12 15,21" />
		</svg>
	</button>

	<input
		type="range"
		min="0"
		max={Math.max(0, project.frameCount - 1)}
		value={currentFrame}
		oninput={handleScrub}
		class="flex-1 h-1 accent-green-500"
	/>

	<button
		onclick={() => stepFrame(1)}
		class="w-6 h-6 flex items-center justify-center rounded hover:bg-zinc-800 text-zinc-400 transition-colors"
		title="Next frame"
	>
		<svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
			<polygon points="9,3 19,12 9,21" />
		</svg>
	</button>

	<span class="text-zinc-500 tabular-nums min-w-[5rem] text-right">
		{currentFrame + 1} / {project.frameCount}
	</span>
</div>
