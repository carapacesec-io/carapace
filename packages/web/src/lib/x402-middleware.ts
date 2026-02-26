/**
 * x402 payment middleware — reusable wrapper for route handlers.
 * Session-authenticated users bypass payment. Anonymous callers pay via x402.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { x402Config } from "@/lib/x402";

type RouteHandler = (request: NextRequest) => Promise<NextResponse | Response>;

export function withX402(price: string, handler: RouteHandler): RouteHandler {
  return async (request: NextRequest) => {
    // If user has a valid session, bypass x402 (dashboard users don't pay)
    const session = await auth();
    if (session?.user?.id) {
      return handler(request);
    }

    // If x402 is disabled, require session auth
    if (!x402Config.enabled) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check for x402 payment header
    const paymentHeader = request.headers.get("x-payment") || request.headers.get("payment");
    if (!paymentHeader) {
      return NextResponse.json(
        {
          error: "Payment Required",
          x402: {
            version: "1",
            price,
            network: x402Config.network,
            facilitatorUrl: x402Config.facilitatorUrl,
            walletAddress: x402Config.walletAddress,
            description: `Pay ${price} to access this endpoint`,
          },
        },
        { status: 402 },
      );
    }

    // Verify payment via facilitator
    try {
      const verifyResponse = await fetch(`${x402Config.facilitatorUrl}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payment: paymentHeader,
          price,
          network: x402Config.network,
          walletAddress: x402Config.walletAddress,
        }),
      });

      if (!verifyResponse.ok) {
        const err = await verifyResponse.text();
        return NextResponse.json(
          { error: "Payment verification failed", details: err },
          { status: 402 },
        );
      }

      // Payment valid — settle and proceed
      const settleResponse = await fetch(`${x402Config.facilitatorUrl}/settle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payment: paymentHeader,
          price,
          network: x402Config.network,
          walletAddress: x402Config.walletAddress,
        }),
      });

      if (!settleResponse.ok) {
        console.error("x402 settlement failed:", await settleResponse.text());
        // Still proceed — verification passed, settlement is best-effort
      }

      return handler(request);
    } catch (error) {
      console.error("x402 verification error:", error);
      return NextResponse.json(
        { error: "Payment processing failed" },
        { status: 500 },
      );
    }
  };
}
