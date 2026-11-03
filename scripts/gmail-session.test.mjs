import assert from "node:assert/strict";
import test from "node:test";
import { loadTestModule } from "./gmail-test-loader.mjs";

const env = { GOOGLE_CLIENT_ID: "test-client", GOOGLE_CLIENT_SECRET: "test-client-secret", CLERK_SECRET_KEY: "test-clerk-secret" };
const request = new Request("https://hisab.example/api/email");
const cookiePair = (value) => value.split(";")[0];

test("OAuth uses read-only scope, random state and PKCE with a short-lived HttpOnly cookie", async () => {
  const api = loadTestModule("lib/gmail-session.ts", { env });
  const first = await api.beginGmailConnection(request, "owner");
  const second = await api.beginGmailConnection(request, "owner");
  const params = new URL(first.url).searchParams;
  assert.equal(params.get("scope"), "https://www.googleapis.com/auth/gmail.readonly");
  assert.equal(params.get("code_challenge_method"), "S256");
  assert.equal(params.get("redirect_uri"), "https://hisab.example/api/email/callback");
  assert.notEqual(params.get("state"), new URL(second.url).searchParams.get("state"));
  assert.match(first.cookie, /HttpOnly; SameSite=Lax; Max-Age=600; Secure/);
  assert.ok(!first.cookie.includes("owner"));
});

test("OAuth callback rejects missing cookies and forged state before contacting Google", async () => {
  const api = loadTestModule("lib/gmail-session.ts", { env });
  await assert.rejects(api.completeGmailConnection(new Request("https://hisab.example/api/email/callback?state=fake&code=fake")));
  const start = await api.beginGmailConnection(request, "owner");
  await assert.rejects(api.completeGmailConnection(new Request("https://hisab.example/api/email/callback?state=fake&code=fake", { headers: { cookie: cookiePair(start.cookie) } })));
});

test("successful callback exchanges PKCE, binds the session to its owner, and encrypts tokens", async () => {
  const calls = [];
  const api = loadTestModule("lib/gmail-session.ts", { env, fetch: async (url, init) => {
    calls.push([url, init]);
    return Response.json(url.endsWith("/token") ? { access_token: "test-access-token", refresh_token: "test-refresh-token", expires_in: 3600, scope: "https://www.googleapis.com/auth/gmail.readonly" } : { emailAddress: "owner@example.test" });
  } });
  const start = await api.beginGmailConnection(request, "owner");
  const state = new URL(start.url).searchParams.get("state");
  const session = await api.completeGmailConnection(new Request(`https://hisab.example/api/email/callback?state=${state}&code=test-code`, { headers: { cookie: cookiePair(start.cookie) } }));
  assert.equal(session.userId, "owner");
  assert.equal(session.email, "owner@example.test");
  assert.ok(calls[0][1].body.get("code_verifier"));
  assert.equal(calls[0][1].body.get("client_secret"), "test-client-secret");
  const cookie = await api.gmailSessionCookie(request, session);
  assert.ok(!cookie.includes("test-access-token"));
  assert.ok(!cookie.includes("test-refresh-token"));
  const connected = new Request(request, { headers: { cookie: cookiePair(cookie) } });
  assert.equal((await api.readGmailSession(connected, "owner")).email, "owner@example.test");
  assert.equal(await api.readGmailSession(connected, "another-user"), null);
  const pair = cookiePair(cookie);
  const [name, value] = pair.split("=");
  const tampered = `${name}=${value.slice(0, 20)}${value[20] === "A" ? "B" : "A"}${value.slice(21)}`;
  assert.equal(await api.readGmailSession(new Request(request, { headers: { cookie: tampered } }), "owner"), null);
});

test("expired encrypted connections are rejected and disconnect cookies remove the session", async () => {
  const api = loadTestModule("lib/gmail-session.ts", { env });
  const cookie = await api.gmailSessionCookie(request, { userId: "owner", email: "owner@example.test", accessToken: "access", refreshToken: "refresh", accessExpires: Date.now() - 1, expires: Date.now() - 1 });
  assert.equal(await api.readGmailSession(new Request(request, { headers: { cookie: cookiePair(cookie) } }), "owner"), null);
  assert.match(api.clearGmailSession(request), /Max-Age=0/);
});

test("refresh failures request reconnection instead of exposing Google responses", async () => {
  const api = loadTestModule("lib/gmail-session.ts", { env, fetch: async () => Response.json({ error: "private provider diagnostics" }, { status: 400 }) });
  await assert.rejects(api.freshGmailSession({ accessExpires: 0, refreshToken: "expired" }), (error) => error.reconnect === true && !error.message.includes("private provider diagnostics"));
});
