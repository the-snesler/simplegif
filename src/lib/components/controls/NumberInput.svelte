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
	<span class="text-xs text-zinc-400 block mb-1">{label}</span>
	<input
		type="number"
		bind:value
		{min}
		{max}
		{step}
		{oninput}
		class="w-full px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-green-600 tabular-nums"
	/>
</label>
