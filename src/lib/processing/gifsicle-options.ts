export interface GifsicleOptions {
	/** Optimization level: '-O1' | '-O2' | '-O3' | '' (none) */
	optimizationLevel: string;
	/** Lossy compression value 0–200 (0 = off) */
	lossy: number;
	/** Max colors 0–256 (0 = unchanged) */
	colors: number;
	/** Color reduction method: '' | 'diversity' | 'blend-diversity' | 'median-cut' */
	colorMethod: string;
	/** Scale percentage 10–100 (100 = no scaling) */
	scale: number;
	/** Dither method: '' | 'none' | 'ordered' | 'floyd-steinberg' */
	dither: string;
}

export const defaultGifsicleOptions: GifsicleOptions = {
	optimizationLevel: '-O3',
	lossy: 30,
	colors: 0,
	colorMethod: '',
	scale: 100,
	dither: ''
};
