export type MarketDataErrorKind =
  /** The request could not be completed (offline, server error, simulated failure). Retryable. */
  | 'network'
  /** The response arrived but is not valid market data. Not retryable. */
  | 'invalid-data'
  /** The requested instrument does not exist. */
  | 'not-found'
  /** The caller aborted the request. */
  | 'aborted';

export class MarketDataError extends Error {
  constructor(
    readonly kind: MarketDataErrorKind,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'MarketDataError';
  }

  get retryable(): boolean {
    return this.kind === 'network';
  }
}

export function isMarketDataError(error: unknown): error is MarketDataError {
  return error instanceof MarketDataError;
}

/** Rejects with an `aborted` error if the signal has fired. */
export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new MarketDataError('aborted', 'The request was aborted', {
      cause: signal.reason,
    });
  }
}
