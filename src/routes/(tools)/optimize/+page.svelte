<script lang="ts">
	/* eslint-disable @typescript-eslint/no-unused-expressions */
	import ToolPanel from '$lib/components/ToolPanel.svelte';
	import SliderInput from '$lib/components/controls/SliderInput.svelte';
	import { project } from '$lib/stores/project.svelte';
	import { processing } from '$lib/stores/processing.svelte';
	import { optimizeFrames } from '$lib/processing/transforms/optimize';
	import { estimateGifSize } from '$lib/processing/encoder';
	import { formatFileSize } from '$lib/utils/file';
	import type { OptimizeMethod, OptimizeOptions } from '$lib/types';

	let method = $state<OptimizeMethod>('lossy');
	let maxColors = $state(128);
	let lossyLevel = $state(80);
	let dropEveryN = $state(2);
	let fuzzFactor = $state(10);

	let estimatedSize = $state<number | null>(null);
	let originalSize = $state<number | null>(null);
	let isEstimating = $state(false);
	let estimateTimer: ReturnType<typeof setTimeout> | null = null;

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

	/** Whether this method needs transparency-aware encoding. */
	function needsTransparencyEncoding(m: OptimizeMethod): boolean {
		return m === 'transparency';
	}

	/** Encode max colors to pass to the encoder based on current method. */
	function encodeMaxColors(): number {
		if (method === 'color-reduction' || method === 'lossy') return maxColors;
		return 256;
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

	async function runEstimate() {
		if (!project.isLoaded) return;
		isEstimating = true;
		estimatedSize = null;

		try {
			// Get original size first
			if (originalSize === null) {
				originalSize = await estimateGifSize(project.frames, project.width, project.height);
			}

			// Apply transform to a copy of frames, then estimate
			const opts = buildOptions();
			const optimized = optimizeFrames([...project.frames], opts);

			estimatedSize = await estimateGifSize(optimized, project.width, project.height, {
				maxColors: encodeMaxColors(),
				transparencyOptimized: needsTransparencyEncoding(method)
			});
		} catch {
			estimatedSize = null;
		} finally {
			isEstimating = false;
		}
	}

	function scheduleEstimate() {
		if (estimateTimer) clearTimeout(estimateTimer);
		estimateTimer = setTimeout(runEstimate, 400);
	}

	// Re-estimate when settings change
	$effect(() => {
		// Read reactive values to subscribe
		method;
		maxColors;
		lossyLevel;
		dropEveryN;
		fuzzFactor;

		if (project.isLoaded) {
			scheduleEstimate();
		}

		return () => {
			if (estimateTimer) clearTimeout(estimateTimer);
		};
	});

	let reductionPct = $derived(
		originalSize && estimatedSize
			? Math.round(((originalSize - estimatedSize) / originalSize) * 100)
			: null
	);

	let selectedMethod = $derived(methods.find((m) => m.id === method)!);
</script>

<svelte:head>
	<title>Optimize GIF - SimpleGIF</title>
	<meta
		name="description"
		content="Optimize and reduce GIF file size with lossy compression, color reduction, frame deduplication, and transparency optimization. Free, runs in your browser."
	/>
</svelte:head>

<ToolPanel title="Optimize" description="Reduce GIF file size." onApply={handleApply} applyLabel="Apply">
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
	{:else if method === 'coalesce'}
		<p class="text-xs text-zinc-500">
			No settings needed. Each frame will become a full standalone image.
		</p>
	{/if}

	<!-- Size comparison -->
	{#if project.isLoaded}
		<div class="rounded-lg border border-zinc-700 bg-zinc-800/50 p-3 space-y-2">
			<span class="text-xs font-medium text-zinc-300">Estimated File Size</span>

			{#if isEstimating}
				<div class="flex items-center gap-2 text-xs text-zinc-500">
					<span class="inline-block w-3 h-3 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin"></span>
					Calculating...
				</div>
			{:else if originalSize !== null && estimatedSize !== null}
				<div class="space-y-1">
					<div class="flex justify-between text-xs">
						<span class="text-zinc-400">Current</span>
						<span class="text-zinc-300 tabular-nums">{formatFileSize(originalSize)}</span>
					</div>
					<div class="flex justify-between text-xs">
						<span class="text-zinc-400">Estimated</span>
						<span class="text-zinc-300 tabular-nums">{formatFileSize(estimatedSize)}</span>
					</div>
					<div class="h-px bg-zinc-700"></div>
					<div class="flex justify-between text-xs">
						<span class="text-zinc-400">Reduction</span>
						<span
							class="font-medium tabular-nums {reductionPct !== null && reductionPct > 0
								? 'text-green-400'
								: reductionPct !== null && reductionPct < 0
									? 'text-red-400'
									: 'text-zinc-300'}"
						>
							{#if reductionPct !== null}
								{reductionPct > 0 ? '-' : '+'}{Math.abs(reductionPct)}%
							{:else}
								—
							{/if}
						</span>
					</div>
				</div>
			{:else}
				<p class="text-xs text-zinc-500">Adjust settings to see estimate</p>
			{/if}
		</div>
	{/if}
</ToolPanel>
