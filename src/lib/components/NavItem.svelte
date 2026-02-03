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
	class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors {isActive
		? 'bg-zinc-700/50 text-white'
		: 'text-zinc-400 hover:text-white hover:bg-zinc-800'}"
>
	<span class="w-5 h-5 flex items-center justify-center shrink-0">
		{@render icon()}
	</span>
	<span>{label}</span>
</a>
