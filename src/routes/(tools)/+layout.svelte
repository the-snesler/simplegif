<script lang="ts">
	import Sidebar from '$lib/components/Sidebar.svelte';
	import MobileHeader from '$lib/components/MobileHeader.svelte';
	import Editor from '$lib/components/Editor.svelte';
	import ProcessingOverlay from '$lib/components/ProcessingOverlay.svelte';

	let { children } = $props();
</script>

<div class="flex flex-col md:flex-row h-screen text-white bg-zinc-950">
	<MobileHeader />
	<Sidebar />
	<main class="flex-1 flex flex-col min-w-0">
		<Editor>
			{@render children()}
		</Editor>
	</main>
	<ProcessingOverlay />
</div>
