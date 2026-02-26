import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAgentIdentity, getReputation, isERC8004Configured } from "@/lib/erc8004";

export async function GET() {
  const agentId = process.env.ERC8004_AGENT_ID;

  const [identity, reputation, attestationCount] = await Promise.all([
    getAgentIdentity(),
    agentId ? getReputation(agentId) : Promise.resolve({ average: 0, count: 0 }),
    prisma.scan.count({ where: { attestationUid: { not: null } } }),
  ]);

  return NextResponse.json({
    agentId: agentId ?? null,
    configured: isERC8004Configured(),
    name: "Carapace Security",
    identity,
    reputation,
    attestationCount,
    services: [
      { name: "web", endpoint: "https://carapacesec.io/" },
      { name: "A2A", endpoint: "https://carapacesec.io/.well-known/agent-card.json" },
      { name: "api", endpoint: "https://carapacesec.io/api/v1/review" },
      { name: "attack-scanner", endpoint: "https://carapacesec.io/api/attack/scan" },
    ],
  });
}
