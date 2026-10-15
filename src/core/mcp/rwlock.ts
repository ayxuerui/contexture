/**
 * serve-the-store-over-mcp design.md D8: every tool call reads one commit.
 * Tool calls share the lock; a sync takes it exclusively. A waiting writer
 * blocks new readers, so a steady stream of calls cannot postpone a sync
 * forever, and a sync waits for the calls already in flight.
 */
export class ReadWriteLock {
  private readers = 0;
  private writing = false;
  private readonly waiting: { kind: 'read' | 'write'; grant: () => void }[] = [];

  private canRead(): boolean {
    return !this.writing && !this.waiting.some((w) => w.kind === 'write');
  }

  private wake(): void {
    while (this.waiting.length > 0) {
      const next = this.waiting[0]!;
      if (next.kind === 'write') {
        if (this.writing || this.readers > 0) return;
        this.waiting.shift();
        this.writing = true;
        next.grant();
        return;
      }
      if (this.writing) return;
      this.waiting.shift();
      this.readers += 1;
      next.grant();
    }
  }

  async read<T>(fn: () => Promise<T>): Promise<T> {
    if (this.canRead()) this.readers += 1;
    else await new Promise<void>((grant) => this.waiting.push({ kind: 'read', grant }));
    try {
      return await fn();
    } finally {
      this.readers -= 1;
      this.wake();
    }
  }

  async write<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.writing && this.readers === 0 && this.waiting.length === 0) this.writing = true;
    else await new Promise<void>((grant) => this.waiting.push({ kind: 'write', grant }));
    try {
      return await fn();
    } finally {
      this.writing = false;
      this.wake();
    }
  }
}
