import { z } from "zod";

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const sessionCookie = "hisab_gmail";
const stateCookie = "hisab_gmail_state";
const maxAge = 30 * 24 * 60 * 60;
const sessionSchema = z.object({
  userId: z.string().min(1), email: z.string().email(), accessToken: z.string().min(1),
  refreshToken: z.string().min(1), accessExpires: z.number(), expires: z.number(),
});
export type GmailSession = z.infer<typeof sessionSchema>;
const stateSchema = z.object({ userId: z.string(), state: z.string(), verifier: z.string(), expires: z.number() });
export class GmailError extends Error {
  constructor(message: string, public status = 502, public reconnect = false) { super(message); }
}

function base64url(data: Uint8Array) {
  return Buffer.from(data).toString("base64url");
}
function decode(value: string) { return new Uint8Array(Buffer.from(value, "base64url")); }

async function encryptionKey() {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) throw new GmailError("Sign-in is not configured.", 503);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`hisab-gmail-cookie-v1:${secret}`));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function seal(value: unknown, purpose: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(purpose) }, await encryptionKey(), new TextEncoder().encode(JSON.stringify(value)));
  return `${base64url(iv)}.${base64url(new Uint8Array(ciphertext))}`;
}

async function unseal(value: string, purpose: string): Promise<unknown> {
  const [iv, ciphertext, extra] = value.split(".");
  if (!iv || !ciphertext || extra || value.length > 3800) throw new Error("Invalid cookie");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(iv), additionalData: new TextEncoder().encode(purpose) }, await encryptionKey(), decode(ciphertext));
  return JSON.parse(new TextDecoder().decode(plain));
}

function getCookie(request: Request, name: string) {
  return request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
}

function cookie(request: Request, name: string, value: string, seconds: number) {
  if (value.length > 3800) throw new GmailError("This Gmail connection is too large to save. Please reconnect.");
  return `${name}=${value}; Path=/api/email; HttpOnly; SameSite=Lax; Max-Age=${seconds}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}

export function gmailConfigured() { return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET); }
export function callbackUrl(request: Request) { return new URL("/api/email/callback", request.url).toString(); }

export async function beginGmailConnection(request: Request, userId: string) {
  if (!gmailConfigured()) throw new GmailError("Gmail needs Google OAuth credentials before it can connect. See GMAIL_SETUP.md in the project.", 503);
  const state = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: callbackUrl(request), response_type: "code", scope: GMAIL_SCOPE, access_type: "offline", prompt: "consent select_account", state, code_challenge: challenge, code_challenge_method: "S256" }).toString();
  return { url: url.toString(), cookie: cookie(request, stateCookie, await seal({ userId, state, verifier, expires: Date.now() + 10 * 60_000 }, stateCookie), 600) };
}

const tokenSchema = z.object({ access_token: z.string().min(1), refresh_token: z.string().optional(), expires_in: z.number().positive(), scope: z.string().optional() });
async function tokenRequest(parameters: Record<string, string>) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...parameters }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new GmailError("Google could not authorize the connection. Please reconnect Gmail.", 401, true);
  const data = tokenSchema.parse(await response.json());
  if (data.scope && !data.scope.split(" ").includes(GMAIL_SCOPE)) throw new GmailError("Gmail read access was not granted. Reconnect and allow read-only access.", 401, true);
  return data;
}

export async function completeGmailConnection(request: Request) {
  const url = new URL(request.url);
  let state;
  try { state = stateSchema.parse(await unseal(getCookie(request, stateCookie), stateCookie)); }
  catch { throw new GmailError("The connection expired. Start again from Hisab.", 400); }
  if (state.expires < Date.now() || state.state !== url.searchParams.get("state")) throw new GmailError("Invalid connection request. Start again from Hisab.", 400);
  if (url.searchParams.has("error")) throw new GmailError("Gmail connection was cancelled.", 400);
  const code = url.searchParams.get("code");
  if (!code) throw new GmailError("Google did not return an authorization code.", 400);
  const tokens = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: callbackUrl(request), code_verifier: state.verifier });
  if (!tokens.refresh_token) throw new GmailError("Google did not grant a lasting connection. Reconnect Gmail.", 401, true);
  const profile = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { Authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(20_000) });
  if (!profile.ok) throw new GmailError("Gmail could not be opened. Enable the Gmail API in your Google Cloud project and retry.");
  const { emailAddress } = z.object({ emailAddress: z.string().email() }).parse(await profile.json());
  const session: GmailSession = { userId: state.userId, email: emailAddress, accessToken: tokens.access_token, refreshToken: tokens.refresh_token, accessExpires: Date.now() + tokens.expires_in * 1000, expires: Date.now() + maxAge * 1000 };
  return session;
}

export async function readGmailSession(request: Request, userId: string): Promise<GmailSession | null> {
  try {
    const value = sessionSchema.parse(await unseal(getCookie(request, sessionCookie), sessionCookie));
    return value.userId === userId && value.expires > Date.now() ? value : null;
  } catch { return null; }
}

export async function freshGmailSession(session: GmailSession) {
  if (session.accessExpires > Date.now() + 60_000) return session;
  const tokens = await tokenRequest({ grant_type: "refresh_token", refresh_token: session.refreshToken });
  return { ...session, accessToken: tokens.access_token, refreshToken: tokens.refresh_token ?? session.refreshToken, accessExpires: Date.now() + tokens.expires_in * 1000 };
}

export async function gmailSessionCookie(request: Request, session: GmailSession) {
  return cookie(request, sessionCookie, await seal(session, sessionCookie), Math.max(0, Math.floor((session.expires - Date.now()) / 1000)));
}
export function clearGmailState(request: Request) { return cookie(request, stateCookie, "", 0); }
export function clearGmailSession(request: Request) { return cookie(request, sessionCookie, "", 0); }

export async function revokeGmail(session: GmailSession) {
  const response = await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: session.refreshToken }), signal: AbortSignal.timeout(20_000) });
  if (!response.ok && response.status !== 400) throw new GmailError("Google could not disconnect Gmail. Try again.");
}
