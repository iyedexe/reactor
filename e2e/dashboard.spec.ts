import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email: string) {
  await page.goto("/connexion");
  await page.fill("#email", email);
  await page.fill("#password", "demo-avisboost");
  await page.click("button[type=submit]");
  await expect(page).toHaveURL(/\/tableau-de-bord/);
}

test("dashboard shows KPIs, impact since joining and charts", async ({ page }) => {
  await signIn(page, "margaux@ateliermargaux.demo");
  await expect(page.getByText("Note Google")).toBeVisible();
  await expect(page.getByText("Votre progression depuis votre arrivée")).toBeVisible();
  await expect(page.getByRole("img", { name: "Nouveaux avis" })).toBeVisible();
  await expect(page.getByText("Vous et vos concurrents")).toBeVisible();
  await page.getByRole("radio", { name: "12 mois" }).click();
  await expect(page).toHaveURL(/periode=12m/);
});

test("location switcher filters the dashboard", async ({ page }) => {
  await signIn(page, "sophie@lepetitzinc.demo");
  await page.getByLabel("Établissement").selectOption({ label: "Le Petit Zinc – Brotteaux" });
  await expect(page).toHaveURL(/lieu=/);
  await expect(page.getByText("Les établissements les plus proches")).toBeVisible();
});

test("reviews can be filtered", async ({ page }) => {
  await signIn(page, "patrick@garagedumont.demo");
  await page.goto("/avis?note=5");
  const items = page.locator("main li");
  await expect(items.first()).toBeVisible();
  expect(await items.locator('[aria-label="5/5"]').count()).toBe(await items.count());
});

test("private feedback can be marked as read", async ({ page }) => {
  await signIn(page, "sophie@lepetitzinc.demo");
  await page.goto("/messages-prives?statut=nouveaux");
  const first = page.locator("main li").first();
  await expect(first).toBeVisible();
  const before = await page.locator("main li").count();
  await first.getByRole("button", { name: "Marquer comme lu" }).click();
  await expect(page.locator("main li")).toHaveCount(before - 1);
});
