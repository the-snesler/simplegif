let trimMode = $state(false);
let trimStart = $state(0);
let trimEnd = $state(0);

export const filmstrip = {
	get trimMode() {
		return trimMode;
	},
	get trimStart() {
		return trimStart;
	},
	get trimEnd() {
		return trimEnd;
	},

	enableTrim(start: number, end: number) {
		trimMode = true;
		trimStart = start;
		trimEnd = end;
	},

	setTrimStart(v: number) {
		trimStart = v;
	},

	setTrimEnd(v: number) {
		trimEnd = v;
	},

	disableTrim() {
		trimMode = false;
	}
};
