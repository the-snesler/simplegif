import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import {
	apply,
	counter,
	decodeFile,
	download,
	fixture,
	info,
	load,
	maxDiff,
	open,
	setSlider,
	settle
} from './helpers';

// Fixture GIFs use one palette per file, so geometric edits and unedited
// downloads must reproduce source pixels exactly (lossless exact-palette path).

test.describe('import', () => {
	test('GIF: metadata, playback, pause, scrub', async ({ page }) => {
		await open(page, '/');
		await load(page, fixture('medium.gif'));
		const src = decodeFile(fixture('medium.gif'));
		expect(await info(page)).toEqual({ width: 480, height: 360, frames: src.frames.length });

		const a = await counter(page);
		await page.waitForTimeout(700);
		const b = await counter(page);
		expect(b.total).toBe(src.frames.length);
		expect(b.cur).not.toBe(a.cur); // playing

		await page.getByTitle('Pause').click();
		const p1 = await counter(page);
		await page.waitForTimeout(500);
		expect(await counter(page)).toEqual(p1);

		// Scrub: click near the right end of the filmstrip
		const strip = page.locator('.cursor-col-resize').first();
		const box = (await strip.boundingBox())!;
		await page.mouse.click(box.x + box.width * 0.9, box.y + box.height / 2);
		const s = await counter(page);
		expect(s.cur).toBeGreaterThan(src.frames.length * 0.8);
	});

	test('GIF: unedited download is the original file', async ({ page }) => {
		await open(page, '/');
		await load(page, fixture('small.gif'));
		const { bytes } = await download(page);
		expect(Buffer.from(bytes).equals(fs.readFileSync(fixture('small.gif')))).toBe(true);
	});

	test('GIF with transparency round-trips through an edit', async ({ page }) => {
		await open(page, '/reverse');
		await load(page, fixture('transparent.gif'));
		const src = decodeFile(fixture('transparent.gif'));
		await apply(page, 'Reverse Frames');
		await apply(page, 'Reverse Frames'); // back to original order, but re-encoded
		const { gif } = await download(page);
		expect(gif.frames.length).toBe(src.frames.length);
		gif.frames.forEach((f, i) => expect(maxDiff(f.data, src.frames[i].data)).toBe(0));
		expect(gif.frames[0].data.some((v, i) => i % 4 === 3 && v === 0)).toBe(true);
	});

	for (const [name, expected] of [
		['clip.mp4', { width: 640, height: 360, frames: 30 }],
		['clip.webm', { width: 640, height: 360, frames: 30 }],
		['clip-vp8.webm', { width: 320, height: 240, frames: 20 }],
		['clip-rotated.mp4', { width: 360, height: 640, frames: 30 }],
		['clip.avi', { width: 320, height: 240, frames: 20 }]
	] as const) {
		test(`video: ${name}`, async ({ page }) => {
			await open(page, '/convert');
			await load(page, fixture(name));
			const got = await info(page);
			expect(got.width).toBe(expected.width);
			expect(got.height).toBe(expected.height);
			// ffmpeg's fps filter and WebCodecs sampling may differ by a frame at the ends
			expect(Math.abs(got.frames - expected.frames)).toBeLessThanOrEqual(1);
			const { gif } = await download(page);
			expect([gif.width, gif.height]).toEqual([expected.width, expected.height]);
			expect(gif.frames[0].delay).toBe(100);
			// Orientation/content vs ffmpeg's (auto-rotated) first frame; allow YUV
			// conversion + quantization differences, but a wrong rotation is far off.
			if (name === 'clip.mp4' || name === 'clip-rotated.mp4') {
				const ref = new Uint8Array(fs.readFileSync(fixture(name.replace('.mp4', '.frame0.rgba'))));
				const f0 = gif.frames[0].data;
				let sum = 0;
				for (let i = 0; i < ref.length; i += 4)
					for (let k = 0; k < 3; k++) sum += Math.abs(ref[i + k] - f0[i + k]);
				expect(sum / ((ref.length / 4) * 3)).toBeLessThan(20); // a wrong rotation scores ~240
			}
		});
	}

	test('video: H.264 with B-frames in MKV decodes every frame correctly', async ({ page }) => {
		await open(page, '/convert');
		await load(page, fixture('clip-bframes.mkv'));
		const ref = new Uint8Array(fs.readFileSync(fixture('clip-bframes.fps10.rgba')));
		const frameBytes = 320 * 240 * 4;
		const refCount = ref.length / frameBytes;
		const { gif } = await download(page);
		expect(Math.abs(gif.frames.length - refCount)).toBeLessThanOrEqual(1);
		for (const i of [0, Math.floor(refCount / 2), refCount - 2]) {
			const f = gif.frames[i].data;
			let sum = 0;
			for (let p = 0; p < frameBytes; p += 4)
				for (let k = 0; k < 3; k++) sum += Math.abs(f[p + k] - ref[i * frameBytes + p + k]);
			expect(sum / ((frameBytes / 4) * 3)).toBeLessThan(20);
		}
	});

	test('a superseded video import never replaces the newer one', async ({ page }) => {
		const ffmpeg: string[] = [];
		page.on('request', (r) => r.url().includes('ffmpeg-core') && ffmpeg.push(r.url()));
		await open(page, '/convert');
		const input = page.locator('input[type=file]').first();
		await input.setInputFiles(fixture('clip720.mp4'));
		await input.setInputFiles(fixture('clip-vp8.webm'));
		await settle(page);
		await page.waitForTimeout(3000);
		expect(await info(page)).toMatchObject({ width: 320, height: 240 });
		expect(ffmpeg).toEqual([]); // the superseded import must not fall back to ffmpeg
	});

	test('a stream cut short by a failing import exports what is shown', async ({ page }) => {
		await open(page, '/');
		await page.locator('input[type=file]').first().setInputFiles(fixture('large.gif'));
		await expect(page.locator('span.tabular-nums.font-mono')).toBeVisible();
		await page
			.getByRole('link', { name: 'Video to GIF' })
			.filter({ visible: true })
			.first()
			.click();
		await page.locator('input[type=file]').first().setInputFiles(fixture('junk.mp4'));
		await settle(page);
		const { frames } = await info(page);
		const { gif } = await download(page);
		expect(gif.frames.length).toBe(frames);
	});

	test('image sequence and single image', async ({ page }) => {
		const seqDir = fixture('seq');
		const files = fs
			.readdirSync(seqDir)
			.sort()
			.map((f) => `${seqDir}/${f}`);
		await open(page, '/sequence');
		await load(page, files);
		expect(await info(page)).toEqual({ width: 320, height: 240, frames: files.length });

		await page.getByRole('button', { name: 'Clear File' }).click();
		await open(page, '/');
		await load(page, fixture('single.png'));
		expect(await info(page)).toEqual({ width: 300, height: 200, frames: 1 });
		const { gif } = await download(page);
		expect(gif.frames.length).toBe(1);
	});

	test('a new import replaces one that is still streaming', async ({ page }) => {
		await open(page, '/');
		await page.locator('input[type=file]').first().setInputFiles(fixture('large.gif'));
		await expect(page.locator('span.tabular-nums.font-mono')).toBeVisible();
		await page.getByRole('button', { name: 'Clear File' }).click();
		await load(page, fixture('small.gif'));
		const src = decodeFile(fixture('small.gif'));
		expect(await info(page)).toEqual({ width: 160, height: 120, frames: src.frames.length });
		expect(await page.getByTitle('Undo').isDisabled()).toBe(true);
	});
});

