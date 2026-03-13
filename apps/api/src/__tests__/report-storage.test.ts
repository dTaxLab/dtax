import { describe, it, expect, afterAll } from "vitest";
import fs from "fs/promises";
import path from "path";
import {
  saveReport,
  getReport,
  deleteReportFile,
} from "../lib/report-storage.js";

const TEST_DIR = "./data/reports/test-user-storage";

describe("Report Storage", () => {
  afterAll(async () => {
    // Cleanup test files
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch {}
  });

  it("should save report to disk and return path and size", async () => {
    const content = Buffer.from("test csv content");
    const result = await saveReport(
      "test-user-storage",
      "form8949-2024-FIFO",
      content,
      "csv",
    );
    expect(result.path).toContain("test-user-storage");
    expect(result.path).toContain(".csv");
    expect(result.size).toBe(content.length);
  });

  it("should retrieve saved report", async () => {
    const content = Buffer.from("test pdf content");
    const result = await saveReport(
      "test-user-storage",
      "form8949-2024-PDF",
      content,
      "pdf",
    );
    const retrieved = await getReport(result.path);
    expect(retrieved.toString()).toBe("test pdf content");
  });

  it("should delete report file", async () => {
    const content = Buffer.from("to delete");
    const result = await saveReport(
      "test-user-storage",
      "to-delete",
      content,
      "csv",
    );
    await deleteReportFile(result.path);
    await expect(getReport(result.path)).rejects.toThrow();
  });

  it("should handle deleting non-existent file gracefully", async () => {
    await expect(
      deleteReportFile("/nonexistent/file.csv"),
    ).resolves.not.toThrow();
  });
});
