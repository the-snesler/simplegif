<script lang="ts">
	import { project } from '$lib/stores/project.svelte';
	import { filmstrip } from '$lib/stores/filmstrip.svelte';
	import { engine } from '$lib/engine/client';

	let {
		currentFrame = 0,
		isPlaying = false,
		onTogglePlay,
		onFrameChange
	}: {
		currentFrame?: number;
		isPlaying?: boolean;
		onTogglePlay?: () => void;
		onFrameChange?: (frame: number) => void;
	} = $props();

	let stripContainer = $state<HTMLDivElement | null>(null);
	let stripCanvas = $state<HTMLCanvasElement | null>(null);
	let isDraggingScrub = $state(false);
	let isDraggingTrimStart = $state(false);
	let isDraggingTrimEnd = $state(false);

	// Playhead position as a percentage
	let playheadPct = $derived(
		project.frameCount > 1 ? (currentFrame / (project.frameCount - 1)) * 100 : 0
	);

	// Trim positions as percentages (0–100) for overlays and borders
	let trimStartPct = $derived(
		project.frameCount > 1 ? (filmstrip.trimStart / (project.frameCount - 1)) * 100 : 0
	);
	let trimEndPct = $derived(
		project.frameCount > 1 ? (filmstrip.trimEnd / (project.frameCount - 1)) * 100 : 100
	);

	// Handle positions: interpolate across (0) to (100% - handle width) so
	// handles always stay fully inside the container. Handle is w-4 = 1rem = 16px.
	const HANDLE_W = 16;
	let trimStartHandleStyle = $derived(
		`left: calc(${trimStartPct}% - ${(trimStartPct / 100) * HANDLE_W}px);`
	);
	let trimEndHandleStyle = $derived(
		`left: calc(${trimEndPct}% - ${(trimEndPct / 100) * HANDLE_W}px);`
	);
	let trimSelectionBorderStyle = $derived(
		`left: calc(${trimStartPct * 0.01} * (100% - ${HANDLE_W * 2}px) + ${HANDLE_W}px); width: calc(${trimEndPct * 0.01 - trimStartPct * 0.01} * (100% - ${HANDLE_W * 2}px));`
	);

	// Thumbnails are rendered by the engine worker into the transferred canvas
	$effect(() => {
		if (!stripCanvas) return;
		engine.attachStrip(stripCanvas.transferControlToOffscreen());
	});

	// Report strip width to the engine (debounced after the first measurement)
	$effect(() => {
		if (!stripContainer) return;
		let timeout: ReturnType<typeof setTimeout> | null = null;
		let first = true;
		const ro = new ResizeObserver((entries) => {
			const width = Math.round(entries[entries.length - 1].contentRect.width);
			if (timeout) clearTimeout(timeout);
			if (first) {
				first = false;
				engine.setStripWidth(width);
			} else {
				timeout = setTimeout(() => engine.setStripWidth(width), 300);
			}
		});
		ro.observe(stripContainer);
		return () => {
			ro.disconnect();
			if (timeout) clearTimeout(timeout);
		};
	});

	// --- Scrubbing ---
	function frameFromPointerX(clientX: number): number {
		if (!stripContainer) return 0;
		const rect = stripContainer.getBoundingClientRect();
		const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
		return Math.round(pct * (project.frameCount - 1));
	}

	function handleStripPointerDown(e: PointerEvent) {
		// Don't interfere with trim handle drags
		if (isDraggingTrimStart || isDraggingTrimEnd) return;
		isDraggingScrub = true;
		const frame = frameFromPointerX(e.clientX);
		onFrameChange?.(frame);
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function handleStripPointerMove(e: PointerEvent) {
		if (!isDraggingScrub) return;
		const frame = frameFromPointerX(e.clientX);
		onFrameChange?.(frame);
	}

	function handleStripPointerUp() {
		isDraggingScrub = false;
	}

	// --- Trim handle dragging ---
	function handleTrimStartDown(e: PointerEvent) {
		e.stopPropagation();
		isDraggingTrimStart = true;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function handleTrimStartMove(e: PointerEvent) {
		if (!isDraggingTrimStart) return;
		const frame = frameFromPointerX(e.clientX);
		filmstrip.setTrimStart(Math.max(0, Math.min(frame, filmstrip.trimEnd - 1)));
	}

	function handleTrimStartUp() {
		isDraggingTrimStart = false;
	}

	function handleTrimEndDown(e: PointerEvent) {
		e.stopPropagation();
		isDraggingTrimEnd = true;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function handleTrimEndMove(e: PointerEvent) {
		if (!isDraggingTrimEnd) return;
		const frame = frameFromPointerX(e.clientX);
		filmstrip.setTrimEnd(
			Math.min(project.frameCount - 1, Math.max(frame, filmstrip.trimStart + 1))
		);
	}

	function handleTrimEndUp() {
		isDraggingTrimEnd = false;
	}
</script>

<div class="flex items-center gap-2.5 px-3 py-2 text-sm">
	<!-- Play / Pause -->
	<button
		onclick={onTogglePlay}
		class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md
			   text-zinc-300 transition-colors hover:bg-zinc-800 active:bg-zinc-700"
		title={isPlaying ? 'Pause' : 'Play'}
	>
		{#if isPlaying}
			<svg class="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
				<rect x="5" y="3" width="5" height="18" rx="1" />
				<rect x="14" y="3" width="5" height="18" rx="1" />
			</svg>
		{:else}
			<svg class="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
				<path d="M6 3.5a1 1 0 0 1 1.5-.86l12 8.5a1 1 0 0 1 0 1.72l-12 8.5A1 1 0 0 1 6 20.5v-17z" />
			</svg>
		{/if}
	</button>

	<!-- Filmstrip -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		bind:this={stripContainer}
		class="relative h-12 flex-1 cursor-col-resize overflow-hidden rounded-lg ring-1
			   ring-zinc-700/60 select-none"
		onpointerdown={handleStripPointerDown}
		onpointermove={handleStripPointerMove}
		onpointerup={handleStripPointerUp}
		onpointercancel={handleStripPointerUp}
	>
		<!-- Thumbnail canvas -->
		<canvas
			bind:this={stripCanvas}
			class="absolute inset-0 h-full w-full"
			style="image-rendering: auto;"
		></canvas>

		{#if filmstrip.trimMode}
			<!-- Dim overlay BEFORE trim start -->
			<div
				class="pointer-events-none absolute inset-y-0 left-0 z-10 bg-black/70"
				style="width: {trimStartPct}%;"
			></div>

			<!-- Dim overlay AFTER trim end -->
			<div
				class="pointer-events-none absolute inset-y-0 right-0 z-10 bg-black/70"
				style="width: {100 - trimEndPct}%;"
			></div>

			<!-- Gold selection border (top + bottom bars) -->
			<div
				class="pointer-events-none absolute top-0 z-20 h-[2.5px] bg-amber-400"
				style={trimSelectionBorderStyle}
			></div>
			<div
				class="pointer-events-none absolute bottom-0 z-20 h-[2.5px] bg-amber-400"
				style={trimSelectionBorderStyle}
			></div>

			<!-- Trim start handle -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="absolute inset-y-0 z-30 flex w-4 cursor-ew-resize items-center justify-center
					   rounded-l-md bg-amber-400
					   shadow-[2px_0_8px_rgba(0,0,0,0.3)] transition-colors hover:bg-amber-300
					   active:bg-amber-300"
				style={trimStartHandleStyle}
				onpointerdown={handleTrimStartDown}
				onpointermove={handleTrimStartMove}
				onpointerup={handleTrimStartUp}
				onpointercancel={handleTrimStartUp}
			>
				<svg
					class="h-4 w-2 text-amber-900/60"
					viewBox="0 0 6 16"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
				>
					<line x1="4" y1="4" x2="2" y2="8" />
					<line x1="2" y1="8" x2="4" y2="12" />
				</svg>
			</div>

			<!-- Trim end handle -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="absolute inset-y-0 z-50 flex w-4 cursor-ew-resize items-center justify-center
					   rounded-r-md bg-amber-400
					   shadow-[-2px_0_8px_rgba(0,0,0,0.3)] transition-colors hover:bg-amber-300
					   active:bg-amber-300"
				style={trimEndHandleStyle}
				onpointerdown={handleTrimEndDown}
				onpointermove={handleTrimEndMove}
				onpointerup={handleTrimEndUp}
				onpointercancel={handleTrimEndUp}
			>
				<svg
					class="h-4 w-2 text-amber-900/60"
					viewBox="0 0 6 16"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
				>
					<line x1="2" y1="4" x2="4" y2="8" />
					<line x1="4" y1="8" x2="2" y2="12" />
				</svg>
			</div>
		{/if}

		<!-- Playhead -->
		<div
			class="pointer-events-none absolute top-0 bottom-0 z-40 w-[3px] -translate-x-1/2
				   bg-white shadow-[0_0_6px_rgba(255,255,255,0.35)]"
			style="left: {playheadPct}%; transition: left {isDraggingScrub ? '0ms' : '75ms'};"
		>
			<div
				class="absolute -top-0.5 left-1/2 h-1 w-2.5 -translate-x-1/2 rounded-b-sm bg-white"
			></div>
			<div
				class="absolute -bottom-0.5 left-1/2 h-1 w-2.5 -translate-x-1/2 rounded-t-sm bg-white"
			></div>
		</div>
	</div>

	<!-- Frame counter -->
	<span class="shrink-0 text-right font-mono text-xs tracking-tight text-zinc-500 tabular-nums">
		{String(currentFrame + 1).padStart(String(project.frameCount).length, '\u2007')}<span
			class="text-zinc-600"
		>
			/
		</span>{project.frameCount}
	</span>
</div>
