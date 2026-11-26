import { describe, expect, it } from "vitest";
import { GET } from "../app/api/auth-redirect/route";
import { isAuthSpaTarget } from "../lib/iblai/sso-redirect";

describe("isAuthSpaTarget", () => {
  const auth = "https://login.iblai.app";

  it("accepts the Auth SPA and nothing else", () => {
    expect(isAuthSpaTarget("https://login.iblai.app/login?app=mentor", auth)).toBe(true);
    expect(isAuthSpaTarget("https://evil.example/login", auth)).toBe(false);
    expect(isAuthSpaTarget("https://login.iblai.app.evil.example/", auth)).toBe(false);
    expect(isAuthSpaTarget("https://login.iblai.app@evil.example/", auth)).toBe(false);
    expect(isAuthSpaTarget("http://login.iblai.app/login", auth)).toBe(false);
    expect(isAuthSpaTarget("//evil.example", auth)).toBe(false);
    expect(isAuthSpaTarget("", auth)).toBe(false);
    expect(isAuthSpaTarget(null, auth)).toBe(false);
  });
});

describe("GET /api/auth-redirect", () => {
  const hop = (to: string) =>
    GET(new Request(`https://app.example/api/auth-redirect?to=${encodeURIComponent(to)}`));

  it("redirects to the Auth SPA", async () => {
    const res = await hop("https://login.iblai.app/login?app=mentor");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://login.iblai.app/login?app=mentor");
  });

  it("refuses any other origin", async () => {
    expect((await hop("https://evil.example/login")).status).toBe(400);
  });
});
