import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Use Google's downloaded OAuth client JSON; never print or pass secret values in shell arguments.
const credentialPath = process.argv[2];
if (!credentialPath) {
  console.error("Usage: node scripts/configure-gmail.mjs <downloaded-google-client.json>");
  process.exit(1);
}
const config = JSON.parse(readFileSync(credentialPath, "utf8")).web;
if (!config || !/^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(config.client_id ?? "") || !/^[A-Za-z0-9_-]+$/.test(config.client_secret ?? "")) {
  throw new Error("Expected a Google OAuth Web application client JSON with valid credentials.");
}
if (!config.redirect_uris?.includes("http://127.0.0.1:5173/api/email/callback")) {
  throw new Error("Add http://127.0.0.1:5173/api/email/callback to this client's authorized redirect URIs first.");
}
const envPath = fileURLToPath(new URL("../.env.local", import.meta.url));
let env = readFileSync(envPath, "utf8");
for (const [name, value] of [["GOOGLE_CLIENT_ID", config.client_id], ["GOOGLE_CLIENT_SECRET", config.client_secret]]) {
  const pattern = new RegExp(`^${name}=.*$`, "gm");
  env = pattern.test(env) ? env.replace(pattern, `${name}=${value}`) : `${env.trimEnd()}\n${name}=${value}\n`;
}
writeFileSync(envPath, env, { mode: 0o600 });
console.log("Google OAuth credentials saved to .env.local. Restart the development server to connect Gmail.");
