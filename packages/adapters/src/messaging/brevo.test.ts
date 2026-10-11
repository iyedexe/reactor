import { afterEach, describe, expect, it, vi } from "vitest";
import { BrevoMessagingAdapter } from "./brevo.ts";
import { CompositeMessagingAdapter, parseFrom, TwilioSmsAdapter } from "./twilio.ts";

afterEach(() => vi.unstubAllGlobals());

function stubFetch(response: unknown, status = 201) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(response), { status });
  });
  return calls;
}

describe("Brevo adapter", () => {
  const brevo = new BrevoMessagingAdapter({ apiKey: "k", from: { name: "AvisBoost", email: "no-reply@x.fr" }, smsSender: "AVISBOOST" });

  it("sends e-mail with headers and returns the messageId", async () => {
    const calls = stubFetch({ messageId: "<abc@smtp-relay>" });
    const r = await brevo.sendEmail({ to: "a@x.fr", subject: "S", html: "<p>h</p>", text: "t", headers: { "List-Unsubscribe": "<u>" } });
    expect(r).toEqual({ provider: "brevo", providerMessageId: "<abc@smtp-relay>" });
    expect(calls[0]!.url).toBe("https://api.brevo.com/v3/smtp/email");
    expect((calls[0]!.init.headers as Record<string, string>)["api-key"]).toBe("k");
    expect(JSON.parse(calls[0]!.init.body as string)).toMatchObject({ sender: { email: "no-reply@x.fr" }, to: [{ email: "a@x.fr" }], headers: { "List-Unsubscribe": "<u>" } });
  });

  it("sends SMS through the current endpoint", async () => {
    const calls = stubFetch({ messageId: 123 });
    const r = await brevo.sendSms({ to: "+33612345678", body: "Bonjour" });
    expect(r.providerMessageId).toBe("123");
    expect(calls[0]!.url).toBe("https://api.brevo.com/v3/transactionalSMS/send");
    expect(JSON.parse(calls[0]!.init.body as string)).toMatchObject({ sender: "AVISBOOST", recipient: "33612345678", content: "Bonjour", type: "transactional" });
  });

  it("surfaces API errors", async () => {
    stubFetch({ code: "unauthorized" }, 401);
    await expect(brevo.sendSms({ to: "+33612345678", body: "x" })).rejects.toThrow(/401/);
  });
});

describe("routing", () => {
  it("can send e-mail with one provider and SMS with another", async () => {
    stubFetch({ sid: "SM1" });
    const email = new BrevoMessagingAdapter({ apiKey: "k", from: parseFrom("Le Barbier <hello@x.fr>") });
    const m = new CompositeMessagingAdapter(email, new TwilioSmsAdapter({ accountSid: "AC1", authToken: "t", from: "+33700000000" }));
    expect(m.provider).toBe("brevo+twilio");
    expect((await m.sendSms({ to: "+33612345678", body: "x" })).providerMessageId).toBe("SM1");
    expect(parseFrom("Le Barbier <hello@x.fr>")).toEqual({ name: "Le Barbier", email: "hello@x.fr" });
  });
});
