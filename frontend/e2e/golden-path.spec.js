import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { PLAIN_USER, addSeededItem, createWork, login } from "./helpers.js";

// The estimator's main path, end to end, plus the ownership boundary.
// Rates come from backend/scripts/seed_e2e.py: E2E.ITEM.01 is 100 per sqm.
test.describe.configure({ mode: "serial" });

let estimationUrl;

const tabTotal = (page) => page.getByTestId("tab-total");
const lineRows = (page) => page.locator("tr[data-line-id]");

test("golden path: create, add, split into parts, export, reload", async ({ page }) => {
  await login(page);
  await createWork(page);
  estimationUrl = page.url();
  await expect(page.getByText(/^No items in .* yet\.$/)).toBeVisible();

  // 2 × 3 m × 4 m = 24 sqm × 100 = 2,400
  await addSeededItem(page, { nos: 2, length: 3, width: 4 });
  await expect(lineRows(page)).toHaveCount(1);
  await expect(lineRows(page).first().locator("td").last()).toHaveText("2,400.00");
  await expect(tabTotal(page)).toHaveText("2,400.00");

  // Split the line into two named parts and enter numbers for each.
  await lineRows(page).first().getByRole("checkbox").check();
  await page.getByRole("button", { name: "Split into parts" }).click();
  await page.getByRole("button", { name: /^Other/ }).click();
  await page.getByPlaceholder("e.g. Toilet Block").fill("Part A");
  await page.getByRole("button", { name: "+ Add another" }).click();
  await page.getByPlaceholder("e.g. Guard Room").fill("Part B");
  await page.getByRole("button", { name: "Create & Enter Numbers" }).click();

  // Part A: 1 × 2 × 5 = 10 sqm; Part B: 1 × 1 × 4 = 4 sqm -> 1,400 in total
  await expect(page.getByText("Enter part numbers")).toBeVisible();
  await page.getByLabel("No. of units").fill("1");
  await page.getByLabel("Length").fill("2");
  await page.getByLabel("Width").fill("5");
  await page.getByRole("button", { name: "Save & Next" }).click();
  // Part A's save must land before Part B's numbers go in.
  await expect(page.getByText("2 of 2", { exact: true })).toBeVisible();
  await page.getByLabel("No. of units").fill("1");
  await page.getByLabel("Length").fill("1");
  await page.getByLabel("Width").fill("4");
  await page.getByRole("button", { name: "Save & Finish" }).click();

  await expect(lineRows(page)).toHaveCount(3);
  await expect(tabTotal(page)).toHaveText("1,400.00");

  for (const [label, ext] of [
    ["Excel (.xlsx)", "xlsx"],
    ["PDF", "pdf"],
    ["CSV", "csv"],
  ]) {
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export" }).click();
    await page.getByRole("menuitem", { name: label }).click();
    const file = await download;
    expect(file.suggestedFilename().endsWith(`.${ext}`)).toBe(true);
    const bytes = await readFile(await file.path());
    expect(bytes.length).toBeGreaterThan(200);
    if (ext === "pdf") expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  }

  // Everything above was saved server-side as it happened.
  await page.reload();
  await expect(lineRows(page)).toHaveCount(3);
  await expect(tabTotal(page)).toHaveText("1,400.00");
  await page.getByRole("tab", { name: "Summary" }).click();
  await expect(page.getByTestId("grand-total")).toHaveText("1,400.00");
});

test("inline cell edit accepts an equation, and recovers after a bad one", async ({ page }) => {
  expect(estimationUrl, "depends on the golden path test").toBeTruthy();
  await login(page);
  await page.goto(estimationUrl);
  // Columns: select, code, description, No., Length, Width, Quantity, Rate, Unit, Amount
  const partA = lineRows(page).nth(1);
  const widthCell = partA.locator("td").nth(5);

  await widthCell.dblclick();
  await page.keyboard.type("oops(");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: /invalid/i })).toBeVisible();

  const editor = widthCell.locator("input");
  await editor.fill("2*3");
  await page.keyboard.press("Enter");
  await expect(editor).toHaveCount(0);

  // Part A: 1 × 2 × 6 = 12 sqm (1,200) + Part B 400 = 1,600
  await expect(partA.locator("td").last()).toHaveText("1,200.00");
  await expect(tabTotal(page)).toHaveText("1,600.00");
});

test("on a phone the estimation is read-only", async ({ page }) => {
  expect(estimationUrl, "depends on the golden path test").toBeTruthy();
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto(estimationUrl);
  await expect(page.getByText("Viewing only.")).toBeVisible();
  await expect(lineRows(page)).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Add Item" })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("phone.png") });
});

test("another user can view but not edit someone else's estimation", async ({ page, context }) => {
  expect(estimationUrl, "depends on the golden path test").toBeTruthy();
  await login(page, PLAIN_USER);
  await page.goto(estimationUrl);
  await expect(lineRows(page)).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Add Item" })).toHaveCount(0);
  await expect(lineRows(page).first().getByRole("checkbox")).toHaveCount(0);

  // And the server refuses even if the UI were bypassed.
  const lineId = await lineRows(page).first().getAttribute("data-line-id");
  const csrf = (await context.cookies()).find((c) => c.name === "csrf_token")?.value;
  const res = await page.request.put(`/api/estimations/lines/${lineId}`, {
    headers: { "X-CSRF-Token": csrf ?? "" },
    data: { no_of_units: 99 },
  });
  expect(res.status()).toBe(403);
});
