export const parseDimensionInput = (raw) => {
  const text = String(raw ?? "").trim();
  if (!text) return { value: null, expr: null, error: null };

  // Normalize unicode fractions and common math symbols
  let cleaned = text.replace(/\s+/g, "");

  // Replace common multiplication symbols
  cleaned = cleaned.replace(/[xX×]/g, "*");

  cleaned = cleaned
    .replace(/½/g, "(1/2)")
    .replace(/⅓/g, "(1/3)")
    .replace(/⅔/g, "(2/3)")
    .replace(/¼/g, "(1/4)")
    .replace(/¾/g, "(3/4)")
    .replace(/⅕/g, "(1/5)")
    .replace(/⅖/g, "(2/5)")
    .replace(/⅗/g, "(3/5)")
    .replace(/⅘/g, "(4/5)")
    .replace(/⅙/g, "(1/6)")
    .replace(/⅚/g, "(5/6)")
    .replace(/⅛/g, "(1/8)")
    .replace(/⅜/g, "(3/8)")
    .replace(/⅝/g, "(5/8)")
    .replace(/⅞/g, "(7/8)");

  // Insert explicit multiplication for implicit cases:
  // 1. digit/parenthesis followed by parenthesis: 2(3) -> 2*(3), (2)(3) -> (2)*(3)
  // 2. parenthesis followed by digit: (2)3 -> (2)*3
  // Repeatedly apply to handle nested/chained cases correctly
  cleaned = cleaned.replace(/(\d|\))(?=\()/g, "$1*");
  cleaned = cleaned.replace(/(\))(?=\d)/g, "$1*");

  const hasOperator = /[+\-*/()]/.test(cleaned);
  const isNumber = /^-?(?:\d+(\.\d+)?|\.\d+)$/.test(cleaned);

  if (isNumber)
    return {
      value: Number(cleaned),
      expr: hasOperator ? text : null,
      error: null,
    };

  // Allow numbers, standard operators, and parentheses
  if (!/^[0-9+\-*/().]+$/.test(cleaned) || cleaned.includes("..")) {
    return { value: null, expr: null, error: "Invalid expression" };
  }

  try {
    const result = Function(`"use strict"; return (${cleaned})`)();
    if (!Number.isFinite(result))
      return { value: null, expr: null, error: "Invalid expression" };
    // Return original text as expression to preserve user formatting, unless it was just a number
    return { value: Number(result), expr: text, error: null };
  } catch {
    return { value: null, expr: null, error: "Invalid expression" };
  }
};

export const getInitialDimensionValue = (expr, value) => {
  if (expr !== null && expr !== undefined && String(expr).trim() !== "")
    return expr;
  if (value === null || value === undefined) return "";
  return value;
};
