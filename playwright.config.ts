import { defineConfig } from '@playwright/test';

const port = Number(process.env.PORT ?? 4173);

export default defineConfig({
	testDir: 'e2e',
	timeout: 180_000,
	expect: { timeout: 60_000 },
	workers: 1,
	reporter: [['list']],
	use: {
		baseURL: process.env.BASE_URL ?? `http://localhost:${port}`,
		acceptDownloads: true,
		launchOptions: process.env.PW_CHROMIUM_PATH
			? { executablePath: process.env.PW_CHROMIUM_PATH }
			: undefined
	},
	webServer: process.env.BASE_URL
		? undefined
		: { command: `npm run build && npm run preview -- --port ${port} --strictPort`, port }
});
