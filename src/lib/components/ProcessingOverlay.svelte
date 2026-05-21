<script lang="ts">
	import { processing } from '$lib/stores/processing.svelte';
</script>

{#if processing.isProcessing}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
		role="status"
		aria-live="polite"
	>
		<div class="w-80 rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
			<p class="mb-3 text-sm text-zinc-300">{processing.statusText || 'Processing...'}</p>
			<div class="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
				<div
					class="h-full rounded-full bg-green-500 transition-all duration-500 ease-out"
					style="width: {processing.progress}%"
				></div>
			</div>
			<p class="mt-2 text-right text-xs text-zinc-500">{Math.round(processing.progress)}%</p>
		</div>
	</div>
{/if}
