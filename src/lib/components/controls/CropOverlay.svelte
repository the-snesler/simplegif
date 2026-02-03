<script lang="ts">
	import { cropStore } from '$lib/stores/crop.svelte';
	import { onMount } from 'svelte';

	let {
		canvasEl,
		maxWidth,
		maxHeight
	}: {
		canvasEl: HTMLCanvasElement;
		maxWidth: number;
		maxHeight: number;
	} = $props();

	type HandleType = 'move' | 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';

	const MIN_SIZE = 10;

	let isDragging = $state(false);
	let dragType = $state<HandleType | null>(null);
	let startPointer = { x: 0, y: 0 };
	let startRect = { x: 0, y: 0, width: 0, height: 0 };

	// Track canvas display size reactively so overlay repositions on resize
	let canvasDisplaySize = $state({ width: 0, height: 0 });

	onMount(() => {
		const ro = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (entry) {
				canvasDisplaySize = {
					width: entry.contentRect.width,
					height: entry.contentRect.height
				};
			}
		});
		ro.observe(canvasEl);
		// Initialize
		const rect = canvasEl.getBoundingClientRect();
		canvasDisplaySize = { width: rect.width, height: rect.height };
		return () => ro.disconnect();
	});

	function getScale() {
		return {
			scaleX: maxWidth / canvasDisplaySize.width,
			scaleY: maxHeight / canvasDisplaySize.height
		};
	}

	// Display-space coordinates for rendering
	let displayRect = $derived.by(() => {
		const r = cropStore.rect;
		const sx = canvasDisplaySize.width / maxWidth;
		const sy = canvasDisplaySize.height / maxHeight;
		return {
			left: r.x * sx,
			top: r.y * sy,
			width: r.width * sx,
			height: r.height * sy
		};
	});

	function beginDrag(e: MouseEvent | TouchEvent, type: HandleType) {
		e.preventDefault();
		e.stopPropagation();
		isDragging = true;
		dragType = type;

		const pt = 'touches' in e ? e.touches[0] : e;
		startPointer = { x: pt.clientX, y: pt.clientY };
		startRect = { ...cropStore.rect };

		window.addEventListener('mousemove', onPointerMove);
		window.addEventListener('mouseup', onPointerUp);
		window.addEventListener('touchmove', onPointerMove, { passive: false });
		window.addEventListener('touchend', onPointerUp);
	}

	function onPointerMove(e: MouseEvent | TouchEvent) {
		if (!isDragging || !dragType) return;
		e.preventDefault();

		const pt = 'touches' in e ? e.touches[0] : e;
		const scale = getScale();
		const dx = (pt.clientX - startPointer.x) * scale.scaleX;
		const dy = (pt.clientY - startPointer.y) * scale.scaleY;

		let nx = startRect.x;
		let ny = startRect.y;
		let nw = startRect.width;
		let nh = startRect.height;

		if (dragType === 'move') {
			nx = startRect.x + dx;
			ny = startRect.y + dy;
		} else {
			// Horizontal component
			if (dragType.includes('w')) {
				nx = startRect.x + dx;
				nw = startRect.width - dx;
			} else if (dragType.includes('e')) {
				nw = startRect.width + dx;
			}
			// Vertical component
			if (dragType.includes('n')) {
				ny = startRect.y + dy;
				nh = startRect.height - dy;
			} else if (dragType.includes('s')) {
				nh = startRect.height + dy;
			}
		}

		// Enforce minimum size — if width or height would go below MIN_SIZE,
		// clamp and adjust origin accordingly
		if (nw < MIN_SIZE) {
			if (dragType.includes('w')) {
				nx = startRect.x + startRect.width - MIN_SIZE;
			}
			nw = MIN_SIZE;
		}
		if (nh < MIN_SIZE) {
			if (dragType.includes('n')) {
				ny = startRect.y + startRect.height - MIN_SIZE;
			}
			nh = MIN_SIZE;
		}

		// Clamp to canvas bounds
		if (nx < 0) {
			if (dragType === 'move')
				nw = nw; // width unchanged on move
			else nw += nx; // absorb overshoot
			nx = 0;
		}
		if (ny < 0) {
			if (dragType === 'move') nh = nh;
			else nh += ny;
			ny = 0;
		}
		if (nx + nw > maxWidth) {
			if (dragType === 'move') nx = maxWidth - nw;
			else nw = maxWidth - nx;
		}
		if (ny + nh > maxHeight) {
			if (dragType === 'move') ny = maxHeight - nh;
			else nh = maxHeight - ny;
		}

		// Final clamp for move
		nx = Math.max(0, Math.round(nx));
		ny = Math.max(0, Math.round(ny));
		nw = Math.max(MIN_SIZE, Math.round(nw));
		nh = Math.max(MIN_SIZE, Math.round(nh));

		cropStore.updateRect({ x: nx, y: ny, width: nw, height: nh });
	}

	function onPointerUp() {
		isDragging = false;
		dragType = null;
		window.removeEventListener('mousemove', onPointerMove);
		window.removeEventListener('mouseup', onPointerUp);
		window.removeEventListener('touchmove', onPointerMove);
		window.removeEventListener('touchend', onPointerUp);
	}

	const HANDLE = 3;
	const BRACKET = 18;
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="absolute -inset-2 overflow-hidden select-none" style="touch-action: none;">
	<div class="absolute inset-2">
		<!-- Dark overlay — 4 rects around the crop area -->
		<!-- Top -->
		<div
			class="pointer-events-none absolute bg-black/55"
			style="left: 0; top: 0; right: 0; height: {displayRect.top}px;"
		></div>
		<!-- Bottom -->
		<div
			class="pointer-events-none absolute bg-black/55"
			style="left: 0; top: {displayRect.top + displayRect.height}px; right: 0; bottom: 0;"
		></div>
		<!-- Left -->
		<div
			class="pointer-events-none absolute bg-black/55"
			style="left: 0; top: {displayRect.top}px; width: {displayRect.left}px; height: {displayRect.height}px;"
		></div>
		<!-- Right -->
		<div
			class="pointer-events-none absolute bg-black/55"
			style="left: {displayRect.left +
				displayRect.width}px; top: {displayRect.top}px; right: 0; height: {displayRect.height}px;"
		></div>

		<!-- Crop border + handles + grid — interactive layer -->
		<div
			class="absolute"
			style="
			left: {displayRect.left}px;
			top: {displayRect.top}px;
			width: {displayRect.width}px;
			height: {displayRect.height}px;
		"
		>
			<!-- White border -->
			<div class="pointer-events-none absolute inset-0 border-2 border-white/90"></div>

			<!-- Rule-of-thirds grid (visible during drag) -->
			{#if isDragging}
				<div class="pointer-events-none absolute inset-0">
					<div class="absolute top-0 bottom-0 left-1/3 w-px bg-white/30"></div>
					<div class="absolute top-0 bottom-0 left-2/3 w-px bg-white/30"></div>
					<div class="absolute top-1/3 right-0 left-0 h-px bg-white/30"></div>
					<div class="absolute top-2/3 right-0 left-0 h-px bg-white/30"></div>
				</div>
			{/if}

			<!-- Move area (center) -->
			<div
				class="absolute inset-3 cursor-move"
				onmousedown={(e) => beginDrag(e, 'move')}
				ontouchstart={(e) => beginDrag(e, 'move')}
			></div>

			<!-- Corner brackets — NW -->
			<div
				class="absolute -top-0.5 -left-0.5 cursor-nwse-resize"
				style="width: {BRACKET + HANDLE * 2}px; height: {BRACKET + HANDLE * 2}px;"
				onmousedown={(e) => beginDrag(e, 'nw')}
				ontouchstart={(e) => beginDrag(e, 'nw')}
			>
				<div
					class="absolute top-0 left-0 bg-white"
					style="width: {BRACKET}px; height: {HANDLE}px;"
				></div>
				<div
					class="absolute top-0 left-0 bg-white"
					style="width: {HANDLE}px; height: {BRACKET}px;"
				></div>
			</div>

			<!-- Corner brackets — NE -->
			<div
				class="absolute -top-0.5 -right-0.5 cursor-nesw-resize"
				style="width: {BRACKET + HANDLE * 2}px; height: {BRACKET + HANDLE * 2}px;"
				onmousedown={(e) => beginDrag(e, 'ne')}
				ontouchstart={(e) => beginDrag(e, 'ne')}
			>
				<div
					class="absolute top-0 right-0 bg-white"
					style="width: {BRACKET}px; height: {HANDLE}px;"
				></div>
				<div
					class="absolute top-0 right-0 bg-white"
					style="width: {HANDLE}px; height: {BRACKET}px;"
				></div>
			</div>

			<!-- Corner brackets — SW -->
			<div
				class="absolute -bottom-0.5 -left-0.5 cursor-nesw-resize"
				style="width: {BRACKET + HANDLE * 2}px; height: {BRACKET + HANDLE * 2}px;"
				onmousedown={(e) => beginDrag(e, 'sw')}
				ontouchstart={(e) => beginDrag(e, 'sw')}
			>
				<div
					class="absolute bottom-0 left-0 bg-white"
					style="width: {BRACKET}px; height: {HANDLE}px;"
				></div>
				<div
					class="absolute bottom-0 left-0 bg-white"
					style="width: {HANDLE}px; height: {BRACKET}px;"
				></div>
			</div>

			<!-- Corner brackets — SE -->
			<div
				class="absolute -right-0.5 -bottom-0.5 cursor-nwse-resize"
				style="width: {BRACKET + HANDLE * 2}px; height: {BRACKET + HANDLE * 2}px;"
				onmousedown={(e) => beginDrag(e, 'se')}
				ontouchstart={(e) => beginDrag(e, 'se')}
			>
				<div
					class="absolute right-0 bottom-0 bg-white"
					style="width: {BRACKET}px; height: {HANDLE}px;"
				></div>
				<div
					class="absolute right-0 bottom-0 bg-white"
					style="width: {HANDLE}px; height: {BRACKET}px;"
				></div>
			</div>

			<!-- Edge handles — N -->
			<div
				class="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize"
				style="width: 28px; height: 12px;"
				onmousedown={(e) => beginDrag(e, 'n')}
				ontouchstart={(e) => beginDrag(e, 'n')}
			>
				<div
					class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
					style="width: 24px; height: 4px;"
				></div>
			</div>

			<!-- Edge handles — S -->
			<div
				class="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 cursor-ns-resize"
				style="width: 28px; height: 12px;"
				onmousedown={(e) => beginDrag(e, 's')}
				ontouchstart={(e) => beginDrag(e, 's')}
			>
				<div
					class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
					style="width: 24px; height: 4px;"
				></div>
			</div>

			<!-- Edge handles — W -->
			<div
				class="absolute top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize"
				style="width: 12px; height: 28px;"
				onmousedown={(e) => beginDrag(e, 'w')}
				ontouchstart={(e) => beginDrag(e, 'w')}
			>
				<div
					class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
					style="width: 4px; height: 24px;"
				></div>
			</div>

			<!-- Edge handles — E -->
			<div
				class="absolute top-1/2 right-0 translate-x-1/2 -translate-y-1/2 cursor-ew-resize"
				style="width: 12px; height: 28px;"
				onmousedown={(e) => beginDrag(e, 'e')}
				ontouchstart={(e) => beginDrag(e, 'e')}
			>
				<div
					class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
					style="width: 4px; height: 24px;"
				></div>
			</div>
		</div>
	</div>
</div>
