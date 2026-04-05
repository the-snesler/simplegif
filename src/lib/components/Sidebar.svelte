<script lang="ts">
	import DNCamera from '~icons/dinkie-icons/camera';
	import DNMovieCamera from '~icons/dinkie-icons/movie-camera';
	import DNFilmFrames from '~icons/dinkie-icons/film-frames';
	import DNBigger from '~icons/dinkie-icons/bigger';
	import DNSmaller from '~icons/dinkie-icons/smaller';
	import DNDeviceRotate from '~icons/dinkie-icons/device-rotate';
	import DNRepeatArrow from '~icons/dinkie-icons/repeat-arrow';
	import DNShuffleArrows from '~icons/dinkie-icons/shuffle-arrows';
	import DNAdjustments from '~icons/dinkie-icons/adjustments';
	import DNZoomIn from '~icons/dinkie-icons/zoom-in';
	import DNMenu from '~icons/dinkie-icons/menu-small';
	import DNArrowsMaximize from '~icons/dinkie-icons/arrows-maximize';
	import DNFire from '~icons/dinkie-icons/fire';
	import DNBlackCrossSquare from '~icons/dinkie-icons/black-cross-square';
	import NavItem from './NavItem.svelte';
	import { project } from '$lib/stores/project.svelte';
	import { formatFileSize } from '$lib/utils/file';

	const SIDEBAR_POPOVER_ID = 'sidebar-popover';
</script>

{#snippet sidebarContent()}
	<div
		class="px-6 py-4 flex items-center justify-between border-b border-zinc-800 h-18 from-green-950 to-zinc-900 bg-linear-to-br"
	>
		<div class="flex items-center gap-3 text-left">
			<div
				class="w-8 h-8 rounded-lg bg-green-900 border border-green-700 flex items-center justify-center"
			>
				<DNCamera class="text-green-400" />
			</div>
			<div>
				<h1 class="font-semibold text-sm text-white">SimpleGIF</h1>
				<p class="text-xs text-zinc-500">Local GIF toolkit</p>
			</div>
		</div>
		<div class="flex items-center gap-1">
			<button
				popoverTarget={SIDEBAR_POPOVER_ID}
				popoverTargetAction="hide"
				class="p-2 rounded-lg hover:bg-zinc-800 transition-colors md:hidden"
				aria-label="Close sidebar"
			>
				<DNBlackCrossSquare class="w-4 h-4 text-zinc-400" />
			</button>
		</div>
	</div>

	{#if project.isLoaded}
		<div class="px-4 py-3 border-b border-zinc-800 text-xs text-zinc-400 space-y-1">
			<div class="truncate font-medium text-zinc-300">{project.sourceFile?.name}</div>
			<div class="flex gap-3">
				<span>{project.width}&times;{project.height}</span>
				<span>{project.frameCount} frames</span>
				{#if project.sourceFile}
					<span>{formatFileSize(project.sourceFile.size)}</span>
				{/if}
			</div>
			<div class="px-4 py-3">
				<button
					onclick={() => project.reset()}
					class="w-full px-3 py-2 text-sm group text-zinc-400 hover:text-white hover:bg-red-800 rounded-lg transition-colors border border-zinc-800 hover:border-red-700 flex items-center justify-center"
				>
					<DNFire class="inline-block mr-2" />
					Clear File
				</button>
			</div>
		</div>
	{/if}

	<nav class="flex-1 overflow-y-auto px-3 py-3 space-y-1">
		<div class="px-3 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wider">
			Create
		</div>
		<NavItem href="/convert" label="Video to GIF">
			{#snippet icon()}<DNMovieCamera class="w-4 h-4" />{/snippet}
		</NavItem>
		<NavItem href="/sequence" label="Image Sequence">
			{#snippet icon()}<DNFilmFrames class="w-4 h-4" />{/snippet}
		</NavItem>

		<div class="px-3 pt-4 pb-2 text-xs font-medium text-zinc-500 uppercase tracking-wider">
			Edit
		</div>
		<NavItem href="/crop" label="Crop">
			{#snippet icon()}<DNArrowsMaximize class="w-4 h-4" />{/snippet}
		</NavItem>
		<NavItem href="/resize" label="Resize">
			{#snippet icon()}<DNBigger class="w-4 h-4" />{/snippet}
		</NavItem>
		<NavItem href="/trim" label="Trim">
			{#snippet icon()}<DNSmaller class="w-4 h-4" />{/snippet}
		</NavItem>
		<NavItem href="/rotate" label="Rotate / Flip">
			{#snippet icon()}<DNDeviceRotate class="w-4 h-4" />{/snippet}
		</NavItem>

		<div class="px-3 pt-4 pb-2 text-xs font-medium text-zinc-500 uppercase tracking-wider">
			Adjust
		</div>
		<NavItem href="/reverse" label="Reverse">
			{#snippet icon()}<DNRepeatArrow class="w-4 h-4" />{/snippet}
		</NavItem>
		<NavItem href="/framerate" label="Frame Rate">
			{#snippet icon()}<DNAdjustments class="w-4 h-4" />{/snippet}
		</NavItem>
		<NavItem href="/skip-frames" label="Skip Frames">
			{#snippet icon()}<DNShuffleArrows class="w-4 h-4" />{/snippet}
		</NavItem>

		<div class="px-3 pt-4 pb-2 text-xs font-medium text-zinc-500 uppercase tracking-wider">
			Export
		</div>
		<NavItem href="/optimize" label="Optimize">
			{#snippet icon()}<DNZoomIn class="w-4 h-4" />{/snippet}
		</NavItem>
	</nav>
{/snippet}

<!-- Desktop sidebar -->
<aside class="hidden md:flex w-80 shrink-0 border-r border-zinc-800 bg-zinc-900 flex-col h-full">
	{@render sidebarContent()}
</aside>

<!-- Mobile sidebar popover -->
<aside
	id={SIDEBAR_POPOVER_ID}
	popover="auto"
	class="sidebar-popover md:hidden m-0 p-0 w-80 max-w-[85vw] h-full max-h-full border-0 border-r border-zinc-800 bg-zinc-900 flex flex-col"
>
	{@render sidebarContent()}
</aside>
