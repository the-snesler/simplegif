let isProcessing = $state(false);
let progress = $state(0);
let statusText = $state('');

export const processing = {
	get isProcessing() {
		return isProcessing;
	},
	get progress() {
		return progress;
	},
	get statusText() {
		return statusText;
	},

	start(text: string) {
		isProcessing = true;
		progress = 0;
		statusText = text;
	},

	update(pct: number, text?: string) {
		progress = pct;
		if (text) statusText = text;
	},

	finish() {
		isProcessing = false;
		progress = 100;
		statusText = '';
	}
};
