import type { EmailMessage } from "@avis/adapters";

/** Transactional e-mails (French). Kept as plain functions so they're easy to test and translate. */

function layout(title: string, body: string, cta?: { label: string; url: string }): string {
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#f5f6fa;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1f2433">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
  <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;padding:32px">
  <tr><td style="font-size:18px;font-weight:600;padding-bottom:16px">${title}</td></tr>
  <tr><td style="font-size:15px;line-height:1.6">${body}</td></tr>
  ${cta ? `<tr><td style="padding-top:24px"><a href="${cta.url}" style="background:#3446c8;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">${cta.label}</a></td></tr>` : ""}
  <tr><td style="padding-top:32px;font-size:12px;color:#7a7f8f">AvisBoost · Cet e-mail vous a été envoyé suite à une action sur votre compte.</td></tr>
  </table></td></tr></table></body></html>`;
}

export function magicLinkEmail(to: string, url: string): EmailMessage {
  return {
    to,
    subject: "Votre lien de connexion AvisBoost",
    text: `Bonjour,\n\nCliquez sur ce lien pour vous connecter à AvisBoost (valable 15 minutes) :\n${url}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.`,
    html: layout(
      "Connexion à AvisBoost",
      "Cliquez sur le bouton ci-dessous pour vous connecter. Ce lien est valable 15 minutes et ne peut être utilisé qu'une fois.<br><br>Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet e-mail.",
      { label: "Me connecter", url },
    ),
    tags: ["auth"],
  };
}

export function resetPasswordEmail(to: string, name: string, url: string): EmailMessage {
  return {
    to,
    subject: "Réinitialisation de votre mot de passe AvisBoost",
    text: `Bonjour ${name},\n\nPour choisir un nouveau mot de passe, ouvrez ce lien :\n${url}\n\nSi vous n'avez rien demandé, ignorez cet e-mail.`,
    html: layout("Nouveau mot de passe", `Bonjour ${name},<br><br>Pour choisir un nouveau mot de passe, cliquez sur le bouton ci-dessous.`, {
      label: "Choisir un mot de passe",
      url,
    }),
    tags: ["auth"],
  };
}
