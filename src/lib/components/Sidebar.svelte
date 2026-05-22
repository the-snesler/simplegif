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
		class="flex h-18 items-center justify-between border-b border-zinc-800 bg-linear-to-br from-green-950 to-zinc-900 px-6 py-4"
	>
		<div class="flex items-center gap-3 text-left">
			<div
				class="flex h-8 w-8 items-center justify-center rounded-lg border border-green-700 bg-green-900"
			>
				<DNCamera class="text-green-400" />
			</div>
			<div>
				<h1 class="text-sm font-semibold text-white">SimpleGIF</h1>
				<p class="text-xs text-zinc-500">Local GIF toolkit</p>
			</div>
		</div>
		<div class="flex items-center gap-1">
			<button
				popoverTarget={SIDEBAR_POPOVER_ID}
				popoverTargetAction="hide"
				class="rounded-lg p-2 transition-colors hover:bg-zinc-800 md:hidden"
				aria-label="Close sidebar"
			>
				<DNBlackCrossSquare class="h-4 w-4 text-zinc-400" />
			</button>
		</div>
	</div>

	{#if project.isLoaded}
		<div class="space-y-1 border-b border-zinc-800 px-4 py-3 text-xs text-zinc-400">
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
					class="group flex w-full items-center justify-center rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-400 transition-colors hover:border-red-700 hover:bg-red-800 hover:text-white"
				>
					<DNFire class="mr-2 inline-block" />
					Clear File
				</button>
			</div>
		</div>
	{/if}

	<nav class="flex-1 space-y-1 overflow-y-auto px-3 py-3">
		<div class="px-3 py-2 text-xs font-medium tracking-wider text-zinc-500 uppercase">Create</div>
		<NavItem href="/convert" label="Video to GIF">
			{#snippet icon()}<DNMovieCamera class="h-4 w-4" />{/snippet}
		</NavItem>
		<NavItem href="/sequence" label="Image Sequence">
			{#snippet icon()}<DNFilmFrames class="h-4 w-4" />{/snippet}
		</NavItem>

		<div class="px-3 pt-4 pb-2 text-xs font-medium tracking-wider text-zinc-500 uppercase">
			Edit
		</div>
		<NavItem href="/crop" label="Crop">
			{#snippet icon()}<DNArrowsMaximize class="h-4 w-4" />{/snippet}
		</NavItem>
		<NavItem href="/resize" label="Resize">
			{#snippet icon()}<DNBigger class="h-4 w-4" />{/snippet}
		</NavItem>
		<NavItem href="/trim" label="Trim">
			{#snippet icon()}<DNSmaller class="h-4 w-4" />{/snippet}
		</NavItem>
		<NavItem href="/rotate" label="Rotate / Flip">
			{#snippet icon()}<DNDeviceRotate class="h-4 w-4" />{/snippet}
		</NavItem>

		<div class="px-3 pt-4 pb-2 text-xs font-medium tracking-wider text-zinc-500 uppercase">
			Adjust
		</div>
		<NavItem href="/reverse" label="Reverse">
			{#snippet icon()}<DNRepeatArrow class="h-4 w-4" />{/snippet}
		</NavItem>
		<NavItem href="/framerate" label="Frame Rate">
			{#snippet icon()}<DNAdjustments class="h-4 w-4" />{/snippet}
		</NavItem>
		<NavItem href="/skip-frames" label="Skip Frames">
			{#snippet icon()}<DNShuffleArrows class="h-4 w-4" />{/snippet}
		</NavItem>

		<div class="px-3 pt-4 pb-2 text-xs font-medium tracking-wider text-zinc-500 uppercase">
			Export
		</div>
		<NavItem href="/optimize" label="Optimize">
			{#snippet icon()}<DNZoomIn class="h-4 w-4" />{/snippet}
		</NavItem>
	</nav>
{/snippet}

<!-- Desktop sidebar -->
<aside class="hidden h-full w-80 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900 md:flex">
	{@render sidebarContent()}
</aside>

<!-- Mobile sidebar popover -->
<aside
	id={SIDEBAR_POPOVER_ID}
	popover="auto"
	class="sidebar-popover m-0 flex h-full max-h-full w-80 max-w-[85vw] flex-col border-0 border-r border-zinc-800 bg-zinc-900 p-0 md:hidden"
>
	{@render sidebarContent()}
</aside>
