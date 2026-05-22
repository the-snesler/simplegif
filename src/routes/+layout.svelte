<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import '@fontsource/fusion-pixel-10px-proportional-jp';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>SimpleGIF - Local GIF toolkit</title>
</svelte:head>
{@render children()}
