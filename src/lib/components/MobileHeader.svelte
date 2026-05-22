<script lang="ts">
	import DNCamera from '~icons/dinkie-icons/camera';
	import DNMenu from '~icons/dinkie-icons/menu-small';

	const SIDEBAR_POPOVER_ID = 'sidebar-popover';
</script>

<header
	class="flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-4 py-3 md:hidden"
>
	<div class="flex items-center gap-3">
		<div
			class="flex h-8 w-8 items-center justify-center rounded-lg border border-green-700 bg-green-900"
		>
			<DNCamera class="text-green-400" />
		</div>
		<div>
			<h1 class="text-sm font-semibold">SimpleGIF</h1>
			<p class="text-xs text-zinc-500">Local GIF toolkit</p>
		</div>
	</div>
	<button
		popoverTarget={SIDEBAR_POPOVER_ID}
		class="rounded-lg p-2 transition-colors hover:bg-zinc-800"
		aria-label="Open menu"
	>
		<DNMenu class="h-5 w-5 text-zinc-400" />
	</button>
</header>
