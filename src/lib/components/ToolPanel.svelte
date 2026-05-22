<script lang="ts">
	import type { Snippet } from 'svelte';
	import { project } from '$lib/stores/project.svelte';

	let {
		title,
		description = '',
		children
	}: {
		title: string;
		description?: string;
		children?: Snippet;
	} = $props();
</script>

<div class="border-t border-b border-zinc-800 bg-zinc-950">
	<div class="border-b border-zinc-800 px-4 py-3">
		<h2 class="text-sm font-medium">{title}</h2>
		{#if description}
			<p class="mt-1 text-xs text-zinc-500">{description}</p>
		{/if}
	</div>

	{#if !project.isLoaded}
		<div class="px-4 py-6 text-center text-sm text-zinc-500">
			Load a file first to use this tool.
		</div>
	{:else}
		<div class="space-y-3 px-4 py-3">
			{@render children?.()}
		</div>
	{/if}
</div>
