import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function loginAsOwner(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Username").fill("owner");
  await page.getByLabel("Password").fill("change-me-now");
  await page.getByRole("button", { name: "Enter Party Chat" }).click();
  await expect(page.getByRole("heading", { name: "No active party" })).toBeVisible();
}

test("owner can create a party, move around the app, and mint an invite", async ({ page }) => {
  const partyName = `Smoke Test ${Date.now()}`;
  const voiceCard = page.locator(".voice-card");
  const sessionCard = page.locator(".party-session-card");

  await loginAsOwner(page);

  await page.getByPlaceholder("Halo 3 throwback").fill(partyName);
  await page.getByRole("button", { name: "Create" }).click();

  await expect(page).toHaveURL(/\/party\/.+$/);
  await expect(page.getByRole("heading", { name: partyName })).toBeVisible();

  await voiceCard.getByRole("button", { name: "Join Party + Voice" }).click();
  await expect(voiceCard.getByRole("button", { name: "Leave Voice" })).toBeVisible({ timeout: 20_000 });

  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Account handle" })).toBeVisible();
  await expect(sessionCard.getByText(partyName)).toBeVisible();
  await expect(sessionCard.getByRole("button", { name: "Leave Voice" })).toBeVisible();

  const gamerpicOption = page.locator(".gamerpic-option").first();
  await expect(gamerpicOption).toBeVisible();
  await gamerpicOption.click();
  await page.getByRole("button", { name: "Save Gamerpic" }).click();
  await expect(page.getByText("Gamerpic updated.")).toBeVisible();
  await expect(page.locator(".status-card").first().locator(".avatar-image")).toHaveAttribute(
    "src",
    /\/gamerpics\/xbox-360-dashboard\/.+\.png$/,
  );

  await page.getByRole("button", { name: "Create Invite" }).click();
  await expect(page.getByText(/^XPC-[A-Z0-9]{5}-[A-Z0-9]{5}$/)).toBeVisible();

  await page.getByRole("link", { name: "Parties" }).click();
  await expect(page.getByRole("heading", { name: `You are in ${partyName}` })).toBeVisible();
  await expect(page.locator(".roster-row").first().locator(".avatar-image")).toHaveAttribute(
    "src",
    /\/gamerpics\/xbox-360-dashboard\/.+\.png$/,
  );

  await page.getByRole("button", { name: "Sign Out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: "Enter Party Chat" })).toBeVisible();
});
