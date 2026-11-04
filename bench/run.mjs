#!/usr/bin/env node
/**
 * UI-driven benchmark of the import → edit → download cycle.
 *
 *   node bench/run.mjs --url A=http://localhost:5197 --url B=http://localhost:5198 \
 *     [--runs 3] [--fixtures medium.gif,large.gif,clip720.mp4] [--out bench/results/x.json]
 *
 * Builds are interleaved run-by-run (A, B, A, B, …) so background load affects
 * them equally; medians are reported. Requires fixtures from e2e/fixtures/generate.sh.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, def) => {
	const vals = [];
	args.forEach((a, i) => a === `--${name}` && vals.push(args[i + 1]));
	return vals.length ? vals : def;
};
const targets = opt('url', []).map((s) => {
	const [label, url] = s.includes('=') ? s.split('=') : [s, s];
	return { label, url };
});
if (!targets.length) {
	console.error('usage: node bench/run.mjs --url label=http://host:port [--url ...]');
	process.exit(1);
}
const runs = Number(opt('runs', ['3'])[0]);
const fixtures = opt('fixtures', ['medium.gif,large.gif,clip720.mp4'])[0].split(',');
const out = opt('out', [null])[0];
const FIX = path.resolve('e2e/fixtures/out');

const browser = await chromium.launch({
	executablePath: process.env.PW_CHROMIUM_PATH || undefined
});

async function measureCycle(url, fixture) {
	const ctx = await browser.newContext({
		acceptDownloads: true,
		viewport: { width: 1280, height: 800 }
	});
	const page = await ctx.newPage();
	// Main-thread responsiveness probes
	await page.addInitScript(() => {
		window.__lt = 0;
		window.__maxGap = 0;
		try {
			new PerformanceObserver((l) => {
				for (const e of l.getEntries()) window.__lt += e.duration;
			}).observe({ type: 'longtask', buffered: true });
		} catch {
			/* unsupported */
		}
		let last = performance.now();
		const tick = (t) => {
			window.__maxGap = Math.max(window.__maxGap, t - last);
			last = t;
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	});
	const isVideo = /\.(mp4|webm|mov|avi)$/.test(fixture);
	await page.goto(`${url}${isVideo ? '/convert' : '/resize'}`, { waitUntil: 'networkidle' });
	await page.evaluate(() => {
		window.__lt = 0;
		window.__maxGap = 0;
	});

	const settle = async () => {
		await page.waitForFunction(() => !document.querySelector('[role=status]'), null, {
			timeout: 300000
		});
		if (await page.locator('[data-engine]').count())
			await page.waitForSelector('[data-engine=ready]', { timeout: 300000 });
	};
	const timed = async (fn) => {
		const t = performance.now();
		await fn();
		return Math.round(performance.now() - t);
	};
	const nav = async (name) => {
		await page.getByRole('link', { name }).filter({ visible: true }).first().click();
		await page.waitForTimeout(150);
	};
	const applyBtn = (label = 'Apply') => page.getByRole('button', { name: label, exact: true });
	const download = async () => {
		const [d] = await Promise.all([
			page.waitForEvent('download', { timeout: 300000 }),
			page.getByRole('button', { name: 'Download GIF' }).click()
		]);
		await d.path();
		await settle();
	};

	const r = {};
	const t0 = performance.now();
	await page.locator('input[type=file]').first().setInputFiles(path.join(FIX, fixture));
	await page.waitForSelector('span.tabular-nums.font-mono', { timeout: 300000 });
	r.importFirstFrame = Math.round(performance.now() - t0);
	await settle();
	r.importReady = Math.round(performance.now() - t0);
	r.downloadUnedited = await timed(download);

	if (isVideo) await nav('Resize');
	await page.getByRole('button', { name: '50%' }).click();
	r.resize50 = await timed(async () => {
		await applyBtn().click();
		await settle();
	});
	await nav('Rotate / Flip');
	await page.getByRole('button', { name: '90°', exact: true }).click();
	r.rotate90 = await timed(async () => {
		await applyBtn().click();
		await settle();
	});
	await nav('Reverse');
	r.reverse = await timed(async () => {
		await applyBtn('Reverse Frames').click();
		await settle();
	});
	await nav('Optimize');
	await page.getByRole('button', { name: 'Color Reduction' }).click();
	r.colorReduce = await timed(async () => {
		await applyBtn().click();
		await settle();
	});
	r.downloadEdited = await timed(download);
	r.undo = await timed(async () => {
		await page.getByTitle('Undo').click();
		await page.waitForTimeout(50);
		await settle();
	});
	r.downloadAfterUndo = await timed(download);
	r.cycleTotal = Math.round(performance.now() - t0);
	const probes = await page.evaluate(() => ({ lt: window.__lt, gap: window.__maxGap }));
	r.mainThreadLongTasks = Math.round(probes.lt);
	r.maxFrameGap = Math.round(probes.gap);
	await ctx.close();
	return r;
}

const results = {}; // fixture -> label -> metric -> [values]
for (const fixture of fixtures) {
	results[fixture] = {};
	for (let i = 0; i < runs; i++) {
		for (const { label, url } of i % 2 ? [...targets].reverse() : targets) {
			try {
				const r = await measureCycle(url, fixture);
				const bucket = (results[fixture][label] ??= {});
				for (const [k, v] of Object.entries(r)) (bucket[k] ??= []).push(v);
				console.error(`${fixture} ${label} run ${i + 1}: ${JSON.stringify(r)}`);
			} catch (err) {
				console.error(`${fixture} ${label} run ${i + 1} FAILED: ${err.message.split('\n')[0]}`);
			}
		}
	}
}
await browser.close();

const median = (a) => {
	const s = [...a].sort((x, y) => x - y);
	return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN;
};
const summary = {};
for (const [fixture, byLabel] of Object.entries(results)) {
	summary[fixture] = {};
	for (const [label, metrics] of Object.entries(byLabel)) {
		summary[fixture][label] = Object.fromEntries(
			Object.entries(metrics).map(([k, v]) => [k, median(v)])
		);
	}
}

// Table: rows = metric, columns = labels (+ change vs first label)
for (const [fixture, byLabel] of Object.entries(summary)) {
	const labels = targets.map((t) => t.label).filter((l) => byLabel[l]);
	const metrics = Object.keys(byLabel[labels[0]] ?? {});
	console.log(`\n## ${fixture} (median of ${runs}, ms)`);
	console.log(`| metric | ${labels.join(' | ')} |${labels.length > 1 ? ' change |' : ''}`);
	console.log(`|---|${labels.map(() => '---:').join('|')}|${labels.length > 1 ? '---:|' : ''}`);
	for (const m of metrics) {
		const vals = labels.map((l) => byLabel[l]?.[m]);
		const change =
			labels.length > 1 && vals[0]
				? ` ${(((vals[1] - vals[0]) / vals[0]) * 100).toFixed(0)}% |`
				: '';
		console.log(`| ${m} | ${vals.join(' | ')} |${change}`);
	}
}
if (out) {
	fs.mkdirSync(path.dirname(out), { recursive: true });
	fs.writeFileSync(out, JSON.stringify({ runs, targets, results, summary }, null, 2));
}