test.describe('edits', () => {
	let src: ReturnType<typeof decodeFile>;
	test.beforeAll(() => {
		src = decodeFile(fixture('small.gif'));
	});

	async function start(page: Page, route: string) {
		await open(page, route);
		await load(page, fixture('small.gif'));
	}

	test('resize 50% + undo/redo', async ({ page }) => {
		await start(page, '/resize');
		await page.getByRole('button', { name: '50%' }).click();
		await apply(page);
		expect(await info(page)).toMatchObject({ width: 80, height: 60 });
		const { gif } = await download(page);
		expect([gif.width, gif.height, gif.frames.length]).toEqual([80, 60, src.frames.length]);

		await page.getByTitle('Undo').click();
		await settle(page);
		expect(await info(page)).toMatchObject({ width: 160, height: 120 });
		const undone = await download(page);
		expect(maxDiff(undone.gif.frames[3].data, src.frames[3].data)).toBe(0);

		await page.getByTitle('Redo').click();
		await settle(page);
		expect(await info(page)).toMatchObject({ width: 80, height: 60 });
	});

	for (const [deg, flipH, flipV] of [
		[90, false, false],
		[180, false, false],
		[270, false, false],
		[0, true, false],
		[90, false, true]
	] as const) {
		test(`rotate ${deg}° flipH=${flipH} flipV=${flipV} is pixel-exact`, async ({ page }) => {
			await start(page, '/rotate');
			await page.getByRole('button', { name: `${deg}°`, exact: true }).click();
			if (flipH) await page.getByLabel('Flip horizontal').check();
			if (flipV) await page.getByLabel('Flip vertical').check();
			await apply(page);
			const { gif } = await download(page);
			const W = src.width;
			const H = src.height;
			const swap = deg === 90 || deg === 270;
			expect([gif.width, gif.height]).toEqual(swap ? [H, W] : [W, H]);
			// Reference transform (flip in source space, then rotate clockwise)
			const s = src.frames[2].data;
			const o = gif.frames[2].data;
			const ow = gif.width;
			let mismatches = 0;
			for (let y = 0; y < H; y++)
				for (let x = 0; x < W; x++) {
					const fx = flipH ? W - 1 - x : x;
					const fy = flipV ? H - 1 - y : y;
					const [dx, dy] =
						deg === 90
							? [H - 1 - fy, fx]
							: deg === 180
								? [W - 1 - fx, H - 1 - fy]
								: deg === 270
									? [fy, W - 1 - fx]
									: [fx, fy];
					for (let k = 0; k < 4; k++)
						if (s[(y * W + x) * 4 + k] !== o[(dy * ow + dx) * 4 + k]) mismatches++;
				}
			expect(mismatches).toBe(0);
		});
	}

	test('crop by dragging the overlay is pixel-exact', async ({ page }) => {
		await start(page, '/crop');
		const canvas = page.locator('canvas').first();
		const box = (await canvas.boundingBox())!;
		// Drag the top-left corner inwards
		await page.mouse.move(box.x + 3, box.y + 3);
		await page.mouse.down();
		await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.25, { steps: 5 });
		await page.mouse.up();
		await apply(page);
		const { width, height } = await info(page);
		expect(width).toBeLessThan(src.width);
		expect(height).toBeLessThan(src.height);
		const { gif } = await download(page);
		const x0 = src.width - width;
		const y0 = src.height - height;
		let mismatches = 0;
		for (let y = 0; y < height; y++)
			for (let x = 0; x < width; x++)
				for (let k = 0; k < 4; k++)
					if (
						gif.frames[1].data[(y * width + x) * 4 + k] !==
						src.frames[1].data[((y + y0) * src.width + x + x0) * 4 + k]
					)
						mismatches++;
		expect(mismatches).toBe(0);
	});

	test('trim via filmstrip handles', async ({ page }) => {
		await start(page, '/trim');
		const handle = page.locator('.cursor-ew-resize').first();
		const strip = (await page.locator('.cursor-col-resize').first().boundingBox())!;
		const h = (await handle.boundingBox())!;
		await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
		await page.mouse.down();
		await page.mouse.move(strip.x + strip.width * 0.5, h.y + h.height / 2, { steps: 5 });
		await page.mouse.up();
		await apply(page);
		const n = (await info(page)).frames;
		expect(n).toBeLessThan(src.frames.length);
		expect(n).toBeGreaterThan(src.frames.length * 0.3);
		const { gif } = await download(page);
		expect(gif.frames.length).toBe(n);
		const offset = src.frames.length - n;
		expect(maxDiff(gif.frames[0].data, src.frames[offset].data)).toBe(0);
	});

	test('reverse', async ({ page }) => {
		await start(page, '/reverse');
		await apply(page, 'Reverse Frames');
		const { gif } = await download(page);
		expect(gif.frames.length).toBe(src.frames.length);
		expect(maxDiff(gif.frames[0].data, src.frames[src.frames.length - 1].data)).toBe(0);
	});

	test('frame rate', async ({ page }) => {
		await start(page, '/framerate');
		await setSlider(page, 'Target FPS', 20);
		await apply(page);
		const { gif } = await download(page);
		expect(gif.frames.every((f) => f.delay === 50)).toBe(true);
		expect(maxDiff(gif.frames[5].data, src.frames[5].data)).toBe(0);
	});

	test('skip frames', async ({ page }) => {
		await start(page, '/skip-frames');
		await setSlider(page, 'Keep every', 3);
		await apply(page);
		const { gif } = await download(page);
		expect(gif.frames.length).toBe(Math.ceil(src.frames.length / 3));
		expect(maxDiff(gif.frames[1].data, src.frames[3].data)).toBe(0);
	});
});

