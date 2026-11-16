// The sheet filter asks the server for matches, so keys pressed while it's asking wait for the answer
// and then act on the filtered list instead of the one about to be replaced.

/**
 * @template T
 */
export class Finder {
  /**
   * @param {(query: string) => Promise<T>} lookup
   * @param {(matches: T | undefined) => void} show called with the matches, or undefined for an empty query
   */
  constructor(lookup, show) {
    this.lookup = lookup;
    this.show = show;
    this.seq = 0;
    /** @type {Promise<void>} */
    this.done = Promise.resolve();
  }

  /** @param {string} query */
  search(query) {
    const seq = ++this.seq;
    this.done = (async () => {
      if (!query.trim()) return this.show(undefined);
      const matches = await this.lookup(query).catch(() => undefined);
      if (seq === this.seq && matches !== undefined) this.show(matches);
    })();
    return this.done;
  }

  /**
   * Runs `fn` once the latest search is shown, after anything queued before it.
   * @param {() => void} fn
   */
  after(fn) {
    this.done = this.done.then(fn);
    return this.done;
  }
}
