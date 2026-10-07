import { describe, expect, it } from "vitest";
import { draftWorkId } from "./NewWorkDialog";

describe("draftWorkId", () => {
  it("builds ORG-YEAR-NAME from the project name", () => {
    expect(draftWorkId("RHD", "Dhaka Bypass (Phase 2)", 2026)).toBe("RHD-2026-DHAKA-BYPASS-PHASE-2");
  });

  it("keeps it short and never ends on a dash", () => {
    const id = draftWorkId("RHD", "A very long project name for a bridge over the river", 2026);
    expect(id.length).toBeLessThanOrEqual("RHD-2026-".length + 32);
    expect(id.endsWith("-")).toBe(false);
  });

  it("drops non-latin text rather than producing an empty tail", () => {
    expect(draftWorkId("RHD", "ঢাকা", 2026)).toBe("RHD-2026");
  });
});
