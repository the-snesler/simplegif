import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import Icons from 'unplugin-icons/vite';
import type { Plugin } from 'vite';

/**
 * Cross-origin isolation (enables SharedArrayBuffer for zero-copy frame
 * sharing between workers). SvelteKit's dev/preview middleware bypasses
 * Vite's `server.headers`, so set them in a middleware instead. Production
 * gets the same headers from static/_headers.
 */
function crossOriginIsolation(): Plugin {
	const apply = (middlewares: {
		use: (
			fn: (req: unknown, res: { setHeader(k: string, v: string): void }, next: () => void) => void
		) => void;
	}) =>
		middlewares.use((_req, res, next) => {
			res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
			res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
			next();
		});
	return {
		name: 'cross-origin-isolation',
		configureServer(server) {
			apply(server.middlewares);
		},
		configurePreviewServer(server) {
			apply(server.middlewares);
		}
	};
}

export default defineConfig({
	plugins: [
		crossOriginIsolation(),
		tailwindcss(),
		sveltekit(),
		Icons({
			compiler: 'svelte'
		})
	],
	worker: {
		// Processing workers dynamically import gifenc, which requires code-splitting
		format: 'es'
	},
	optimizeDeps: {
		exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util']
	},
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
