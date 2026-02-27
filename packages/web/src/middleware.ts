import { NextRequest, NextResponse } from "next/server";

/**
 * Edge-compatible middleware — checks session cookie presence only.
 * Actual session validation happens server-side in API routes via auth().
 * This avoids importing Prisma which doesn't work on the edge runtime.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const hasSession =
    req.cookies.has("__Secure-authjs.session-token") ||
    req.cookies.has("authjs.session-token");

  // Protected routes require authentication
  const protectedPaths = ["/dashboard", "/repos", "/scans", "/settings", "/upgrade", "/trends", "/attack"];
  const isProtected = protectedPaths.some((path) => pathname.startsWith(path));

  if (isProtected && !hasSession) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // API routes (except public ones) require auth
  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/webhooks/") && !pathname.startsWith("/api/auth/") && !pathname.startsWith("/api/v1/") && !pathname.startsWith("/api/upgrade") && !pathname.startsWith("/api/github/setup") && !pathname.startsWith("/api/badge/") && !pathname.startsWith("/api/bulk-scan") && !pathname.startsWith("/api/internal/") && !pathname.startsWith("/api/agent/identity") && !pathname.startsWith("/api/playground") && !pathname.startsWith("/api/slack/") && !pathname.startsWith("/api/health")) {
    if (!hasSession) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Security headers
  const response = NextResponse.next();
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );
  response.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://api.github.com; frame-ancestors 'none'"
  );

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
