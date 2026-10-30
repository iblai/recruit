import { describe, expect, it } from "vitest";
import config from "../lib/iblai/config";
import { createOrganizationUrl, loginReturnUrl } from "../lib/iblai/auth-redirect";

describe("the $0 checkout", () => {
  it("is the direct join URL for the hosted recruit, byte for byte", () => {
    expect(createOrganizationUrl(config.checkoutReturnUrl())).toBe(
      "https://api.iblai.app/dm/api/service/stripe/checkout/redirect/credits-free-plan/?redirect_url=https%3A%2F%2Flogin.iblai.app%2Flogin%3Fapp%3Dmentor%26redirect-to%3Dhttps%253A%252F%252Frecruit.iblai.me&cancel_url=https%3A%2F%2Flogin.iblai.app%2Flogin%3Fapp%3Dmentor%26redirect-to%3Dhttps%253A%252F%252Frecruit.iblai.me",
    );
  });

  it("nests the app in the login page and carries the signed-in email when there is one", () => {
    expect(loginReturnUrl("http://localhost:3000")).toBe(
      "https://login.iblai.app/login?app=mentor&redirect-to=http%3A%2F%2Flocalhost%3A3000",
    );
    const url = new URL(createOrganizationUrl("https://recruit.example.edu", "jane@x.io"));
    expect(url.searchParams.get("email")).toBe("jane@x.io");
    expect(url.searchParams.get("cancel_url")).toBe(url.searchParams.get("redirect_url"));
  });
});
