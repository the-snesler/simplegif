/**
 * Runs gifsicle (Emscripten build in /static/lib/gifsicle) inside a worker.
 * The script is evaluated once and the wasm module compiled once; each run
 * only instantiates a fresh module instance (gifsicle keeps global state).
 */
import type { GifsicleOptions } from '$lib/processing/gifsicle-options';

type CreateGifsicle = (opts: Record<string, unknown>) => Promise<GifsicleModule>;
interface GifsicleModule {
	FS: { writeFile(path: string, data: Uint8Array): void; readFile(path: string): Uint8Array };
	_malloc(n: number): number;
	_free(p: number): void;
	_run_gifsicle(argc: number, argv: number): number;
	allocateUTF8(s: string): number;
	HEAP32: Int32Array;
}

let factory: Promise<{ create: CreateGifsicle; module: WebAssembly.Module }> | null = null;

function load() {
	factory ??= (async () => {
		const [code, module] = await Promise.all([
			fetch('/lib/gifsicle/gifsicle.js').then((r) => r.text()),
			WebAssembly.compileStreaming(fetch('/lib/gifsicle/gifsicle.wasm'))
		]);
		// Indirect eval runs in global scope so `var createGifsicle` lands on globalThis
		(0, eval)(code);
		const create = (globalThis as unknown as { createGifsicle?: CreateGifsicle }).createGifsicle;
		if (!create) throw new Error('createGifsicle not found');
		return { create, module };
	})();
	factory.catch(() => (factory = null));
	return factory;
}

export function buildGifsicleArgs(opts: GifsicleOptions): string[] {
	const args: string[] = [];
	if (opts.optimizationLevel) args.push(opts.optimizationLevel);
	if (opts.lossy > 0) args.push(`--lossy=${opts.lossy}`);
	if (opts.colors > 0) args.push(`--colors=${opts.colors}`);
	if (opts.colorMethod) args.push(`--color-method=${opts.colorMethod}`);
	if (opts.scale < 100) args.push(`--scale=${(opts.scale / 100).toFixed(2)}`);
	if (opts.dither) args.push(`--dither=${opts.dither}`);
	return args;
}

export async function runGifsicleBytes(
	input: Uint8Array,
	opts: GifsicleOptions
): Promise<Uint8Array> {
	const { create, module } = await load();
	let stderr = '';
	const mod = await create({
		instantiateWasm(
			imports: WebAssembly.Imports,
			receive: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void
		) {
			WebAssembly.instantiate(module, imports).then((instance) => receive(instance, module));
			return {};
		},
		print: () => {},
		printErr: (t: string) => {
			stderr += t + '\n';
		}
	});

	mod.FS.writeFile('/input.gif', input);
	const argvList = ['gifsicle', ...buildGifsicleArgs(opts), '-o', '/output.gif', '/input.gif'];
	const argv = mod._malloc((argvList.length + 1) * 4);
	const ptrs = argvList.map((a, i) => {
		const p = mod.allocateUTF8(a);
		mod.HEAP32[(argv >> 2) + i] = p;
		return p;
	});
	mod.HEAP32[(argv >> 2) + argvList.length] = 0;
	try {
		mod._run_gifsicle(argvList.length, argv);
	} catch {
		// gifsicle may call exit(); output (if any) is still in the FS
	}
	ptrs.forEach((p) => mod._free(p));
	mod._free(argv);

	let out: Uint8Array | null = null;
	try {
		out = mod.FS.readFile('/output.gif');
	} catch {
		/* no output */
	}
	if (!out || out.length === 0) throw new Error(stderr || 'gifsicle produced no output');
	return out.slice();
}
