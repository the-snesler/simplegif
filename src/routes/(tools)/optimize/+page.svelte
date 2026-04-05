<script lang="ts">
	import ToolPanel from '$lib/components/ToolPanel.svelte';
	import SliderInput from '$lib/components/controls/SliderInput.svelte';
	import { project } from '$lib/stores/project.svelte';
	import { processing } from '$lib/stores/processing.svelte';
	import { applyAction } from '$lib/stores/applyAction.svelte';
	import { optimizeFrames } from '$lib/processing/transforms/optimize';
	import { encodeGif } from '$lib/processing/encoder';
	import { decodeGif } from '$lib/processing/decoder';
	import {
		runGifsicle,
		defaultGifsicleOptions,
		type GifsicleOptions
	} from '$lib/processing/gifsicle';
	import type { OptimizeMethod, OptimizeOptions } from '$lib/types';

	$effect(() => {
		applyAction.set(handleApply);
		return () => applyAction.clear();
	});

	let method = $state<OptimizeMethod>('gifsicle');
	let maxColors = $state(128);
	let dropEveryN = $state(2);
	let fuzzFactor = $state(10);

	// Gifsicle settings
	let gifsicleOpt = $state(defaultGifsicleOptions.optimizationLevel);
	let gifsicleLossy = $state(defaultGifsicleOptions.lossy);
	let gifsicleColors = $state(defaultGifsicleOptions.colors);
	let gifsicleColorMethod = $state(defaultGifsicleOptions.colorMethod);
	let gifsicleScale = $state(defaultGifsicleOptions.scale);
	let gifsicleDither = $state(defaultGifsicleOptions.dither);

	const methods: { id: OptimizeMethod; label: string; description: string }[] = [
		{
			id: 'gifsicle',
			label: 'Lossy Compression',
			description:
				'Optimize with gifsicle — real GIF-level lossy compression and LZW optimization. Much more effective than pixel-level quantization.'
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
		return { method, maxColors, dropEveryN, fuzzFactor };
	}

	function buildGifsicleOptions(): GifsicleOptions {
		return {
			optimizationLevel: gifsicleOpt,
			lossy: gifsicleLossy,
			colors: gifsicleColors,
			colorMethod: gifsicleColorMethod,
			scale: gifsicleScale,
			dither: gifsicleDither
		};
	}

	async function handleApply() {
		if (!project.isLoaded) return;

		if (method === 'gifsicle') {
			await handleGifsicle();
		} else {
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
	}

	async function handleGifsicle() {
		applyAction.onPausePreview?.();
		processing.start('Encoding GIF for gifsicle...');
		try {
			// First encode current frames to a GIF blob
			const inputBlob = await encodeGif(project.frames, project.width, project.height);
			beforeSize = inputBlob.size;
			afterSize = null;

			processing.update(25, 'Running gifsicle...');
			const opts = buildGifsicleOptions();
			const outputBlob = await runGifsicle(inputBlob, opts);
			afterSize = outputBlob.size;

			// Store the blob for direct download (skip re-encoding)
			project.setOptimizedBlob(outputBlob);

			// Decode the result back to frames for preview
			processing.update(75, 'Updating preview...');
			const buffer = await outputBlob.arrayBuffer();
			const { frames, width, height } = await decodeGif(buffer);
			project.updateFrames(frames);
			// Re-set the blob since updateFrames clears it
			project.setOptimizedBlob(outputBlob);

			if (width !== project.width || height !== project.height) {
				project.updateDimensions(width, height);
			}
		} catch (err) {
			console.error('Gifsicle optimization failed:', err);
		} finally {
			processing.finish();
		}
	}

	let selectedMethod = $derived(methods.find((m) => m.id === method)!);

	let beforeSize = $state<number | null>(null);
	let afterSize = $state<number | null>(null);

	function formatBytes(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
	}
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
		<div class="grid grid-cols-3 gap-1.5">
			{#each methods as m (m.id)}
				<button
					onclick={() => (method = m.id)}
					class="rounded-lg border px-3 py-2 text-left text-sm transition-colors {method === m.id
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
	{#if method === 'gifsicle'}
		<div class="space-y-3">
			<SliderInput label="Lossy Level" bind:value={gifsicleLossy} min={0} max={200} step={5} />
			<p class="text-xs text-zinc-500">
				0 = lossless, higher = more compression with quality loss. 30 is a good starting point.
			</p>

			<details class="rounded-lg border border-zinc-700 bg-zinc-800/30">
				<summary
					class="cursor-pointer px-3 py-2 text-xs text-zinc-400 select-none hover:text-zinc-300"
				>
					Advanced Settings
				</summary>
				<div class="space-y-3 px-3 pt-1 pb-3">
					<div class="space-y-1.5">
						<span class="text-xs text-zinc-400">Optimization Level</span>
						<div class="grid grid-cols-4 gap-1.5">
							{#each [{ value: '', label: 'None' }, { value: '-O1', label: 'O1' }, { value: '-O2', label: 'O2' }, { value: '-O3', label: 'O3' }] as opt (opt.value)}
								<button
									onclick={() => (gifsicleOpt = opt.value)}
									class="rounded-lg border px-3 py-1.5 text-sm transition-colors {gifsicleOpt ===
									opt.value
										? 'border-green-600 bg-green-950/40 text-white'
										: 'border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'}"
								>
									{opt.label}
								</button>
							{/each}
						</div>
					</div>
					
					<SliderInput label="Color Limit" bind:value={gifsicleColors} min={0} max={256} step={1} />
					<p class="text-xs text-zinc-500">
						0 = unchanged. Lower values reduce file size but lose color detail.
					</p>

					<div class="space-y-1.5">
						<span class="text-xs text-zinc-400">Color Reduction Method</span>
						<div class="grid grid-cols-4 gap-1.5">
							{#each [{ value: '', label: 'Default' }, { value: 'diversity', label: 'Diversity' }, { value: 'blend-diversity', label: 'Blend' }, { value: 'median-cut', label: 'Median' }] as cm (cm.value)}
								<button
									onclick={() => (gifsicleColorMethod = cm.value)}
									class="rounded-lg border px-2 py-1.5 text-xs transition-colors {gifsicleColorMethod ===
									cm.value
										? 'border-green-600 bg-green-950/40 text-white'
										: 'border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'}"
								>
									{cm.label}
								</button>
							{/each}
						</div>
					</div>

					<SliderInput
						label="Scale %"
						bind:value={gifsicleScale}
						min={10}
						max={100}
						step={5}
						suffix="%"
					/>

					<div class="space-y-1.5">
						<span class="text-xs text-zinc-400">Dithering</span>
						<div class="grid grid-cols-4 gap-1.5">
							{#each [{ value: '', label: 'Default' }, { value: 'none', label: 'None' }, { value: 'ordered', label: 'Ordered' }, { value: 'floyd-steinberg', label: 'Floyd-S.' }] as d (d.value)}
								<button
									onclick={() => (gifsicleDither = d.value)}
									class="rounded-lg border px-2 py-1.5 text-xs transition-colors {gifsicleDither ===
									d.value
										? 'border-green-600 bg-green-950/40 text-white'
										: 'border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'}"
								>
									{d.label}
								</button>
							{/each}
						</div>
					</div>
				</div>
			</details>
			{#if beforeSize !== null}
				<div class="rounded-lg border border-zinc-700 bg-zinc-900/50 px-3 py-2.5">
					<div class="flex items-center justify-between text-xs">
						<span class="text-zinc-400">Before</span>
						<span class="font-mono text-zinc-300">{formatBytes(beforeSize)}</span>
					</div>
					<div class="mt-1.5 flex items-center justify-between text-xs">
						<span class="text-zinc-400">After</span>
						<span class="font-mono {afterSize === null ? 'text-zinc-500' : afterSize < beforeSize ? 'text-green-400' : 'text-red-400'}">
							{afterSize === null ? '—' : formatBytes(afterSize)}
						</span>
					</div>
					{#if afterSize !== null}
						<div class="mt-1.5 border-t border-zinc-700 pt-1.5 text-xs text-zinc-500">
							{afterSize < beforeSize
								? `−${(((beforeSize - afterSize) / beforeSize) * 100).toFixed(1)}% smaller`
								: afterSize > beforeSize
									? `+${(((afterSize - beforeSize) / beforeSize) * 100).toFixed(1)}% larger`
									: 'No change'}
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{:else if method === 'color-reduction'}
		<SliderInput label="Max Colors" bind:value={maxColors} min={2} max={256} step={2} />
	{:else if method === 'drop-frames'}
		<SliderInput label="Drop Every Nth Frame" bind:value={dropEveryN} min={2} max={10} step={1} />
		{#if project.isLoaded}
			<p class="text-xs text-zinc-500">
				{project.frameCount} frames → ~{Math.ceil(project.frameCount * (1 - 1 / dropEveryN))} frames removed
			</p>
		{/if}
	{:else if method === 'deduplicate'}
		<SliderInput
			label="Fuzz Factor"
			bind:value={fuzzFactor}
			min={0}
			max={100}
			step={1}
			suffix="%"
		/>
		<p class="text-xs text-zinc-500">
			Higher fuzz = more frames considered duplicates. 0 = exact matches only.
		</p>
	{:else if method === 'transparency'}
		<SliderInput
			label="Fuzz Factor"
			bind:value={fuzzFactor}
			min={0}
			max={100}
			step={1}
			suffix="%"
		/>
		<p class="text-xs text-zinc-500">
			Higher fuzz = more pixels treated as unchanged. Best for screen recordings and static
			backgrounds.
		</p>
	{/if}
</ToolPanel>
