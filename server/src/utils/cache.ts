import fs from 'node:fs';

interface CacheEntry<T> {
  signature: string;
  value: T;
}

/**
 * Stat-keyed file cache using `mtimeMs:size` signatures.
 * Ensures repeated board polling across dozens/hundreds of conversations
 * only re-parses files that actually changed on disk.
 */
export class FileStatCache<T> {
  private readonly store = new Map<string, CacheEntry<T>>();
  private readonly maxEntries: number;

  constructor(maxEntries = 2000) {
    this.maxEntries = maxEntries;
  }

  getOrCompute(filePath: string, compute: (filePath: string, stat: fs.Stats) => T): T | null {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      this.store.delete(filePath);
      return null;
    }

    const signature = `${stat.mtimeMs}:${stat.size}`;
    const existing = this.store.get(filePath);
    if (existing && existing.signature === signature) {
      return existing.value;
    }

    const value = compute(filePath, stat);
    this.set(filePath, signature, value);
    return value;
  }

  /**
   * Cache keyed by a composite signature (e.g., multiple files in a swarm directory).
   */
  getOrComputeBySignature(key: string, signature: string, compute: () => T): T {
    const existing = this.store.get(key);
    if (existing && existing.signature === signature) {
      return existing.value;
    }
    const value = compute();
    this.set(key, signature, value);
    return value;
  }

  private set(key: string, signature: string, value: T): void {
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }
    this.store.set(key, { signature, value });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

/**
 * Compute a quick stat signature across a list of candidate files inside a directory.
 */
export function buildFilesSignature(paths: string[]): string {
  const parts: string[] = [];
  for (const p of paths) {
    try {
      const st = fs.statSync(p);
      parts.push(`${p}|${st.mtimeMs}|${st.size}`);
    } catch {
      parts.push(`${p}|missing`);
    }
  }
  return parts.join(';');
}
