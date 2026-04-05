/**
 * Gifsicle WASM bridge.
 * Loads gifsicle compiled to WebAssembly from /lib/gifsicle/ and runs it
 * on raw GIF binary data. All processing happens in-browser.
 */

let scriptLoaded = false;

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

export interface GifsicleResult {
	outputBytes: Uint8Array | null;
	returnCode: number;
	stdout: string;
	stderr: string;
}

function buildArgs(opts: GifsicleOptions): string[] {
	const args: string[] = [];

	if (opts.optimizationLevel) args.push(opts.optimizationLevel);
	if (opts.lossy > 0) args.push(`--lossy=${opts.lossy}`);
	if (opts.colors > 0) args.push(`--colors=${opts.colors}`);
	if (opts.colorMethod) args.push(`--color-method=${opts.colorMethod}`);
	if (opts.scale < 100) args.push(`--scale=${(opts.scale / 100).toFixed(2)}`);
	if (opts.dither) args.push(`--dither=${opts.dither}`);

	return args;
}

async function loadScript(): Promise<void> {
	if (scriptLoaded) return;
	await new Promise<void>((resolve, reject) => {
		const s = document.createElement('script');
		s.src = '/lib/gifsicle/gifsicle.js';
		s.onload = () => resolve();
		s.onerror = () => reject(new Error('Failed to load gifsicle.js'));
		document.head.appendChild(s);
	});
	scriptLoaded = true;
}

let wasmBinaryCache: ArrayBuffer | null = null;

async function loadWasmBinary(): Promise<ArrayBuffer> {
	if (wasmBinaryCache) return wasmBinaryCache;
	const resp = await fetch('/lib/gifsicle/gifsicle.wasm');
	wasmBinaryCache = await resp.arrayBuffer();
	return wasmBinaryCache;
}

async function runRaw(gifBytes: ArrayBuffer, args: string[]): Promise<GifsicleResult> {
	await loadScript();
	const binary = await loadWasmBinary();

	let stdoutBuf = '';
	let stderrBuf = '';

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const createGifsicle = (window as any).createGifsicle;
	if (!createGifsicle) throw new Error('createGifsicle not found on window');

	const mod = await createGifsicle({
		wasmBinary: binary.slice(0),
		print: (t: string) => {
			stdoutBuf += t + '\n';
		},
		printErr: (t: string) => {
			stderrBuf += t + '\n';
		}
	});

	mod.FS.writeFile('/input.gif', new Uint8Array(gifBytes));

	const fullArgs = ['gifsicle', ...args, '-o', '/output.gif', '/input.gif'];
	const argv = mod._malloc((fullArgs.length + 1) * 4);
	const ptrs: number[] = [];
	for (let i = 0; i < fullArgs.length; i++) {
		const p = mod.allocateUTF8(fullArgs[i]);
		ptrs.push(p);
		mod.HEAP32[(argv >> 2) + i] = p;
	}
	mod.HEAP32[(argv >> 2) + fullArgs.length] = 0;

	let returnCode: number;
	try {
		returnCode = mod._run_gifsicle(fullArgs.length, argv);
	} catch {
		returnCode = -1;
	}

	ptrs.forEach((p: number) => mod._free(p));
	mod._free(argv);

	let outputBytes: Uint8Array | null = null;
	try {
		outputBytes = mod.FS.readFile('/output.gif');
	} catch {
		// output may not exist if gifsicle failed
	}

	return { outputBytes, returnCode, stdout: stdoutBuf, stderr: stderrBuf };
}

/**
 * Run gifsicle on a GIF blob with the given options.
 * Returns the optimized GIF as a Blob, or throws on failure.
 */
export async function runGifsicle(gifBlob: Blob, options: GifsicleOptions): Promise<Blob> {
	const buffer = await gifBlob.arrayBuffer();
	const args = buildArgs(options);
	const result = await runRaw(buffer, args);

	if (!result.outputBytes || result.outputBytes.length === 0) {
		throw new Error(result.stderr || 'gifsicle produced no output');
	}

	return new Blob([result.outputBytes.buffer as ArrayBuffer], { type: 'image/gif' });
}
