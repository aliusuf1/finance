import { clearGmailState, completeGmailConnection, gmailSessionCookie } from "../../../../lib/gmail-session";

export async function GET(request: Request) {
  const destination = new URL("/", request.url);
  const headers = new Headers({ "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" });
  headers.append("Set-Cookie", clearGmailState(request));
  try {
    const session = await completeGmailConnection(request);
    headers.append("Set-Cookie", await gmailSessionCookie(request, session));
    destination.searchParams.set("gmail", "connected");
  } catch {
    // Never put provider errors, authorization codes, tokens, or email addresses into URLs.
    destination.searchParams.set("gmail", "failed");
  }
  headers.set("Location", destination.toString());
  return new Response(null, { status: 303, headers });
}
