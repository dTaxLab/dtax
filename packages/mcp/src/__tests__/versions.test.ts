import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ENGINE_VERSION, SERVER_VERSION } from "../constants";

const pkg = (p: string) =>
  JSON.parse(readFileSync(join(__dirname, p, "package.json"), "utf-8"));

describe("versions stated in results", () => {
  it("the engine version in results is the engine's own", () => {
    expect(ENGINE_VERSION).toBe(pkg("../../../tax-engine").version);
  });
  it("the server version is this package's", () => {
    expect(SERVER_VERSION).toBe(pkg("../..").version);
  });
});
