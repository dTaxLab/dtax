import { describe, it, expect } from "vitest";
import { MemoryCache } from "../lib/cache.js";

describe("MemoryCache", () => {
  it("should cache and retrieve value", () => {
    const cache = new MemoryCache(60);
    cache.set("key1", { data: "hello" });
    expect(cache.get("key1")).toEqual({ data: "hello" });
  });

  it("should return null for missing key", () => {
    const cache = new MemoryCache(60);
    expect(cache.get("missing")).toBeNull();
  });

  it("should return null for expired entries", async () => {
    const cache = new MemoryCache(0.1); // 100ms TTL
    cache.set("key1", { data: "hello" });
    await new Promise((r) => setTimeout(r, 150));
    expect(cache.get("key1")).toBeNull();
  });

  it("should invalidate single key", () => {
    const cache = new MemoryCache(60);
    cache.set("k1", "v1");
    cache.invalidate("k1");
    expect(cache.get("k1")).toBeNull();
  });

  it("should invalidate by prefix", () => {
    const cache = new MemoryCache(60);
    cache.set("user:1:portfolio", { v: 1 });
    cache.set("user:1:dashboard", { v: 2 });
    cache.set("user:2:portfolio", { v: 3 });
    cache.invalidateByPrefix("user:1:");
    expect(cache.get("user:1:portfolio")).toBeNull();
    expect(cache.get("user:1:dashboard")).toBeNull();
    expect(cache.get("user:2:portfolio")).toEqual({ v: 3 });
  });

  it("should respect max size limit", () => {
    const cache = new MemoryCache(60, 2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    expect(cache.get("a")).toBeNull();
    expect(cache.get("b")).toBe(2);
    expect(cache.get("c")).toBe(3);
  });

  it("should clear all entries", () => {
    const cache = new MemoryCache(60);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it("should report size correctly", () => {
    const cache = new MemoryCache(60);
    expect(cache.size).toBe(0);
    cache.set("a", 1);
    expect(cache.size).toBe(1);
  });
});
