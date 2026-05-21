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
	<div class="mb-1 flex items-center justify-between">
		<span class="text-xs text-zinc-400">{label}</span>
		<span class="text-xs text-zinc-300 tabular-nums">{value}{suffix}</span>
	</div>
	<input type="range" bind:value {min} {max} {step} class="h-1.5 w-full accent-green-500" />
</label>
