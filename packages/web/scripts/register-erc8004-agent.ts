/**
 * One-time script to register Carapace as an ERC-8004 Trustless Agent on Base.
 *
 * Usage:
 *   BASE_RPC_URL=https://mainnet.base.org EAS_PRIVATE_KEY=0x... npx tsx packages/web/scripts/register-erc8004-agent.ts
 *
 * After running, copy the printed agent ID into your .env file as ERC8004_AGENT_ID.
 */

import { ethers } from "ethers";

const IDENTITY_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
const IDENTITY_ABI = [
  "function register(string agentURI) external returns (uint256 agentId)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
];

const TOKEN_URI = "https://carapacesec.io/.well-known/agent-card.json";

async function main() {
  const rpcUrl = process.env.BASE_RPC_URL;
  const privateKey = process.env.EAS_PRIVATE_KEY;

  if (!rpcUrl || !privateKey) {
    console.error("Error: BASE_RPC_URL and EAS_PRIVATE_KEY must be set.");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(IDENTITY_REGISTRY, IDENTITY_ABI, signer);

  console.log(`Registering ERC-8004 agent from address: ${signer.address}`);
  console.log(`Token URI: ${TOKEN_URI}\n`);

  const tx = await contract.register(TOKEN_URI);
  console.log(`Transaction sent: ${tx.hash}`);
  console.log("Waiting for confirmation...");

  const receipt = await tx.wait();

  // Parse agent ID from Registered or Transfer event
  let agentId: string | null = null;
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog({
        topics: log.topics as string[],
        data: log.data,
      });
      if (parsed?.name === "Registered") {
        agentId = parsed.args[0].toString();
        break;
      }
      if (parsed?.name === "Transfer") {
        agentId = parsed.args[2].toString();
        break;
      }
    } catch {
      // Not our event
    }
  }

  if (agentId) {
    console.log(`\nAgent registered successfully!`);
    console.log(`Agent ID: ${agentId}`);
    console.log(`\nAdd this to your .env file:`);
    console.log(`ERC8004_AGENT_ID=${agentId}`);
  } else {
    console.log(`\nTransaction confirmed but could not parse agent ID.`);
    console.log(`Check the transaction on BaseScan: https://basescan.org/tx/${receipt.hash}`);
  }
}

main().catch((err) => {
  console.error("Agent registration failed:", err);
  process.exit(1);
});
