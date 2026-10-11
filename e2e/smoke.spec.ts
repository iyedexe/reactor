import { expect, test, type Page } from "@playwright/test";

/** Requires the demo seed (pnpm db:seed). */
const PASSWORD = "demo-avisboost";

async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto("/connexion");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click("button[type=submit]");
}

test("unauthenticated visitors are sent to the login page", async ({ page }) => {
  await page.goto("/tableau-de-bord");
  await expect(page).toHaveURL(/\/connexion/);
});

test("wrong password is rejected", async ({ page }) => {
  await signIn(page, "sophie@lepetitzinc.demo", "wrong-password");
  await expect(page.getByText("E-mail ou mot de passe incorrect.")).toBeVisible();
  await expect(page).toHaveURL(/\/connexion/);
});

test("an owner sees only their own business", async ({ page }) => {
  await signIn(page, "sophie@lepetitzinc.demo");
  await expect(page).toHaveURL(/\/tableau-de-bord/);
  await expect(page.locator("h1")).toHaveText("Bonjour Sophie");
  const options = page.getByLabel("Établissement").locator("option");
  await expect(options).toHaveText(["Tous les établissements", "Le Petit Zinc – Brotteaux", "Le Petit Zinc – Presqu'île"]);
  await expect(page.getByText("Atelier Margaux")).toHaveCount(0);
  await expect(page.getByText("Garage Dumont")).toHaveCount(0);
});

test("a client cannot open the admin panel", async ({ page }) => {
  await signIn(page, "margaux@ateliermargaux.demo");
  await expect(page).toHaveURL(/\/tableau-de-bord/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/tableau-de-bord/);
});

test("platform admin lists clients and can impersonate one", async ({ page }) => {
  await signIn(page, "admin@avisboost.local", "admin-avisboost");
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.locator("tbody tr")).toHaveCount(3);
  await page.locator("tbody tr").filter({ hasText: "Garage Dumont" }).getByRole("button").click();
  await expect(page).toHaveURL(/\/tableau-de-bord/);
  await expect(page.locator("h1")).toHaveText("Bonjour Patrick");
  await expect(page.getByText(/connecté en tant que Patrick Dumont/)).toBeVisible();
  await page.getByText("Revenir à l'administration").click();
  await expect(page).toHaveURL(/\/admin/);
});
