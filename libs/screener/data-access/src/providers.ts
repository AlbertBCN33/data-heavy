// Secondary entry point for app-level setup. Keeps stores and the query worker client out of the
// initial bundle; features import those from the main entry point, which is loaded lazily.
export * from './lib/provide-market-data';
export { DEFAULT_SIMULATION } from './lib/simulated-latency.adapter';
export { QUERY_WORKER_FACTORY } from './lib/query/query-worker-factory';
