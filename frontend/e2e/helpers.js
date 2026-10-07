import { expect } from "@playwright/test";
import { E2E_ADMIN_USERNAME, E2E_ADMIN_PASSWORD } from "./global-setup.js";

// Seeded by backend/scripts/seed_e2e.py (no admin rights).
export const PLAIN_USER = { username: "e2e_user", password: "e2e-user-password-123" };

export async function login(page, { username = E2E_ADMIN_USERNAME, password = E2E_ADMIN_PASSWORD } = {}) {
  await page.goto("/login");
  await page.fill("#username", username);
  await page.fill("#password", password);
  await page.click('button:has-text("Log in")');
  await expect(page).toHaveURL(/\/projects/, { timeout: 10000 });
}

export async function createWork(page, projectName = `E2E Test Project ${Date.now()}`) {
  await page.click('button:has-text("File")');
  await page.click('[role="menuitem"]:has-text("New Work")');
  await page.getByLabel("Project name").fill(projectName);
  await expect(page.getByLabel("Work ID")).toHaveValue(/^RHD-\d{4}-E2E-TEST-PROJECT/);
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Create Work" }).click();
  await expect(page).toHaveURL(/\/estimations\/\d+/, { timeout: 10000 });
}

// Adds the seeded 2025 E2E.ITEM.01 (sqm, rate 100) with the given sizes.
export async function addSeededItem(page, { nos, length, width }) {
  await page.getByRole("button", { name: "Add Item" }).first().click();
  await page.locator("select").filter({ hasText: "RHD" }).selectOption({ label: "RHD" });
  await page.getByLabel("Division (optional filter)").selectOption({ label: "E2E Division" });
  await page.getByRole("combobox", { name: "Item" }).fill("e2e test item");
  await page.getByRole("option").filter({ hasText: "2025" }).filter({ hasText: "E2E.ITEM.01" }).click();
  await page.getByPlaceholder("Nos").fill(String(nos));
  await page.getByPlaceholder("Length").fill(String(length));
  await page.getByPlaceholder("Width").fill(String(width));
  await page.getByLabel("Keep form open after Add").uncheck();
  await page.click('button[type="submit"]:has-text("Add Line")');
}
