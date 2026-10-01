import { createQueryHandler, type QueryRequest } from './query-protocol';

/**
 * Web Worker entry: filters and sorts the dataset off the main thread.
 *
 * The global scope is typed through a minimal interface instead of the `webworker` lib, which
 * conflicts with the `dom` lib the rest of this library compiles against.
 */
interface WorkerScope {
  postMessage(message: unknown, transfer: Transferable[]): void;
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<QueryRequest>) => void,
  ): void;
}

const scope = self as unknown as WorkerScope;
const handle = createQueryHandler((response, transfer) =>
  scope.postMessage(response, transfer),
);
scope.addEventListener('message', (event) => handle(event.data));
