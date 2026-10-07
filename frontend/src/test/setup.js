import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// @testing-library/react's auto-cleanup relies on a global `afterEach`,
// which only exists with vitest's `globals: true`. This project's test
// files import describe/it/expect/vi explicitly instead (matching the
// rest of the codebase's explicit-import style), so register cleanup by
// hand -- otherwise every render() in a file accumulates in the DOM and
// later tests see duplicate elements.
afterEach(() => {
  cleanup();
});
