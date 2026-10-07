import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSaveStatus, writeFinished, writeStarted } from "./saveStatus";
import { formatCheckpointTime } from "../components/works/WorkHeaderControls";

describe("save status", () => {
  it("tracks in-flight writes and remembers a failure until the next success", () => {
    const { result } = renderHook(() => useSaveStatus());
    act(() => {
      writeStarted();
      writeStarted();
    });
    expect(result.current).toBe("saving");
    act(() => writeFinished(true));
    expect(result.current).toBe("saving");
    act(() => writeFinished(false));
    expect(result.current).toBe("error");
    act(() => {
      writeStarted();
      writeFinished(true);
    });
    expect(result.current).toBe("saved");
  });
});

describe("formatCheckpointTime", () => {
  it("treats zone-less server timestamps as UTC", () => {
    const now = new Date("2026-09-25T12:00:00Z");
    const naive = formatCheckpointTime("2026-09-25T08:14:00", now);
    const explicit = formatCheckpointTime("2026-09-25T08:14:00Z", now);
    expect(naive).toBe(explicit);
  });

  it("adds the date for older checkpoints and handles empty input", () => {
    const now = new Date("2026-09-25T12:00:00Z");
    expect(formatCheckpointTime("2026-09-20T08:14:00Z", now)).toMatch(/20/);
    expect(formatCheckpointTime(null)).toBeNull();
    expect(formatCheckpointTime("not a date")).toBeNull();
  });
});
