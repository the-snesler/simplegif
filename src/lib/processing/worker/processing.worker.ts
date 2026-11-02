/// <reference lib="webworker" />
import { collectTransferables, runOp, type OpRequest } from './ops';

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = async (e: MessageEvent<{ req: OpRequest }>) => {
	try {
		const result = await runOp(e.data.req, (pct) => self.postMessage({ type: 'progress', pct }));
		self.postMessage({ type: 'done', result }, collectTransferables(result));
	} catch (err) {
		self.postMessage({
			type: 'error',
			message: err instanceof Error ? err.message : String(err)
		});
	}
};
