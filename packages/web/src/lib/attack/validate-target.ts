/**
 * Shared SSRF protection for attack surface scanning endpoints.
 */

export interface ValidateResult {
  valid: boolean;
  error?: string;
  parsed?: URL;
}

export function validateTargetUrl(url: string): ValidateResult {
  let parsed: URL;
  try {
    parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { valid: false, error: "Only HTTP/HTTPS targets are supported" };
    }
  } catch {
    return { valid: false, error: "Invalid URL" };
  }

  const hostname = parsed.hostname.toLowerCase();
  const isPrivate =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.startsWith("127.") ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname === "::ffff:127.0.0.1" ||
    hostname.startsWith("::ffff:10.") ||
    hostname.startsWith("::ffff:192.168.") ||
    hostname.startsWith("::ffff:172.") ||
    hostname.startsWith("10.") ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("172.16.") ||
    hostname.startsWith("172.17.") ||
    hostname.startsWith("172.18.") ||
    hostname.startsWith("172.19.") ||
    hostname.startsWith("172.2") ||
    hostname.startsWith("172.30.") ||
    hostname.startsWith("172.31.") ||
    hostname.startsWith("169.254.") ||
    hostname.startsWith("fc") ||
    hostname.startsWith("fd") ||
    hostname.startsWith("fe80") ||
    hostname === "[::1]" ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".local");

  if (isPrivate) {
    return { valid: false, error: "Scanning internal/private addresses is not allowed" };
  }

  return { valid: true, parsed };
}
