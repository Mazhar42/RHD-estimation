import { describe, it, expect } from "vitest";
import { parseDimensionInput, getInitialDimensionValue } from "./dimensions";

describe("parseDimensionInput", () => {
  it("returns null value/expr/error for empty input", () => {
    expect(parseDimensionInput("")).toEqual({ value: null, expr: null, error: null });
    expect(parseDimensionInput("   ")).toEqual({ value: null, expr: null, error: null });
    expect(parseDimensionInput(null)).toEqual({ value: null, expr: null, error: null });
    expect(parseDimensionInput(undefined)).toEqual({ value: null, expr: null, error: null });
  });

  it("parses a plain number with no expression", () => {
    const result = parseDimensionInput("3.25");
    expect(result).toEqual({ value: 3.25, expr: null, error: null });
  });

  it("parses a negative number", () => {
    expect(parseDimensionInput("-5").value).toBe(-5);
  });

  it("evaluates a simple arithmetic expression and preserves the original text", () => {
    const result = parseDimensionInput("2+3");
    expect(result.value).toBe(5);
    expect(result.expr).toBe("2+3");
    expect(result.error).toBeNull();
  });

  it("evaluates expressions with parentheses and operator precedence", () => {
    expect(parseDimensionInput("2+3*4").value).toBe(14);
    expect(parseDimensionInput("(2+3)*4").value).toBe(20);
  });

  it("normalizes x/X/× as multiplication", () => {
    expect(parseDimensionInput("2x3").value).toBe(6);
    expect(parseDimensionInput("2X3").value).toBe(6);
    expect(parseDimensionInput("2×3").value).toBe(6);
  });

  it("inserts implicit multiplication for adjacent parentheses/digits", () => {
    expect(parseDimensionInput("2(3)").value).toBe(6);
    expect(parseDimensionInput("(2)(3)").value).toBe(6);
    expect(parseDimensionInput("(2)3").value).toBe(6);
  });

  it("converts common unicode fractions before evaluating", () => {
    expect(parseDimensionInput("½").value).toBe(0.5);
    expect(parseDimensionInput("1+¼").value).toBe(1.25);
  });

  it("strips internal whitespace before evaluating", () => {
    expect(parseDimensionInput("2 + 3").value).toBe(5);
  });

  it("rejects a non-numeric, non-arithmetic string as an invalid expression", () => {
    const result = parseDimensionInput("abc");
    expect(result).toEqual({ value: null, expr: null, error: "Invalid expression" });
  });

  it("rejects a malformed expression (double dot)", () => {
    const result = parseDimensionInput("1..2");
    expect(result.error).toBe("Invalid expression");
  });

  it("rejects a syntactically invalid arithmetic expression", () => {
    const result = parseDimensionInput("2+*3");
    expect(result.error).toBe("Invalid expression");
  });

  it("rejects division producing a non-finite result", () => {
    const result = parseDimensionInput("1/0");
    expect(result.value).toBeNull();
    expect(result.error).toBe("Invalid expression");
  });

  // This function feeds a user-controlled string into `Function(...)`
  // (see dimensions.js), gated by a whitelist regex allowing only digits
  // and +-*/(). -- these are the exact injection attempts that whitelist
  // exists to block, and they must all fail closed rather than execute.
  describe("injection safety (values must never reach Function() unfiltered)", () => {
    const attempts = [
      "alert(1)",
      "window.alert(1)",
      "1;alert(1)",
      "require('fs')",
      "process.exit()",
      "`${alert(1)}`",
      "1//comment",
      "1/*comment*/",
      "constructor.constructor('alert(1)')()",
    ];
    it.each(attempts)("rejects %s as an invalid expression, not code", (attempt) => {
      const result = parseDimensionInput(attempt);
      expect(result.error).toBe("Invalid expression");
      expect(result.value).toBeNull();
    });
  });
});

describe("getInitialDimensionValue", () => {
  it("prefers a non-empty expr over the numeric value", () => {
    expect(getInitialDimensionValue("2+3", 5)).toBe("2+3");
  });

  it("falls back to the numeric value when expr is null/undefined/blank", () => {
    expect(getInitialDimensionValue(null, 5)).toBe(5);
    expect(getInitialDimensionValue(undefined, 5)).toBe(5);
    expect(getInitialDimensionValue("   ", 5)).toBe(5);
  });

  it("returns an empty string when both expr and value are absent", () => {
    expect(getInitialDimensionValue(null, null)).toBe("");
    expect(getInitialDimensionValue(undefined, undefined)).toBe("");
  });

  it("returns 0 as a real value, not treated as absent", () => {
    expect(getInitialDimensionValue(null, 0)).toBe(0);
  });
});
