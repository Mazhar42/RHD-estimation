import { test, expect } from "@playwright/test";
import { login } from "./helpers.js";

// Relies on backend/scripts/seed_e2e.py: item E2E.ITEM.01 exists in rate
// years 2024 (Dhaka 90) and 2025 (Dhaka 100), plus special item SP-E2E-1.

const itemRow = (page, year) =>
  page.locator("tbody tr").filter({ hasText: "E2E.ITEM.01" }).filter({ hasText: String(year) });

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("old /products links land on the Item Master", async ({ page }) => {
  await page.goto("/products");
  await expect(page).toHaveURL(/\/item-master$/);
  await expect(page.getByRole("heading", { name: "Item Master" })).toBeVisible();
});

test("shows one row per rate year and filters server-side", async ({ page }) => {
  await page.goto("/item-master");
  await expect(itemRow(page, 2024)).toBeVisible();
  await expect(itemRow(page, 2025)).toBeVisible();

  await page.getByLabel("Filter by code").fill("NO-SUCH-CODE");
  await expect(page.getByText("No items match these filters.")).toBeVisible();
  await page.getByRole("button", { name: "Clear all" }).click();
  await expect(itemRow(page, 2025)).toBeVisible();
});

test("editing one rate year leaves the other year alone", async ({ page }) => {
  await page.goto("/item-master");
  await itemRow(page, 2024).getByRole("checkbox").check();
  await expect(itemRow(page, 2025).getByRole("checkbox")).not.toBeChecked();
  await page.getByRole("button", { name: "Edit" }).click();

  const dialog = page.getByRole("dialog", { name: "Edit Item" });
  const dhaka = dialog.getByRole("spinbutton").first();
  const newRate = String(90 + Math.floor(Math.random() * 9) + 1);
  await dhaka.fill(newRate);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  await expect(itemRow(page, 2024)).toContainText(`${newRate}.00`);
  await expect(itemRow(page, 2025)).toContainText("100.00");
});

test("special items tab lists approved special items", async ({ page }) => {
  await page.goto("/item-master");
  await page.getByRole("tab", { name: "Special Items" }).click();
  const row = page.locator("tbody tr").filter({ hasText: "SP-E2E-1" });
  await expect(row).toBeVisible();
  await expect(row).toContainText("500.00");
});
