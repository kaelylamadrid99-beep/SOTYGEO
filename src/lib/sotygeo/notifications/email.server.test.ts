import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start/server", () => ({ getRequest: vi.fn() }));

const message = { to: "owner@example.test", subject: "Invitación", html: "<p>Invitación</p>", text: "Invitación" };

describe("Resend invitation delivery", () => {
  beforeEach(() => {
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "test-connection");
    vi.stubEnv("LOVABLE_API_KEY", "test-gateway");
    vi.stubEnv("EMAIL_FROM", "");
    vi.stubEnv("NODE_ENV", "production");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  it("sends invitations through the linked gateway with the owner-only test sender", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "email-test" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { sendEmail } = await import("./email.server");
    expect(await sendEmail(message)).toEqual({ ok: true, providerMessageId: "email-test" });
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe("https://connector-gateway.lovable.dev/resend/emails");
    expect(request.headers).toEqual({ Authorization: "Bearer test-gateway", "X-Connection-Api-Key": "test-connection", "Content-Type": "application/json" });
    expect(JSON.parse(request.body)).toMatchObject({ from: "SOTYGEO <onboarding@resend.dev>", to: [message.to] });
  });
  it("reports provider rejection rather than claiming invitation delivery", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"message":"Domain not verified"}', { status: 403 })));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { sendEmail } = await import("./email.server");
    expect(await sendEmail(message)).toEqual({ ok: false, error: 'Resend 403: {"message":"Domain not verified"}' });
  });
  it("does not claim delivery without gateway authorization", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { sendEmail } = await import("./email.server");
    expect((await sendEmail(message)).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});