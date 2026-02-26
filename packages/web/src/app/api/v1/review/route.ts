import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { analyze, logger } from "@carapace/engine";
import { x402Config } from "@/lib/x402";

function validateApiKey(provided: string): boolean {
  const expected = process.env.CARAPACE_API_KEY;
  if (!expected || !provided) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

async function handleReview(request: NextRequest) {
  try {
    const body = await request.json();
    const { diff, rulesets, targetChains, staticOnly, repoPath } = body;

    if (!diff || typeof diff !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'diff' field" },
        { status: 400 }
      );
    }

    const result = await analyze({
      diff,
      enabledRulesets: rulesets ?? ["general", "crypto"],
      targetChains: targetChains?.length > 0 ? targetChains : undefined,
      apiKey: process.env.ANTHROPIC_API_KEY,
      repoPath: repoPath ?? undefined,
      staticOnly: staticOnly ?? false,
    });

    return NextResponse.json(result);
  } catch (error) {
    logger.error(`Review API error: ${(error as Error).message}`);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  // 1. Check for Bearer API key (existing behavior)
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const apiKey = authHeader.slice(7);
    if (validateApiKey(apiKey)) {
      return handleReview(request);
    }
  }

  // 2. If x402 enabled, check for payment header
  if (x402Config.enabled) {
    const paymentHeader = request.headers.get("x-payment") || request.headers.get("payment");
    if (paymentHeader) {
      const price = x402Config.pricing["POST /api/v1/review"];
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

        if (verifyResponse.ok) {
          // Settle (best-effort)
          fetch(`${x402Config.facilitatorUrl}/settle`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              payment: paymentHeader,
              price,
              network: x402Config.network,
              walletAddress: x402Config.walletAddress,
            }),
          }).catch((err) => logger.error("x402 settle failed: " + (err as Error).message));

          return handleReview(request);
        }
      } catch (error) {
        logger.error(`x402 verification error: ${(error as Error).message}`);
      }
    }

    // Return 402 with payment instructions
    return NextResponse.json(
      {
        error: "Payment Required",
        x402: {
          version: "1",
          price: x402Config.pricing["POST /api/v1/review"],
          network: x402Config.network,
          facilitatorUrl: x402Config.facilitatorUrl,
          walletAddress: x402Config.walletAddress,
          description: "Pay to access the Carapace code review API",
        },
      },
      { status: 402 }
    );
  }

  // 3. No valid auth — return 401
  return NextResponse.json({ error: "Missing or invalid API key" }, { status: 401 });
}
