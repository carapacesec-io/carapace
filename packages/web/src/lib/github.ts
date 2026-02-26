import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "octokit";
import { readFileSync } from "node:fs";

function getPrivateKey(): string {
  if (process.env.GITHUB_APP_PRIVATE_KEY) {
    return process.env.GITHUB_APP_PRIVATE_KEY;
  }
  if (process.env.GITHUB_APP_PRIVATE_KEY_PATH) {
    return readFileSync(process.env.GITHUB_APP_PRIVATE_KEY_PATH, "utf-8");
  }
  throw new Error("GITHUB_APP_PRIVATE_KEY or GITHUB_APP_PRIVATE_KEY_PATH must be set");
}

export function getAppOctokit() {
  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: process.env.GITHUB_APP_ID!,
      privateKey: getPrivateKey(),
    },
  });
}

export async function getInstallationOctokit(installationId: number) {
  const app = getAppOctokit();
  const { token } = (await app.auth({
    type: "installation",
    installationId,
  })) as { token: string };

  return new Octokit({ auth: token });
}

export async function verifyWebhookSignature(
  payload: string,
  signature: string
): Promise<boolean> {
  const secret = process.env.GITHUB_WEBHOOK_SECRET!;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const expectedSignature =
    "sha256=" +
    Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

  if (signature.length !== expectedSignature.length) return false;
  const a = new TextEncoder().encode(signature);
  const b = new TextEncoder().encode(expectedSignature);
  // Constant-time comparison to prevent timing attacks
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a[i] ^ b[i];
  }
  return mismatch === 0;
}
