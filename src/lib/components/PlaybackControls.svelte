<script lang="ts">
	import { project } from '$lib/stores/project.svelte';
	import { filmstrip } from '$lib/stores/filmstrip.svelte';
	import { untrack } from 'svelte';

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

	const STRIP_HEIGHT = 48;

	let stripContainer = $state<HTMLDivElement | null>(null);
	let stripCanvas = $state<HTMLCanvasElement | null>(null);
	let isDraggingScrub = $state(false);
	let isDraggingTrimStart = $state(false);
	let isDraggingTrimEnd = $state(false);

	// Track the frame array reference and width to regenerate thumbnails when they change
	let lastFramesRef: unknown = null;
	let lastStripWidth = 0;
	let stripWidth = $state(0);

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

	// Observe strip container width
	$effect(() => {
		if (!stripContainer) return;
		const ro = new ResizeObserver((entries) => {
			for (const entry of entries) {
				stripWidth = entry.contentRect.width;
			}
		});
		ro.observe(stripContainer);
		return () => ro.disconnect();
	});

	// Generate filmstrip thumbnails when frames or width changes (debounced for width)
	$effect(() => {
		const frames = project.frames;
		const w = project.width;
		const h = project.height;
		const canvasEl = stripCanvas;
		const containerW = stripWidth;

		if (!canvasEl || frames.length === 0 || w === 0 || h === 0 || containerW === 0) return;

		const framesChanged = frames !== lastFramesRef;
		const widthChanged = containerW !== lastStripWidth && lastStripWidth !== 0;

		// If nothing changed, skip
		if (!framesChanged && !widthChanged) return;

		// Debounce width changes (300ms), but regenerate immediately for frame changes
		if (widthChanged && !framesChanged) {
			const timeoutId = setTimeout(() => {
				untrack(() => {
					lastStripWidth = containerW;
					generateThumbnails(canvasEl, frames, w, h, containerW);
				});
			}, 300);
			return () => clearTimeout(timeoutId);
		}

		// Regenerate immediately for frame changes
		untrack(() => {
			lastFramesRef = frames;
			lastStripWidth = containerW;
			generateThumbnails(canvasEl, frames, w, h, containerW);
		});
	});

	function generateThumbnails(
		canvasEl: HTMLCanvasElement,
		frames: typeof project.frames,
		srcW: number,
		srcH: number,
		containerW: number
	) {
		const tw = srcH > 0 ? Math.round((srcW / srcH) * STRIP_HEIGHT) : 36;
		// How many thumbnails fit edge-to-edge
		const count = Math.max(1, Math.ceil(containerW / tw));
		const totalW = count * tw;

		canvasEl.width = totalW;
		canvasEl.height = STRIP_HEIGHT;

		const ctx = canvasEl.getContext('2d');
		if (!ctx) return;

		ctx.fillStyle = '#18181b';
		ctx.fillRect(0, 0, totalW, STRIP_HEIGHT);

		// Sample frames evenly
		const tmpCanvas = new OffscreenCanvas(srcW, srcH);
		const tmpCtx = tmpCanvas.getContext('2d')!;

		for (let i = 0; i < count; i++) {
			const frameIdx = Math.min(
				Math.round((i / Math.max(1, count - 1)) * (frames.length - 1)),
				frames.length - 1
			);
			const frame = frames[frameIdx];
			if (!frame) continue;

			tmpCtx.putImageData(frame.imageData, 0, 0);
			ctx.drawImage(tmpCanvas, i * tw, 0, tw, STRIP_HEIGHT);
		}
	}

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
