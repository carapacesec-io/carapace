import { ethers } from "ethers";

/* -------------------------------------------------------------------------- */
/*  Constants — ERC-8004 registries on Base mainnet                           */
/* -------------------------------------------------------------------------- */

const IDENTITY_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
const REPUTATION_REGISTRY = "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63";

// Minimal ABIs — match the real ERC-8004 spec (deployed on Base + Ethereum mainnet)
const IDENTITY_ABI = [
  "function register(string agentURI) external returns (uint256 agentId)",
  "function setAgentURI(uint256 agentId, string newURI) external",
  "function tokenURI(uint256 tokenId) external view returns (string)",
  "function balanceOf(address owner) external view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)",
  "function getMetadata(uint256 agentId, string metadataKey) external view returns (bytes)",
  "function setMetadata(uint256 agentId, string metadataKey, bytes metadataValue) external",
  "function setAgentWallet(uint256 agentId, address newWallet, uint256 deadline, bytes signature) external",
  "function getAgentWallet(uint256 agentId) external view returns (address)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
];

const REPUTATION_ABI = [
  "function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash) external",
  "function getSummary(uint256 agentId, address[] clientAddresses, string tag1, string tag2) external view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)",
  "function readFeedback(uint256 agentId, address clientAddress, uint64 feedbackIndex) external view returns (int128 value, uint8 valueDecimals, string tag1, string tag2, bool isRevoked)",
  "function getClients(uint256 agentId) external view returns (address[])",
  "function getLastIndex(uint256 agentId, address clientAddress) external view returns (uint64)",
  "function revokeFeedback(uint256 agentId, uint64 feedbackIndex) external",
  "event NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, int128 value, uint8 valueDecimals, string indexed indexedTag1, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)",
];

/* -------------------------------------------------------------------------- */
/*  Configuration check                                                        */
/* -------------------------------------------------------------------------- */

export function isERC8004Configured(): boolean {
  return !!(
    process.env.BASE_RPC_URL &&
    process.env.EAS_PRIVATE_KEY &&
    process.env.ERC8004_AGENT_ID
  );
}

/* -------------------------------------------------------------------------- */
/*  Internal helpers                                                           */
/* -------------------------------------------------------------------------- */

function getProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
}

function getSigner(): ethers.Wallet {
  const provider = getProvider();
  return new ethers.Wallet(process.env.EAS_PRIVATE_KEY!, provider);
}

/* -------------------------------------------------------------------------- */
/*  Register agent (one-time)                                                  */
/* -------------------------------------------------------------------------- */

export async function registerAgent(agentURI: string): Promise<bigint> {
  const signer = getSigner();
  const contract = new ethers.Contract(IDENTITY_REGISTRY, IDENTITY_ABI, signer);
  const tx = await contract.register(agentURI);
  const receipt = await tx.wait();

  // Parse agentId from Registered or Transfer event
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog({ topics: log.topics as string[], data: log.data });
      if (parsed?.name === "Registered") {
        return parsed.args[0]; // agentId
      }
      if (parsed?.name === "Transfer") {
        return parsed.args[2]; // tokenId
      }
    } catch {
      // Not our event
    }
  }

  throw new Error("Could not find agent ID in transaction receipt");
}

/* -------------------------------------------------------------------------- */
/*  Update agent URI                                                           */
/* -------------------------------------------------------------------------- */

export async function updateAgentURI(agentId: string, newURI: string): Promise<string> {
  const signer = getSigner();
  const contract = new ethers.Contract(IDENTITY_REGISTRY, IDENTITY_ABI, signer);
  const tx = await contract.setAgentURI(agentId, newURI);
  const receipt = await tx.wait();
  return receipt.hash;
}

/* -------------------------------------------------------------------------- */
/*  Get agent identity                                                         */
/* -------------------------------------------------------------------------- */

export async function getAgentIdentity(): Promise<{
  agentId: string;
  tokenURI: string | null;
} | null> {
  const agentId = process.env.ERC8004_AGENT_ID;
  if (!agentId || !process.env.BASE_RPC_URL) return null;

  try {
    const provider = getProvider();
    const contract = new ethers.Contract(IDENTITY_REGISTRY, IDENTITY_ABI, provider);
    const tokenURI = await contract.tokenURI(agentId);
    return { agentId, tokenURI };
  } catch {
    return { agentId, tokenURI: null };
  }
}

/* -------------------------------------------------------------------------- */
/*  Submit feedback (on-chain)                                                 */
/* -------------------------------------------------------------------------- */

export async function submitFeedback({
  agentId,
  value,
  valueDecimals = 0,
  tag1 = "",
  tag2 = "",
  endpoint = "",
  feedbackURI = "",
  feedbackHash = ethers.ZeroHash,
}: {
  agentId: string;
  value: number;
  valueDecimals?: number;
  tag1?: string;
  tag2?: string;
  endpoint?: string;
  feedbackURI?: string;
  feedbackHash?: string;
}): Promise<string> {
  const signer = getSigner();
  const contract = new ethers.Contract(REPUTATION_REGISTRY, REPUTATION_ABI, signer);
  const tx = await contract.giveFeedback(
    agentId,
    value,
    valueDecimals,
    tag1,
    tag2,
    endpoint,
    feedbackURI,
    feedbackHash,
  );
  const receipt = await tx.wait();
  return receipt.hash;
}

/* -------------------------------------------------------------------------- */
/*  Get reputation (read-only)                                                 */
/* -------------------------------------------------------------------------- */

export async function getReputation(agentId: string): Promise<{
  average: number;
  count: number;
}> {
  if (!process.env.BASE_RPC_URL) {
    return { average: 0, count: 0 };
  }

  try {
    const provider = getProvider();
    const contract = new ethers.Contract(REPUTATION_REGISTRY, REPUTATION_ABI, provider);
    // getSummary(agentId, clientAddresses[], tag1, tag2) → (count, summaryValue, summaryValueDecimals)
    const result = await contract.getSummary(agentId, [], "", "");
    const count = Number(result.count);
    const summaryValue = Number(result.summaryValue);
    const decimals = Number(result.summaryValueDecimals);
    return {
      average: decimals > 0 ? summaryValue / 10 ** decimals : summaryValue,
      count,
    };
  } catch {
    return { average: 0, count: 0 };
  }
}
