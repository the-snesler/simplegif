<script lang="ts">
	import type { CropRect } from '$lib/types';

	let {
		rect = $bindable({ x: 0, y: 0, width: 100, height: 100 }),
		maxWidth,
		maxHeight,
		canvasEl
	}: {
		rect: CropRect;
		maxWidth: number;
		maxHeight: number;
		canvasEl?: HTMLCanvasElement | null;
	} = $props();

	let isDragging = $state(false);
	let dragType = $state<'move' | 'resize' | null>(null);
	let startX = $state(0);
	let startY = $state(0);
	let startRect = $state<CropRect>({ x: 0, y: 0, width: 0, height: 0 });

	function getScale(): { scaleX: number; scaleY: number; offsetX: number; offsetY: number } {
		if (!canvasEl) return { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };
		const displayRect = canvasEl.getBoundingClientRect();
		return {
			scaleX: maxWidth / displayRect.width,
			scaleY: maxHeight / displayRect.height,
			offsetX: displayRect.left,
			offsetY: displayRect.top
		};
	}

	function handleMouseDown(e: MouseEvent, type: 'move' | 'resize') {
		e.preventDefault();
		isDragging = true;
		dragType = type;
		startX = e.clientX;
		startY = e.clientY;
		startRect = { ...rect };

		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('mouseup', handleMouseUp);
	}

	function handleMouseMove(e: MouseEvent) {
		if (!isDragging) return;
		const scale = getScale();
		const dx = (e.clientX - startX) * scale.scaleX;
		const dy = (e.clientY - startY) * scale.scaleY;

		if (dragType === 'move') {
			rect.x = Math.max(0, Math.min(maxWidth - rect.width, Math.round(startRect.x + dx)));
			rect.y = Math.max(0, Math.min(maxHeight - rect.height, Math.round(startRect.y + dy)));
		} else if (dragType === 'resize') {
			rect.width = Math.max(1, Math.min(maxWidth - rect.x, Math.round(startRect.width + dx)));
			rect.height = Math.max(
				1,
				Math.min(maxHeight - rect.y, Math.round(startRect.height + dy))
			);
		}
	}

	function handleMouseUp() {
		isDragging = false;
		dragType = null;
		window.removeEventListener('mousemove', handleMouseMove);
		window.removeEventListener('mouseup', handleMouseUp);
	}

	let style = $derived(() => {
		if (!canvasEl) return '';
		const displayRect = canvasEl.getBoundingClientRect();
		const scaleX = displayRect.width / maxWidth;
		const scaleY = displayRect.height / maxHeight;
		return `left: ${rect.x * scaleX}px; top: ${rect.y * scaleY}px; width: ${rect.width * scaleX}px; height: ${rect.height * scaleY}px;`;
	});
</script>

{#if canvasEl}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="absolute border-2 border-green-500 bg-green-500/10 cursor-move"
		style={style()}
		onmousedown={(e) => handleMouseDown(e, 'move')}
	>
		<!-- Resize handle -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-green-500 border border-green-300 cursor-se-resize"
			onmousedown={(e: MouseEvent) => { e.stopPropagation(); handleMouseDown(e, 'resize'); }}
		></div>
	</div>
{/if}
