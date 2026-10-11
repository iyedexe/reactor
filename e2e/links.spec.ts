import { expect, test } from "@playwright/test";

const LINKS = process.env.E2E_LINKS_URL ?? "http://localhost:3002";

test("a stand assigned in the admin opens the business landing page with two equal choices", async ({ page, browser }) => {
  await page.goto("/connexion");
  await page.fill("#email", "admin@avisboost.local");
  await page.fill("#password", "admin-avisboost");
  await page.click("button[type=submit]");
  await expect(page).toHaveURL(/\/admin/);
  await page.goto("/admin/supports?statut=actifs");
  const code = (await page.locator("tbody tr").first().locator(".font-mono").textContent())!.trim();

  const mobile = await browser.newContext({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 Safari/604.1", viewport: { width: 390, height: 844 } });
  const p = await mobile.newPage();
  await p.goto(`${LINKS}/r/${code}?s=n`);
  const choices = p.locator("a.choice");
  await expect(choices).toHaveCount(2);
  await expect(choices.nth(0)).toHaveText(/Laisser un avis Google/);
  await expect(choices.nth(1)).toHaveText(/Message privé au gérant/);
  const [a, b] = await choices.evaluateAll((els) => els.map((e) => {
    const cs = getComputedStyle(e);
    return `${cs.borderColor}|${cs.borderWidth}|${cs.backgroundColor}|${cs.fontSize}|${cs.fontWeight}|${e.getBoundingClientRect().height}|${e.getBoundingClientRect().width}`;
  }));
  expect(a).toBe(b);

  await choices.nth(1).click();
  await p.fill("#message", "Test e2e : très bon accueil");
  await p.click("button[type=submit]");
  await expect(p.getByText("Votre message a bien été transmis")).toBeVisible();
  await mobile.close();
});
