<script lang="ts">
	let {
		label,
		value = $bindable(0),
		min = 0,
		max = 99999,
		step = 1,
		oninput
	}: {
		label: string;
		value: number;
		min?: number;
		max?: number;
		step?: number;
		oninput?: () => void;
	} = $props();
</script>

<label class="block">
	<span class="mb-1 block text-xs text-zinc-400">{label}</span>
	<input
		type="number"
		bind:value
		{min}
		{max}
		{step}
		{oninput}
		class="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-white tabular-nums focus:border-green-600 focus:outline-none"
	/>
</label>
