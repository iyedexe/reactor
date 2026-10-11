import type { EmailMessage, SmsMessage } from "@avis/adapters";
import { renderTemplate } from "@avis/core/templates";

/**
 * Builds the actual e-mail / SMS from a template. Every message carries an opt-out:
 *  - e-mail: footer link + List-Unsubscribe / List-Unsubscribe-Post (one-click, RFC 8058) headers;
 *  - SMS: "STOP : <link>" line.
 */

export interface RenderContext {
  firstName: string;
  businessName: string;
  reviewLink: string; // {links}/m/{token}
  unsubscribeLink: string; // {app}/u/{token}
  oneClickUnsubscribeUrl: string; // {app}/api/unsubscribe/{token}
}

function vars(c: RenderContext) {
  return { prenom: c.firstName, entreprise: c.businessName, lien_avis: c.reviewLink };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

export function renderSms(body: string, c: RenderContext, to: string): SmsMessage {
  return { to, body: `${renderTemplate(body, vars(c)).trim()}\nSTOP : ${c.unsubscribeLink}` };
}

export function renderEmail(subject: string, body: string, c: RenderContext, to: string): EmailMessage {
  const text = renderTemplate(body, vars(c)).trim();
  const footer = `Vous recevez ce message suite à votre visite chez ${c.businessName}. Pour ne plus recevoir de messages : ${c.unsubscribeLink}`;
  // HTML: paragraphs from the text; the review link becomes a button.
  const html = text
    .split(/\n{2,}/)
    .map((para) => {
      if (para.trim() === c.reviewLink) {
        return `<p style="margin:24px 0"><a href="${esc(c.reviewLink)}" style="background:#3446c8;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">Donner mon avis</a></p>`;
      }
      return `<p style="margin:0 0 14px">${esc(para).replace(esc(c.reviewLink), `<a href="${esc(c.reviewLink)}">${esc(c.reviewLink)}</a>`).replace(/\n/g, "<br>")}</p>`;
    })
    .join("");
  return {
    to,
    subject: renderTemplate(subject, vars(c)).trim(),
    text: `${text}\n\n—\n${footer}`,
    html: `<!doctype html><html lang="fr"><body style="margin:0;background:#f5f6fa;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1f2433"><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 14px"><table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;padding:28px;font-size:15px;line-height:1.6"><tr><td>${html}</td></tr><tr><td style="padding-top:20px;font-size:12px;color:#7a7f8f">${esc(footer).replace(esc(c.unsubscribeLink), `<a href="${esc(c.unsubscribeLink)}" style="color:#7a7f8f">${esc("se désinscrire")}</a>`)}</td></tr></table></td></tr></table></body></html>`,
    headers: {
      "List-Unsubscribe": `<${c.oneClickUnsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    tags: ["review-request"],
  };
}
