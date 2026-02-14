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
	{/if}
</div>
