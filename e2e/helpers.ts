import { expect, type Page } from '@playwright/test';
import { GifReader } from 'omggif';
import fs from 'node:fs';
import path from 'node:path';

export const FIXTURES = path.resolve('e2e/fixtures/out');
export const fixture = (name: string) => {
	const p = path.join(FIXTURES, name);
	if (!fs.existsSync(p)) throw new Error(`Missing fixture ${p} — run e2e/fixtures/generate.sh`);
	return p;
};

export interface Decoded {
	width: number;
	height: number;
	frames: { data: Uint8ClampedArray; delay: number }[];
}

/** Independent reference decoder (omggif + standard disposal compositing). */
export function decodeGif(bytes: Uint8Array): Decoded {
	const r = new GifReader(bytes);
	const W = r.width;
	const H = r.height;
	const frames: Decoded['frames'] = [];
	let comp = new Uint8ClampedArray(W * H * 4);
	for (let i = 0; i < r.numFrames(); i++) {
		const info = r.frameInfo(i);
		const prev = info.disposal === 3 ? comp.slice() : null;
		const px = new Uint8ClampedArray(W * H * 4);
		r.decodeAndBlitFrameRGBA(i, px);
		for (let j = 0; j < px.length; j += 4) if (px[j + 3]) comp.set(px.subarray(j, j + 4), j);
		frames.push({ data: comp.slice(), delay: info.delay * 10 });
		if (info.disposal === 2) {
			for (let y = info.y; y < Math.min(H, info.y + info.height); y++) {
				comp.fill(0, (y * W + info.x) * 4, (y * W + Math.min(W, info.x + info.width)) * 4);
			}
		} else if (prev) comp = prev;
	}
	return { width: W, height: H, frames };
}

export const decodeFile = (p: string) => decodeGif(new Uint8Array(fs.readFileSync(p)));

/** Max per-channel difference over opaque pixels; also checks alpha agreement. */
export function maxDiff(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
	expect(a.length).toBe(b.length);
	let m = 0;
	for (let i = 0; i < a.length; i += 4) {
		const ta = a[i + 3] < 128;
		const tb = b[i + 3] < 128;
		if (ta !== tb) return 255;
		if (ta) continue;
		for (let k = 0; k < 3; k++) m = Math.max(m, Math.abs(a[i + k] - b[i + k]));
	}
	return m;
}

export async function open(page: Page, route: string) {
	await page.goto(route, { waitUntil: 'networkidle' });
}

/** Wait until no processing overlay is shown and the engine finished streaming frames. */
export async function settle(page: Page) {
	await expect(page.locator('[role=status]')).toHaveCount(0);
	// Builds with streaming import expose data-engine; older builds are ready once the overlay is gone
	if ((await page.locator('[data-engine]').count()) > 0) {
		await expect(page.locator('[data-engine=ready]')).toHaveCount(1);
	}
}

export async function load(page: Page, files: string | string[]) {
	await page.locator('input[type=file]').first().setInputFiles(files);
	await expect(page.locator('span.tabular-nums.font-mono')).toBeVisible();
	await settle(page);
}

/** "W×H" and frame count as shown in the sidebar. */
export async function info(page: Page) {
	const text = await page.locator('aside').first().innerText();
	const dims = text.match(/(\d+)×(\d+)/);
	const frames = text.match(/(\d+) frames/);
	return {
		width: Number(dims?.[1]),
		height: Number(dims?.[2]),
		frames: Number(frames?.[1])
	};
}

export async function counter(page: Page) {
	const t = (await page.locator('span.tabular-nums.font-mono').innerText()).replace(/\s+/g, '');
	const [cur, total] = t.split('/').map(Number);
	return { cur, total };
}

export async function apply(page: Page, label: string | RegExp = 'Apply') {
	await page.getByRole('button', { name: label, exact: typeof label === 'string' }).click();
	await settle(page);
}

export async function download(page: Page): Promise<{ bytes: Uint8Array; gif: Decoded }> {
	const [d] = await Promise.all([
		page.waitForEvent('download'),
		page.getByRole('button', { name: 'Download GIF' }).click()
	]);
	const bytes = new Uint8Array(fs.readFileSync(await d.path()));
	await settle(page);
	return { bytes, gif: decodeGif(bytes) };
}

export async function setSlider(page: Page, label: string, value: number) {
	await page.locator('label', { hasText: label }).locator('input[type=range]').fill(String(value));
}
