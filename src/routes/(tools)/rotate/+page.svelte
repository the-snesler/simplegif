<script lang="ts">
	import ToolPanel from '$lib/components/ToolPanel.svelte';
	import { project } from '$lib/stores/project.svelte';
	import { processing } from '$lib/stores/processing.svelte';
	import { applyAction } from '$lib/stores/applyAction.svelte';
	import { rotateFrames } from '$lib/processing/transforms/rotate';
	import type { RotateOptions } from '$lib/types';

	$effect(() => {
		applyAction.set(applyRotate);
		return () => applyAction.clear();
	});

	let degrees = $state<0 | 90 | 180 | 270>(0);
	let flipH = $state(false);
	let flipV = $state(false);

	async function applyRotate() {
		const options: RotateOptions = { degrees, flipH, flipV };
		processing.start('Rotating frames...');
		try {
			const newFrames = rotateFrames(project.frames, options, (pct) => processing.update(pct));
			const swapDims = degrees === 90 || degrees === 270;
			const newW = swapDims ? project.height : project.width;
			const newH = swapDims ? project.width : project.height;
			project.updateFrames(newFrames);
			project.updateDimensions(newW, newH);
		} catch (err) {
			console.error('Failed to rotate:', err);
		} finally {
			processing.finish();
		}
	}
</script>

<svelte:head>
	<title>Rotate & Flip GIF - SimpleGIF</title>
	<meta
		name="description"
		content="Rotate and flip your GIF. 90, 180, 270 degrees rotation and horizontal/vertical flip. Free, in-browser."
	/>
</svelte:head>

<ToolPanel title="Rotate / Flip" description="Rotate or flip every frame.">
	<div>
		<span class="mb-2 block text-xs text-zinc-400">Rotation</span>
		<div class="grid grid-cols-4 gap-1">
			{#each [0, 90, 180, 270] as deg (deg)}
				<button
					onclick={() => (degrees = deg as 0 | 90 | 180 | 270)}
					class="rounded px-2 py-1.5 text-xs transition-colors {degrees === deg
						? 'bg-green-700 text-white'
						: 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}"
				>
					{deg}&deg;
				</button>
			{/each}
		</div>
	</div>

	<div class="flex gap-3">
		<label class="flex items-center gap-2 text-sm text-zinc-300">
			<input type="checkbox" bind:checked={flipH} class="rounded border-zinc-600" />
			Flip horizontal
		</label>
		<label class="flex items-center gap-2 text-sm text-zinc-300">
			<input type="checkbox" bind:checked={flipV} class="rounded border-zinc-600" />
			Flip vertical
		</label>
	</div>
</ToolPanel>
