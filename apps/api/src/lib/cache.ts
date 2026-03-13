/**
 * In-memory cache with TTL and prefix-based invalidation.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class MemoryCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private ttlSeconds: number;
  private maxSize: number;

  constructor(ttlSeconds: number = 120, maxSize: number = 1000) {
    this.ttlSeconds = ttlSeconds;
    this.maxSize = maxSize;
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttl?: number): void {
    if (this.store.size >= this.maxSize && !this.store.has(key)) {
      const firstKey = this.store.keys().next().value;
      if (firstKey) this.store.delete(firstKey);
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttl || this.ttlSeconds) * 1000,
    });
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }

  invalidateByPrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

/** Global API cache instance: 2 min TTL, max 5000 entries. */
export const apiCache = new MemoryCache(120, 5000);
