<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type { Pathname } from '$app/types';

	let {
		href,
		label,
		icon
	}: {
		href: Pathname;
		label: string;
		icon: Snippet;
	} = $props();

	let isActive = $derived(page.url.pathname === href);
</script>

<a
	href={resolve(href)}
	class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors {isActive
		? 'bg-zinc-700/50 text-white'
		: 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}"
>
	<span class="flex h-5 w-5 shrink-0 items-center justify-center">
		{@render icon()}
	</span>
	<span>{label}</span>
</a>
