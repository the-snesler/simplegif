let onApply = $state<(() => void | Promise<void>) | null>(null);
let applyLabel = $state('Apply');
let pausePreview = $state<(() => void) | null>(null);

export const applyAction = {
	get onApply() {
		return onApply;
	},
	get label() {
		return applyLabel;
	},
	get onPausePreview() {
		return pausePreview;
	},
	set(fn: () => void | Promise<void>, label = 'Apply') {
		onApply = fn;
		applyLabel = label;
	},
	setPausePreview(fn: (() => void) | null) {
		pausePreview = fn;
	},
	clear() {
		onApply = null;
		applyLabel = 'Apply';
	}
};
