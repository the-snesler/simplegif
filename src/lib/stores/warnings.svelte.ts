import { project } from './project.svelte';
import { formatFileSize } from '$lib/utils/file';
import type { Pathname } from '$app/types';

export type WarningLink = { href: Pathname; label: string };

export type Warning = {
	id: string;
	title: string;
	description: string;
	links: WarningLink[];
};

const MAX_DIMENSION = 1024;
const MAX_DURATION_MS = 10_000;
const MAX_ASPECT = 3;
const MAX_FRAME_RATE = 30;
const MAX_ESTIMATED_BYTES = 8 * 1024 * 1024;
// Napkin math: GIF stores 1 byte per pixel (8-bit indexed), and LZW typically
// compresses 3-5x. 0.2 errs slightly conservative (over-warns on flat content),
// which is the right bias for a "you may want to optimize" hint.
const COMPRESSION_FACTOR = 0.2;

function estimateBytes(width: number, height: number, frameCount: number): number {
	return Math.round(width * height * frameCount * COMPRESSION_FACTOR);
}

const list = $derived.by<Warning[]>(() => {
	if (!project.isLoaded || project.frameCount === 0) return [];

	const out: Warning[] = [];
	const { width, height, frameCount, frameRate, duration } = project;

	if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
		out.push({
			id: 'dimensions',
			title: `Large dimensions (${width}×${height})`,
			description: `GIFs are often displayed at a small scale, so large dimensions will only increase file size.`,
			links: [
				{ href: '/resize', label: 'Resize' },
				{ href: '/optimize', label: 'Optimize' }
			]
		});
	}

	if (duration > MAX_DURATION_MS) {
		out.push({
			id: 'duration',
			title: `Long duration (${(duration / 1000).toFixed(1)}s)`,
			description: `GIFs longer than ${MAX_DURATION_MS / 1000}s can be difficult to watch in one go. Consider trimming it to a shorter duration.`,
			links: [{ href: '/trim', label: 'Trim' }]
		});
	}

	if (width > 0 && height > 0) {
		const ratio = width / height;
		if (ratio > MAX_ASPECT || ratio < 1 / MAX_ASPECT) {
			out.push({
				id: 'aspect',
				title: 'Extreme aspect ratio',
				description: `Aspect ratio is ${ratio.toFixed(2)}:1, which may display poorly on some platforms.`,
				links: [{ href: '/crop', label: 'Crop' }]
			});
		}
	}

	if (frameRate > MAX_FRAME_RATE) {
		out.push({
			id: 'framerate',
			title: `High frame rate (${frameRate} fps)`,
			description: `GIFs above ${MAX_FRAME_RATE} fps rarely look better but cost a lot of size.`,
			links: [
				{ href: '/skip-frames', label: 'Skip frames' },
				{ href: '/framerate', label: 'Frame rate' },
				{ href: '/optimize', label: 'Optimize' }
			]
		});
	}

	const estimated = estimateBytes(width, height, frameCount);
	if (estimated > MAX_ESTIMATED_BYTES) {
		out.push({
			id: 'filesize',
			title: `Estimated size ~${formatFileSize(estimated)}`,
			description: `Upper bound estimate based on resolution and frame count. Large GIFs are slow to share and may exceed file size limits.`,
			links: [{ href: '/optimize', label: 'Optimize' }]
		});
	}

	return out;
});

export const warnings = {
	get list() {
		return list;
	},
	get count() {
		return list.length;
	},
	get hasAny() {
		return list.length > 0;
	}
};
