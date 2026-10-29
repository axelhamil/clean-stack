import { describe, expect, test } from "vitest";
import { scrubBreadcrumb, scrubEvent, scrubLog } from "../scrub-event";

describe("scrubEvent", () => {
  test("given a request with credentials, when scrubbed, then only innocent headers survive", () => {
    const event = scrubEvent({
      request: {
        cookies: "session=abc",
        data: { password: "secret" },
        query_string: "token=xyz",
        headers: {
          cookie: "session=abc",
          Cookie: "session=abc",
          authorization: "Bearer token",
          Authorization: "Bearer token",
          "x-csrf-token": "csrf-value",
          "content-type": "application/json",
        },
      },
    });

    expect(event.request).toEqual({ headers: { "content-type": "application/json" } });
  });

  test("given a user with identity fields, when scrubbed, then only the id survives", () => {
    const event = scrubEvent({
      user: { id: "keep-me", email: "a@b.c", username: "u", ip_address: "1.1.1.1" },
    });

    expect(event.user).toEqual({ id: "keep-me" });
  });

  test("a drizzle failed query message loses everything after params:", () => {
    const event = scrubEvent({
      message: 'Failed query: select "id" from "user" where "email" = $1\nparams: a@b.co',
    });

    expect(event.message).toBe('Failed query: select "id" from "user" where "email" = $1');
  });

  test("emails in an exception value are masked", () => {
    const event = scrubEvent({
      exception: { values: [{ value: "Email already used: a.b+promo@example.co" }] },
    });

    expect(event.exception?.values?.[0]?.value).toBe("Email already used: [email]");
  });

  test("query strings are dropped from urls inside messages", () => {
    const event = scrubEvent({
      message: "fetch failed for https://example.com/invite?token=tok&via=mail#top",
    });

    expect(event.message).toBe("fetch failed for https://example.com/invite");
  });

  test("given breadcrumbs on the event, when scrubbed, then each one is scrubbed", () => {
    const event = scrubEvent({
      breadcrumbs: [
        { category: "console", data: { arguments: ["a@b.co"] } },
        { category: "navigation", data: { to: "/reset?token=tok" } },
      ],
    });

    expect(event.breadcrumbs).toEqual([{ category: "navigation", data: { to: "/reset" } }]);
  });

  test("a long run of slashes without a query is cleaned in linear time", () => {
    const message = `${"a/".repeat(5000)} `;
    const startedAt = performance.now();

    const event = scrubEvent({ message });

    expect(performance.now() - startedAt).toBeLessThan(50);
    expect(event.message).toBe(message);
  });

  test("a query string carrying key=value is dropped even without a slash before it", () => {
    const event = scrubEvent({ message: "see token=abc?x=1 or example.com?token=tok" });

    expect(event.message).toBe("see token=abc or example.com");
  });

  test("a bare query string is dropped", () => {
    const event = scrubEvent({ message: "redirect to ?token=abc failed, is it ok?" });

    expect(event.message).toBe("redirect to  failed, is it ok?");
  });

  test("a query key in the contexts loses the email it carries", () => {
    const event = scrubEvent({
      contexts: { metadata: { queryKey: ["admin", "users", { search: "alice@ex.com" }] } },
      extra: { link: "https://example.com/invite?token=tok", attempts: 3 },
    });

    expect(event.contexts).toEqual({
      metadata: { queryKey: ["admin", "users", { search: "[email]" }] },
    });
    expect(event.extra).toEqual({ link: "https://example.com/invite", attempts: 3 });
  });
});

describe("scrubBreadcrumb", () => {
  test("console breadcrumbs are dropped", () => {
    expect(scrubBreadcrumb({ category: "console", data: { arguments: ["a@b.co"] } })).toBeNull();
  });

  test("breadcrumb urls lose query and hash", () => {
    const breadcrumb = scrubBreadcrumb({
      category: "http",
      data: {
        url: "https://api.example.com/api/user?token=tok",
        from: "/links?token=tok",
        to: "/settings#security",
        method: "GET",
      },
    });

    expect(breadcrumb?.data).toEqual({
      url: "https://api.example.com/api/user",
      from: "/links",
      to: "/settings",
      method: "GET",
    });
  });

  test("breadcrumb message and every data string are cleaned", () => {
    const breadcrumb = scrubBreadcrumb({
      category: "notifications",
      message: "stream failed for alice@example.com",
      data: {
        err: "TypeError: fetch https://api.example.com/stream?token=tok for bob@example.com",
      },
    });

    expect(breadcrumb).toEqual({
      category: "notifications",
      message: "stream failed for [email]",
      data: { err: "TypeError: fetch https://api.example.com/stream for [email]" },
    });
  });
});

describe("scrubLog", () => {
  test("a log line loses the email and the token of its message and attributes", () => {
    const log = scrubLog({
      level: "info",
      message: "reset mail sent to alice@example.com",
      attributes: { to: "alice@example.com", url: "/reset?token=SECRET", attempt: 1 },
    });

    expect(log).toEqual({
      level: "info",
      message: "reset mail sent to [email]",
      attributes: { to: "[email]", url: "/reset", attempt: 1 },
    });
  });
});
