<script lang="ts">
	import DNCamera from '~icons/dinkie-icons/camera';
	import DNMenu from '~icons/dinkie-icons/menu-small';

	const SIDEBAR_POPOVER_ID = 'sidebar-popover';
</script>

<header class="md:hidden flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900">
	<div class="flex items-center gap-3">
		<div class="w-8 h-8 rounded-lg bg-green-900 border border-green-700 flex items-center justify-center">
			<DNCamera class="text-green-400" />
		</div>
		<div>
			<h1 class="font-semibold text-sm">SimpleGIF</h1>
			<p class="text-xs text-zinc-500">Local GIF toolkit</p>
		</div>
	</div>
	<button
		popoverTarget={SIDEBAR_POPOVER_ID}
		class="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
		aria-label="Open menu"
	>
		<DNMenu class="w-5 h-5 text-zinc-400" />
	</button>
</header>
