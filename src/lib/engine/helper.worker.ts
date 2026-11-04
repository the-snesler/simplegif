/// <reference lib="webworker" />
/**
 * Stateless CPU helper. The main thread creates it and hands it one end of a
 * MessageChannel whose other end belongs to the engine worker; all task
 * traffic then flows engine ⇄ helper directly.
 */
import type { HelperReply, HelperTask } from './protocol';
import { resultTransferables, runHelperTask } from './helper-tasks';

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (e: MessageEvent<{ port: MessagePort }>) => {
	const port = e.data.port;
	port.onmessage = async (ev: MessageEvent<{ id: number; task: HelperTask }>) => {
		const { id, task } = ev.data;
		let reply: HelperReply;
		let transfer: Transferable[] = [];
		try {
			const result = await runHelperTask(task);
			reply = { id, ok: true, result };
			transfer = resultTransferables(result);
		} catch (err) {
			reply = { id, ok: false, error: err instanceof Error ? err.message : String(err) };
		}
		port.postMessage(reply, transfer);
	};
	port.start();
};
