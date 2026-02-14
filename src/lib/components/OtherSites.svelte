<script lang="ts">
  /* eslint-disable svelte/no-navigation-without-resolve */
	import DNCamera from '~icons/dinkie-icons/camera';
	import DNDrop from '~icons/dinkie-icons/droplet';

	interface Site {
		name: string;
		description: string;
		url: string;
		internalLink: boolean;
		color: string;
		icon: typeof DNCamera;
	}

	const otherSites: Site[] = [
		{
			name: 'SimpleGIF',
			description: 'GIF creator and editor',
			url: '#',
			internalLink: true,
			icon: DNCamera,
			color: '#05df72'
		},
		{
			name: 'Paintball',
			description: 'AI Image Generator',
			url: 'https://paintball.samnesler.com',
			internalLink: false,
			icon: DNDrop,
			color: '#c27aff'
		}
	];
</script>

{#snippet siteRow(site: Site)}
	<div class="flex items-center gap-3">
		<div
			class="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center group-hover:bg-zinc-700 group-hover:border transition"
			style={`color: ${site.color}; border-color: ${site.color};`}
		>
			<svelte:component this={site.icon} class="w-4 h-4" />
		</div>
		<div>
			<h1 class="font-semibold text-sm">{site.name}</h1>
			<p class="text-xs text-zinc-500">{site.description}</p>
		</div>
	</div>
{/snippet}

<div
	popover="auto"
	id="other-sites-popover"
	class="flex-col flex m-2 w-76 rounded-xl bg-zinc-900 border border-zinc-800 shadow-lg open:animate-in fade-in zoom-in-90 not-open:animate-out fade-out zoom-out-90 fill-mode-forwards not-open:pointer-events-none z-50 text-white"
>
	{#each otherSites as site (site.name)}
		{#if site.internalLink}
			<button
				class="px-4 py-2 flex items-center justify-between border-b border-zinc-800 h-16 text-left hover:bg-zinc-800 transition-colors w-full hover:cursor-pointer group"
				popoverTarget="other-sites-popover"
				popoverTargetAction="hide"
			>
				{@render siteRow(site)}
			</button>
		{:else}
			<a
				href={site.url}
				target="_blank"
				rel="noopener noreferrer"
				class="px-4 py-2 flex items-center justify-between border-b border-zinc-800 h-16 hover:bg-zinc-800 transition-colors w-full group"
			>
				{@render siteRow(site)}
			</a>
		{/if}
	{/each}
</div>
