<script lang="ts">
	import Sidebar from '$lib/components/Sidebar.svelte';
	import MobileHeader from '$lib/components/MobileHeader.svelte';
	import Editor from '$lib/components/Editor.svelte';
	import ProcessingOverlay from '$lib/components/ProcessingOverlay.svelte';

	let { children } = $props();
</script>

<div class="flex h-screen flex-col bg-zinc-950 text-white md:flex-row">
	<MobileHeader />
	<Sidebar />
	<main class="flex min-w-0 flex-1 flex-col">
		<Editor>
			{@render children()}
		</Editor>
	</main>
	<ProcessingOverlay />
</div>
