<script lang="ts">
	let {
		label,
		value = $bindable(0),
		min = 0,
		max = 100,
		step = 1,
		suffix = ''
	}: {
		label: string;
		value: number;
		min?: number;
		max?: number;
		step?: number;
		suffix?: string;
	} = $props();
</script>

<label class="block">
	<div class="flex items-center justify-between mb-1">
		<span class="text-xs text-zinc-400">{label}</span>
		<span class="text-xs text-zinc-300 tabular-nums">{value}{suffix}</span>
	</div>
	<input
		type="range"
		bind:value
		{min}
		{max}
		{step}
		class="w-full h-1.5 accent-green-500"
	/>
</label>
