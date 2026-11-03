import { verifyToken } from "@clerk/backend";

export async function authenticatedUserId(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!token || !secretKey) return null;
  try {
    const payload = await verifyToken(token, { secretKey });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch { return null; }
}

export function isSameOrigin(request: Request) {
  return request.headers.get("origin") === new URL(request.url).origin;
}
