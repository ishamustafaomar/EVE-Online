/**
 * Serializes async work and lets callers wait for everything currently
 * queued to finish before proceeding — the fix for a real bug: readline's
 * 'close' event can fire the instant all piped/EOF input is buffered, well
 * before an in-flight command's network round trip (e.g. "undock") actually
 * completes. Without draining first, shutdown's process.exit() cuts the
 * command off mid-flight.
 */
export class CommandQueue {
  private tail: Promise<void> = Promise.resolve();

  /**
   * Enqueue work; it runs strictly after everything already queued has
   * completed, whether or not that prior work succeeded. A rejection from
   * `fn` is swallowed after it runs (callers should handle their own errors,
   * as main.ts's execute() wrapper does) so one failing task can never
   * permanently stall every task queued after it.
   */
  push(fn: () => Promise<void>): void {
    this.tail = this.tail.then(fn, fn).catch(() => undefined);
  }

  /** Resolves once every currently enqueued task has completed. */
  drain(): Promise<void> {
    return this.tail;
  }
}
