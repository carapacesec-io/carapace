/**
 * x402 configuration — protocol-native payments for API monetization.
 */

export const x402Config = {
  facilitatorUrl: process.env.X402_FACILITATOR_URL || "https://x402.org/facilitator",
  walletAddress: process.env.X402_WALLET_ADDRESS || "",
  enabled: process.env.X402_ENABLED === "true",
  pricing: {
    "POST /api/v1/review": "$0.02",
    "POST /api/attack/recon": "$0.01",
    "POST /api/attack/scan": "$0.03",
    "POST /api/upgrade": "$0.05",
  } as Record<string, string>,
  network: "eip155:8453", // Base mainnet
};