test.describe('optimize', () => {
	async function start(page: Page, method: string) {
		await open(page, '/optimize');
		await load(page, fixture('small.gif'));
		await page.getByRole('button', { name: method }).click();
	}
	const src = () => decodeFile(fixture('small.gif'));

	test('color reduction', async ({ page }) => {
		await start(page, 'Color Reduction');
		await setSlider(page, 'Max Colors', 8);
		await apply(page);
		const { gif } = await download(page);
		const colors = new Set<number>();
		const d = gif.frames[0].data;
		for (let i = 0; i < d.length; i += 4) colors.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
		expect(colors.size).toBeLessThanOrEqual(8);
	});

	test('remove every nth frame preserves duration', async ({ page }) => {
		await start(page, 'Remove Every Nth Frame');
		await apply(page);
		const { gif } = await download(page);
		const s = src();
		expect(gif.frames.length).toBe(s.frames.length - Math.floor(s.frames.length / 2));
		const dur = (g: { frames: { delay: number }[] }) => g.frames.reduce((a, f) => a + f.delay, 0);
		expect(dur(gif)).toBe(dur(s));
	});

	test('remove duplicate frames', async ({ page }) => {
		await start(page, 'Remove Duplicate Frames');
		await apply(page);
		const { gif } = await download(page);
		expect(gif.frames.length).toBeLessThanOrEqual(src().frames.length);
	});

	test('optimize transparency renders identically, then coalesce', async ({ page }) => {
		await start(page, 'Optimize Transparency');
		await setSlider(page, 'Fuzz Factor', 0);
		await apply(page);
		const s = src();
		const { gif, bytes } = await download(page);
		// Composited output must look exactly like the source
		gif.frames.forEach((f, i) => expect(maxDiff(f.data, s.frames[i].data)).toBe(0));

		await page.getByRole('button', { name: 'Coalesce (Undo Optimizations)' }).click();
		await apply(page);
		const co = await download(page);
		co.gif.frames.forEach((f, i) => expect(maxDiff(f.data, s.frames[i].data)).toBe(0));
		expect(bytes.length).toBeLessThan(co.bytes.length);
	});

	test('gifsicle lossy compression', async ({ page }) => {
		await start(page, 'Lossy Compression');
		await apply(page);
		await expect(page.getByText(/smaller|larger/)).toBeVisible();
		const { gif, bytes } = await download(page);
		expect(gif.frames.length).toBe(src().frames.length);
		expect(bytes.length).toBeLessThan(fs.statSync(fixture('small.gif')).size * 1.5);
	});
});
