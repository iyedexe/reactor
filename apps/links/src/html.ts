/**
 * Server-rendered pages for the public links. No JavaScript, no cookies, no external assets: they load
 * instantly on a phone in a shop. All interpolated values are escaped.
 */

export function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const SAFE_COLOR = /^#[0-9a-fA-F]{6}$/;

function layout(title: string, body: string, brand = "#2563eb"): string {
  const color = SAFE_COLOR.test(brand) ? brand : "#2563eb";
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<style>
:root{--brand:${color};--ink:#1f2433;--muted:#6b7080;--bg:#f6f7fb;--card:#fff;--line:#e3e5ec}
@media (prefers-color-scheme:dark){:root{--ink:#eef0f6;--muted:#a5a9b8;--bg:#14161d;--card:#1d2029;--line:#2d313d}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:20px}
main{width:100%;max-width:420px;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:28px 22px;text-align:center}
.logo{width:64px;height:64px;border-radius:50%;margin:0 auto 14px;display:flex;align-items:center;justify-content:center;background:var(--brand);color:#fff;font-weight:700;font-size:24px}
h1{font-size:22px;margin:0 0 6px}
p{color:var(--muted);margin:0 0 22px}
.choices{display:grid;gap:12px}
.choice{display:flex;align-items:center;justify-content:center;gap:10px;min-height:60px;padding:12px 16px;border-radius:12px;border:2px solid var(--brand);background:var(--card);color:var(--ink);font-weight:600;font-size:16px;text-decoration:none}
.choice:active{transform:scale(.99)}
.choice svg{width:22px;height:22px;flex:none}
form{text-align:left;display:grid;gap:12px}
label{font-size:14px;font-weight:600}
textarea,input[type=text],input[type=email],input[type=tel]{width:100%;padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--ink);font:inherit}
textarea{min-height:130px;resize:vertical}
.check{display:flex;gap:8px;align-items:flex-start;font-weight:400}
button{min-height:52px;border:0;border-radius:12px;background:var(--brand);color:#fff;font:600 17px system-ui,sans-serif;cursor:pointer}
.hp{position:absolute;left:-9999px}
.small{font-size:12px;color:var(--muted);margin-top:18px}
.link{color:var(--brand);font-weight:600}
.err{color:#c62828;font-size:14px}
</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

const STAR = `<svg viewBox="0 0 24 24" fill="#fbbc04" aria-hidden="true"><path d="M12 2l3.1 6.6 7.2.9-5.3 4.9 1.4 7.1L12 18l-6.4 3.5 1.4-7.1L1.7 9.5l7.2-.9z"/></svg>`;
const MAIL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/></svg>`;

function initials(name: string): string {
  return esc(
    name
      .replace(/[^\p{L}\p{N} ]/gu, " ")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join(""),
  );
}

export interface Brand {
  name: string;
  brandColor: string;
}

/**
 * The landing page. Both options always appear, with identical styling and size, whatever the customer's
 * experience: AvisBoost never gates or filters the Google review option.
 */
export function landingPage(b: Brand, links: { google: string; message: string }): string {
  return layout(
    b.name,
    `<div class="logo">${initials(b.name)}</div>
<h1>${esc(b.name)}</h1>
<p>Merci pour votre visite ! Votre retour nous aide beaucoup.</p>
<div class="choices">
<a class="choice" href="${esc(links.google)}" rel="nofollow">${STAR}Laisser un avis Google</a>
<a class="choice" href="${esc(links.message)}" rel="nofollow">${MAIL}Message privé au gérant</a>
</div>
<div class="small">Aucune donnée personnelle n'est collectée sur cette page.</div>`,
    b.brandColor,
  );
}

export function feedbackPage(b: Brand, action: string, googleLink: string, error?: string, values: Record<string, string> = {}): string {
  return layout(
    `Message privé – ${b.name}`,
    `<h1>Message privé</h1>
<p>Votre message est envoyé directement à ${esc(b.name)}. Il n'est pas publié.</p>
<form method="post" action="${esc(action)}">
${error ? `<div class="err" role="alert">${esc(error)}</div>` : ""}
<label for="message">Votre message</label>
<textarea id="message" name="message" required minlength="3" maxlength="2000">${esc(values.message)}</textarea>
<label for="name">Votre nom (facultatif)</label>
<input id="name" name="name" type="text" maxlength="100" autocomplete="name" value="${esc(values.name)}">
<label for="email">E-mail (facultatif)</label>
<input id="email" name="email" type="email" maxlength="200" autocomplete="email" value="${esc(values.email)}">
<label for="phone">Téléphone (facultatif)</label>
<input id="phone" name="phone" type="tel" maxlength="30" autocomplete="tel" value="${esc(values.phone)}">
<label class="check"><input type="checkbox" name="wantsReply" value="1"${values.wantsReply ? " checked" : ""}> Je souhaite être recontacté(e)</label>
<input class="hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
<button type="submit">Envoyer</button>
</form>
<div class="small">Vos coordonnées servent uniquement à ce que ${esc(b.name)} puisse vous répondre. <a class="link" href="${esc(googleLink)}" rel="nofollow">Laisser plutôt un avis Google</a></div>`,
    b.brandColor,
  );
}

export function thanksPage(b: Brand, googleLink: string): string {
  return layout(
    `Merci – ${b.name}`,
    `<div class="logo">✓</div>
<h1>Merci !</h1>
<p>Votre message a bien été transmis à ${esc(b.name)}.</p>
<div class="choices"><a class="choice" href="${esc(googleLink)}" rel="nofollow">${STAR}Laisser aussi un avis Google</a></div>`,
    b.brandColor,
  );
}

export function inactivePage(): string {
  return layout("Lien inactif", `<h1>Ce lien n'est plus actif</h1><p>Ce support n'est plus utilisé par l'établissement.</p>`);
}

export function notFoundPage(): string {
  return layout("Lien introuvable", `<h1>Lien introuvable</h1><p>Vérifiez l'adresse ou scannez à nouveau le support.</p>`);
}

export function errorPage(): string {
  return layout("Service indisponible", `<h1>Un instant…</h1><p>Le service est momentanément indisponible. Réessayez dans quelques secondes.</p>`);
}
