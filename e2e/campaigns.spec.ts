import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email = "margaux@ateliermargaux.demo") {
  await page.goto("/connexion");
  await page.fill("#email", email);
  await page.fill("#password", "demo-avisboost");
  await page.click("button[type=submit]");
  await expect(page).toHaveURL(/\/tableau-de-bord/);
}

test("adding a customer with consent schedules a review request", async ({ page }) => {
  await signIn(page);
  await page.goto("/contacts");
  const phone = `07${String(Date.now()).slice(-8)}`;
  await page.fill("#c-first", "Zoé");
  await page.fill("#c-last", "Testeuse");
  await page.fill("#c-phone", phone);
  await page.getByLabel("Accepte de recevoir un SMS").check();
  await page.getByRole("button", { name: "Ajouter et programmer la demande" }).click();
  await expect(page.getByText("Client ajouté, demande programmée.")).toBeVisible();
  await page.goto(`/contacts?q=Testeuse`);
  await expect(page.locator("tbody tr").first()).toContainText(/Programmée le/);
});

test("without consent nothing is scheduled", async ({ page }) => {
  await signIn(page);
  await page.goto("/contacts");
  await page.fill("#c-first", "Sans");
  await page.fill("#c-phone", `07${String(Date.now() + 1).slice(-8)}`);
  await page.getByRole("button", { name: "Ajouter et programmer la demande" }).click();
  await expect(page.getByText(/aucune demande \(no_consent\)/)).toBeVisible();
});

test("templates offering an incentive are refused", async ({ page }) => {
  await signIn(page);
  await page.goto("/campagnes");
  const editor = page.locator("textarea").first();
  await editor.fill("Laissez un avis et recevez -10% : {{lien_avis}}");
  await expect(page.getByText(/Incitation interdite/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Enregistrer" }).nth(1)).toBeDisabled();
});

test("a booking-tool connection accepts visits over HTTP", async ({ page, request }) => {
  await signIn(page);
  await page.goto("/campagnes");
  await page.getByPlaceholder("Nom (ex. Planity)").fill("Test e2e");
  await page.getByRole("button", { name: "Créer une connexion" }).click();
  const box = page.getByRole("status").filter({ hasText: "Bearer" });
  await expect(box).toBeVisible();
  const token = (await box.locator("code").first().textContent())!.replace("Authorization: Bearer ", "").trim();
  const url = (await box.locator("code").nth(1).textContent())!.replace("POST ", "").trim();
  const path = new URL(url).pathname;
  expect((await request.post(path, { data: { firstName: "Hors", phone: "0611111111" }, headers: { authorization: "Bearer wrong" } })).status()).toBe(401);
  const ok = await request.post(path, { data: { firstName: "Webhook", phone: `06${String(Date.now()).slice(-8)}`, consentSms: true }, headers: { authorization: `Bearer ${token}` } });
  expect(ok.status()).toBe(202);
  expect((await ok.json()).schedule).toBe("scheduled");
});
