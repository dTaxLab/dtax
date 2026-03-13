import fs from "fs/promises";
import path from "path";

const REPORTS_DIR = process.env.REPORTS_DIR || "./data/reports";

export async function saveReport(
  userId: string,
  filename: string,
  content: Buffer,
  extension: string,
): Promise<{ path: string; size: number }> {
  const dir = path.join(REPORTS_DIR, userId);
  await fs.mkdir(dir, { recursive: true });
  const filepath = path.join(dir, `${filename}.${extension}`);
  await fs.writeFile(filepath, content);
  return { path: filepath, size: content.length };
}

export async function getReport(filepath: string): Promise<Buffer> {
  return fs.readFile(filepath);
}

export async function deleteReportFile(filepath: string): Promise<void> {
  try {
    await fs.unlink(filepath);
  } catch {
    // File may already be deleted
  }
}

export function getReportsDir(): string {
  return REPORTS_DIR;
}
