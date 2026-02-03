<script lang="ts">
	import type { Snippet } from 'svelte';
	import { project } from '$lib/stores/project.svelte';
	import { processing } from '$lib/stores/processing.svelte';

	let {
		title,
		description = '',
		onApply,
		applyLabel = 'Apply',
		children
	}: {
		title: string;
		description?: string;
		onApply?: () => void;
		applyLabel?: string;
		children?: Snippet;
	} = $props();
</script>

<div class="border-t border-zinc-800 bg-zinc-900">
	<div class="px-4 py-3 border-b border-zinc-800">
		<h2 class="font-medium text-sm">{title}</h2>
		{#if description}
			<p class="text-xs text-zinc-500 mt-1">{description}</p>
		{/if}
	</div>

	{#if !project.isLoaded}
		<div class="px-4 py-6 text-center text-sm text-zinc-500">
			Load a file first to use this tool.
		</div>
	{:else}
		<div class="px-4 py-3 space-y-3">
			{@render children?.()}
		</div>

		{#if onApply}
			<div class="px-4 py-3 border-t border-zinc-800">
				<button
					onclick={onApply}
					disabled={processing.isProcessing}
					class="w-full px-4 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
				>
					{applyLabel}
				</button>
			</div>
		{/if}
	{/if}
</div>
