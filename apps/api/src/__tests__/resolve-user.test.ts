import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../plugins/cpa-guard", () => ({
  verifyCpaClientAccess: vi.fn(),
}));

import { resolveUserId } from "../plugins/resolve-user.js";
import { verifyCpaClientAccess } from "../plugins/cpa-guard.js";

const mockVerify = verifyCpaClientAccess as ReturnType<typeof vi.fn>;

describe("resolveUserId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return own userId when no clientId", async () => {
    const request = { userId: "user-1", query: {} } as any;
    const result = await resolveUserId(request);
    expect(result).toBe("user-1");
  });

  it("should return client userId when CPA has access", async () => {
    mockVerify.mockResolvedValue({
      allowed: true,
      clientUserId: "client-user-1",
    });
    const request = {
      userId: "cpa-1",
      query: { clientId: "client-1" },
    } as any;
    const result = await resolveUserId(request);
    expect(result).toBe("client-user-1");
    expect(mockVerify).toHaveBeenCalledWith("cpa-1", "client-1");
  });

  it("should throw 403 when CPA has no access", async () => {
    mockVerify.mockResolvedValue({ allowed: false });
    const request = {
      userId: "cpa-1",
      query: { clientId: "client-1" },
    } as any;
    await expect(resolveUserId(request)).rejects.toThrow(
      "No access to this client",
    );
  });

  it("should throw 403 when clientUserId is missing", async () => {
    mockVerify.mockResolvedValue({ allowed: true, clientUserId: undefined });
    const request = {
      userId: "cpa-1",
      query: { clientId: "client-1" },
    } as any;
    await expect(resolveUserId(request)).rejects.toThrow(
      "No access to this client",
    );
  });
});
