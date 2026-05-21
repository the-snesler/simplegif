<script lang="ts">
	import { resolve } from '$app/paths';
	import { project } from '$lib/stores/project.svelte';
	import { warnings } from '$lib/stores/warnings.svelte';
	import PIWarningBox from '~icons/pixelarticons/warning-box';

	const POPOVER_ID = 'warnings-popover';
</script>

{#if project.isLoaded && warnings.hasAny}
	<div class="relative">
		<button
			popoverTarget={POPOVER_ID}
			class="inline-flex size-9 items-center justify-center rounded-lg bg-yellow-500/15 text-yellow-400 ring-1 ring-yellow-500/40 transition-colors hover:bg-yellow-500/25"
			title={`${warnings.count} warning${warnings.count === 1 ? '' : 's'}`}
			aria-label={`${warnings.count} warning${warnings.count === 1 ? '' : 's'}`}
		>
			<PIWarningBox class="size-4" />
		</button>

		<dialog
			id={POPOVER_ID}
			popover="auto"
			class="warnings-popover m-0 mt-2 mr-4 ml-auto w-80 max-w-[90vw] rounded-lg border border-yellow-500/40 bg-zinc-900 p-0 text-zinc-100"
		>
			<div
				class="flex items-center gap-2 border-b border-zinc-800 px-4 py-3 text-sm font-medium text-yellow-400"
			>
				<PIWarningBox class="size-4" />
				Suggestions for a smaller GIF
			</div>
			<ul class="divide-y divide-zinc-800">
				{#each warnings.list as w (w.id)}
					<li class="space-y-2 px-4 py-3">
						<div class="text-sm font-medium">{w.title}</div>
						<div class="text-xs text-zinc-400">{w.description}</div>
						<div class="flex flex-wrap gap-2">
							{#each w.links as l (l.href)}
								<a
									href={resolve(l.href)}
									onclick={() => document.getElementById(POPOVER_ID)?.hidePopover()}
									class="rounded bg-zinc-800 px-2 py-1 text-xs text-green-400 transition-colors hover:bg-zinc-700"
								>
									{l.label}
								</a>
							{/each}
						</div>
					</li>
				{/each}
			</ul>
		</dialog>
	</div>
{/if}

<style>
	.warnings-popover {
		position: fixed;
		inset: auto 1rem 4.5rem auto;
	}
	.warnings-popover::backdrop {
		background: transparent;
	}
</style>
