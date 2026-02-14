let onApply = $state<(() => void | Promise<void>) | null>(null);
let applyLabel = $state('Apply');

export const applyAction = {
	get onApply() {
		return onApply;
	},
	get label() {
		return applyLabel;
	},
	set(fn: () => void | Promise<void>, label = 'Apply') {
		onApply = fn;
		applyLabel = label;
	},
	clear() {
		onApply = null;
		applyLabel = 'Apply';
	}
};
