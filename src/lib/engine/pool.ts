/**
 * Engine-side scheduler for helper workers. Two priority lanes: user-facing
 * work ('high') always runs before speculative work ('low', e.g. background
 * pre-encoding). Low-priority jobs can be promoted (when the user asks for
 * their result) or cancelled (when they become stale).
 *
 * Inputs are structured-cloned to helpers — the engine keeps its copies for
 * history — and results come back transferred.
 */
import type { HelperReply, HelperResults, HelperTask } from './protocol';
import { runHelperTask } from './helper-tasks';

export type Priority = 'high' | 'low';

export class Cancelled extends Error {
	constructor() {
		super('cancelled');
	}
}

export interface Job<T = unknown> {
	promise: Promise<T>;
	priority: Priority;
}

interface InternalJob extends Job {
	id: number;
	task: HelperTask;
	resolve: (v: unknown) => void;
	reject: (e: Error) => void;
	state: 'queued' | 'running' | 'done';
}

interface Helper {
	port: MessagePort;
	job: InternalJob | null;
	dead: boolean;
}

let nextId = 1;

export class Pool {
	private helpers: Helper[] = [];
	private high: InternalJob[] = [];
	private low: InternalJob[] = [];
	private localBusy = false;
	private running = new Map<number, { job: InternalJob; helper: Helper }>();

	setHelpers(ports: MessagePort[]) {
		this.helpers = ports.map((port) => {
			const helper: Helper = { port, job: null, dead: false };
			port.onmessage = (e: MessageEvent<HelperReply>) => this.onReply(helper, e.data);
			port.start();
			return helper;
		});
		this.pump();
	}

	get size() {
		return Math.max(1, this.helpers.filter((h) => !h.dead).length);
	}

	markDead(index: number) {
		const helper = this.helpers[index];
		if (!helper || helper.dead) return;
		helper.dead = true;
		const job = helper.job;
		helper.job = null;
		if (job) {
			this.running.delete(job.id);
			job.state = 'queued';
			(job.priority === 'high' ? this.high : this.low).unshift(job);
		}
		this.pump();
	}

	run<K extends HelperTask['t']>(
		task: Extract<HelperTask, { t: K }>,
		priority: Priority = 'high'
	): Job<HelperResults[K]> {
		let resolve!: (v: unknown) => void;
		let reject!: (e: Error) => void;
		const promise = new Promise<unknown>((res, rej) => {
			resolve = res;
			reject = rej;
		});
		const job: InternalJob = {
			id: nextId++,
			task,
			priority,
			promise,
			resolve,
			reject,
			state: 'queued'
		};
		(priority === 'high' ? this.high : this.low).push(job);
		this.pump();
		return job as unknown as Job<HelperResults[K]>;
	}

	/** Move a queued low-priority job into the high lane. */
	promote(job: Job) {
		const j = job as InternalJob;
		if (j.priority === 'high') return;
		j.priority = 'high';
		const i = this.low.indexOf(j);
		if (i >= 0) {
			this.low.splice(i, 1);
			this.high.push(j);
			this.pump();
		}
	}

	/** Drop all queued (not yet running) low-priority jobs. */
	cancelLow() {
		const dropped = this.low;
		this.low = [];
		for (const j of dropped) {
			j.state = 'done';
			j.reject(new Cancelled());
		}
	}

	/**
	 * Speculative (low-priority) work may only occupy half the helpers, so a
	 * user action arriving mid pre-encode finds idle cores immediately.
	 */
	private lowLimit() {
		return Math.max(1, Math.floor(this.helpers.filter((h) => !h.dead).length / 2));
	}

	private runningLow() {
		let n = 0;
		for (const { job } of this.running.values()) if (job.priority === 'low') n++;
		return n;
	}

	private next(): InternalJob | undefined {
		if (this.high.length) return this.high.shift();
		if (this.low.length && this.runningLow() < this.lowLimit()) return this.low.shift();
		return undefined;
	}

	private pump() {
		const live = this.helpers.filter((h) => !h.dead);
		if (live.length === 0) {
			this.pumpLocal();
			return;
		}
		for (const helper of live) {
			if (helper.job) continue;
			const job = this.next();
			if (!job) return;
			helper.job = job;
			job.state = 'running';
			this.running.set(job.id, { job, helper });
			helper.port.postMessage({ id: job.id, task: job.task });
		}
	}

	private onReply(helper: Helper, reply: HelperReply) {
		const entry = this.running.get(reply.id);
		if (!entry) return;
		this.running.delete(reply.id);
		helper.job = null;
		const { job } = entry;
		job.state = 'done';
		if (reply.ok) job.resolve(reply.result);
		else job.reject(new Error(reply.error));
		this.pump();
	}

	/** Fallback when no helper workers are available: run on this thread, yielding between jobs. */
	private pumpLocal() {
		if (this.localBusy) return;
		const job = this.next();
		if (!job) return;
		this.localBusy = true;
		job.state = 'running';
		setTimeout(async () => {
			try {
				job.resolve(await runHelperTask(job.task));
			} catch (err) {
				job.reject(err instanceof Error ? err : new Error(String(err)));
			} finally {
				job.state = 'done';
				this.localBusy = false;
				this.pumpLocal();
			}
		}, 0);
	}
}
