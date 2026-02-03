import type { CropRect } from '$lib/types';

let active = $state(false);
let rect = $state<CropRect>({ x: 0, y: 0, width: 100, height: 100 });

export const cropStore = {
	get active() {
		return active;
	},
	get rect() {
		return rect;
	},

	activate(width: number, height: number) {
		rect = { x: 0, y: 0, width, height };
		active = true;
	},

	updateRect(r: CropRect) {
		rect = r;
	},

	deactivate() {
		active = false;
	}
};
