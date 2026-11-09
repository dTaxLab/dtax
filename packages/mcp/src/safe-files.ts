/**
 * Reading the files the assistant names, safely.
 *
 * The assistant (and anything it has read) chooses the paths, so this is a trust
 * boundary: only .csv files, only inside the allowed folders (the home folder
 * and the working folder, or those in DTAX_MCP_ALLOWED_DIRS), links resolved
 * before the check, a size cap, and an error never carries file content.
 *
 * @license AGPL-3.0
 */

import { readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, isAbsolute, resolve, sep } from "node:path";
import { MAX_FILE_BYTES } from "./constants";

/** An error that is safe to show: it names the problem, never the content. */
export class UserError extends Error {}

export function allowedRoots(env: NodeJS.ProcessEnv = process.env): string[] {
  const configured = (env.DTAX_MCP_ALLOWED_DIRS ?? "")
    .split(delimiter)
    .map((d) => d.trim())
    .filter(Boolean);
  const roots = configured.length > 0 ? configured : [homedir(), process.cwd()];
  const real: string[] = [];
  for (const r of roots) {
    try {
      real.push(realpathSync(resolve(r)));
    } catch {
      // a folder that does not exist allows nothing
    }
  }
  return real;
}

function inside(file: string, root: string): boolean {
  return (
    file === root || file.startsWith(root.endsWith(sep) ? root : root + sep)
  );
}

/** The real path of a file that may be read, or a UserError. */
export function resolveCsvPath(input: string, roots: string[]): string {
  if (typeof input !== "string" || input.length === 0 || input.includes("\0")) {
    throw new UserError("The file path is not valid.");
  }
  if (!/\.csv$/i.test(input)) {
    throw new UserError("Only .csv files can be read.");
  }
  const full = isAbsolute(input) ? input : resolve(process.cwd(), input);
  let real: string;
  try {
    real = realpathSync(full);
  } catch {
    throw new UserError("The file was not found.");
  }
  if (!roots.some((r) => inside(real, r))) {
    throw new UserError(
      "The file is outside the folders this server may read. Set DTAX_MCP_ALLOWED_DIRS to allow another folder.",
    );
  }
  let st;
  try {
    st = statSync(real);
  } catch {
    throw new UserError("The file could not be read.");
  }
  if (!st.isFile()) throw new UserError("The path is not a file.");
  if (st.size > MAX_FILE_BYTES) {
    throw new UserError("The file is larger than 25 MB.");
  }
  return real;
}

export function readCsv(input: string, roots: string[]): string {
  const real = resolveCsvPath(input, roots);
  try {
    return readFileSync(real, "utf-8");
  } catch {
    throw new UserError("The file could not be read.");
  }
}
