<script lang="ts">
	import { processing } from '$lib/stores/processing.svelte';
</script>

{#if processing.isProcessing}
	<div
		class="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
		role="status"
		aria-live="polite"
	>
		<div class="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-80 shadow-2xl">
			<p class="text-sm text-zinc-300 mb-3">{processing.statusText || 'Processing...'}</p>
			<div class="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
				<div
					class="bg-green-500 h-full rounded-full transition-all duration-200"
					style="width: {processing.progress}%"
				></div>
			</div>
			<p class="text-xs text-zinc-500 mt-2 text-right">{Math.round(processing.progress)}%</p>
		</div>
	</div>
{/if}
