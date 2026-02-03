<script lang="ts">
	import ToolPanel from '$lib/components/ToolPanel.svelte';
	import SliderInput from '$lib/components/controls/SliderInput.svelte';
	import DownloadButton from '$lib/components/DownloadButton.svelte';
	import { project } from '$lib/stores/project.svelte';

	let maxColors = $state(256);
</script>

<svelte:head>
	<title>Optimize GIF - SimpleGIF</title>
	<meta
		name="description"
		content="Optimize and reduce GIF file size. Adjust color count for smaller files. Free, runs in your browser."
	/>
</svelte:head>

<ToolPanel title="Optimize" description="Reduce file size by limiting colors.">
	<SliderInput
		label="Max Colors"
		bind:value={maxColors}
		min={2}
		max={256}
		step={2}
	/>

	<p class="text-xs text-zinc-500">
		Fewer colors = smaller file size. 256 is maximum quality.
	</p>

	{#if project.isLoaded}
		<div class="pt-2">
			<DownloadButton {maxColors} />
		</div>
	{/if}
</ToolPanel>
