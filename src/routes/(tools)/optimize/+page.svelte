<script lang="ts">
	import ToolPanel from '$lib/components/ToolPanel.svelte';
	import SliderInput from '$lib/components/controls/SliderInput.svelte';
	import { project } from '$lib/stores/project.svelte';
	import { processing } from '$lib/stores/processing.svelte';
	import { applyAction } from '$lib/stores/applyAction.svelte';
	import { optimizeFrames } from '$lib/processing/transforms/optimize';
	import type { OptimizeMethod, OptimizeOptions } from '$lib/types';

	$effect(() => {
		applyAction.set(handleApply);
		return () => applyAction.clear();
	});

	let method = $state<OptimizeMethod>('lossy');
	let maxColors = $state(128);
	let lossyLevel = $state(80);
	let dropEveryN = $state(2);
	let fuzzFactor = $state(10);

	const methods: { id: OptimizeMethod; label: string; description: string }[] = [
		{
			id: 'lossy',
			label: 'Lossy Compression',
			description:
				'Reduce color precision for smaller files. Works well with videos, photos, and images with many colors and gradients.'
		},
		{
			id: 'color-reduction',
			label: 'Color Reduction',
			description:
				'Decrease the number of colors per frame. Each GIF frame supports up to 256 colors — fewer colors means smaller files.'
		},
		{
			id: 'drop-frames',
			label: 'Remove Every Nth Frame',
			description:
				'Drop frames to reduce frame rate and file size. Useful for long GIFs with high frame rates. Duration is preserved.'
		},
		{
			id: 'deduplicate',
			label: 'Remove Duplicate Frames',
			description:
				'Detect and merge consecutive frames that are identical or very similar. Their display durations are combined.'
		},
		{
			id: 'transparency',
			label: 'Optimize Transparency',
			description:
				'Make unchanged pixels transparent between frames. Very effective for screen recordings and images with large static areas.'
		},
		{
			id: 'coalesce',
			label: 'Coalesce (Undo Optimizations)',
			description:
				'Convert each frame to a full standalone image. May increase file size but ensures compatibility with all software.'
		}
	];

	function buildOptions(): OptimizeOptions {
		return { method, maxColors, lossyLevel, dropEveryN, fuzzFactor };
	}

	async function handleApply() {
		if (!project.isLoaded) return;
		processing.start('Optimizing...');
		try {
			const opts = buildOptions();
			const optimized = optimizeFrames(project.frames, opts, (pct) => {
				processing.update(pct);
			});
			project.updateFrames(optimized);
		} catch (err) {
			console.error('Optimization failed:', err);
		} finally {
			processing.finish();
		}
	}

	let selectedMethod = $derived(methods.find((m) => m.id === method)!);
</script>

<svelte:head>
	<title>Optimize GIF - SimpleGIF</title>
	<meta
		name="description"
		content="Optimize and reduce GIF file size with lossy compression, color reduction, frame deduplication, and transparency optimization. Free, runs in your browser."
	/>
</svelte:head>

<ToolPanel title="Optimize" description="Reduce GIF file size.">
	<!-- Method selector -->
	<div class="space-y-1.5">
		<span class="text-xs text-zinc-400">Method</span>
		<div class="grid gap-1.5 grid-cols-3">
			{#each methods as m (m.id)}
				<button
					onclick={() => (method = m.id)}
					class="text-left px-3 py-2 rounded-lg border text-sm transition-colors {method === m.id
						? 'border-green-600 bg-green-950/40 text-white'
						: 'border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'}"
				>
					{m.label}
				</button>
			{/each}
		</div>
	</div>

	<!-- Description of selected method -->
	<p class="text-xs text-zinc-500">{selectedMethod.description}</p>

	<!-- Method-specific controls -->
	{#if method === 'lossy'}
		<SliderInput label="Compression Level" bind:value={lossyLevel} min={0} max={200} step={5} />
		<SliderInput label="Max Colors" bind:value={maxColors} min={2} max={256} step={2} />
	{:else if method === 'color-reduction'}
		<SliderInput label="Max Colors" bind:value={maxColors} min={2} max={256} step={2} />
	{:else if method === 'drop-frames'}
		<SliderInput
			label="Drop Every Nth Frame"
			bind:value={dropEveryN}
			min={2}
			max={10}
			step={1}
		/>
		{#if project.isLoaded}
			<p class="text-xs text-zinc-500">
				{project.frameCount} frames → ~{Math.ceil(project.frameCount * (1 - 1 / dropEveryN))} frames
				removed
			</p>
		{/if}
	{:else if method === 'deduplicate'}
		<SliderInput label="Fuzz Factor" bind:value={fuzzFactor} min={0} max={100} step={1} suffix="%" />
		<p class="text-xs text-zinc-500">
			Higher fuzz = more frames considered duplicates. 0 = exact matches only.
		</p>
	{:else if method === 'transparency'}
		<SliderInput label="Fuzz Factor" bind:value={fuzzFactor} min={0} max={100} step={1} suffix="%" />
		<p class="text-xs text-zinc-500">
			Higher fuzz = more pixels treated as unchanged. Best for screen recordings and static backgrounds.
		</p>
{/if}

</ToolPanel>
