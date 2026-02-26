/**
 * One-time script to register EAS schemas on Base mainnet.
 *
 * Usage:
 *   BASE_RPC_URL=https://mainnet.base.org EAS_PRIVATE_KEY=0x... npx tsx packages/web/scripts/register-eas-schemas.ts
 *
 * After running, copy the printed UIDs into your .env file.
 */

import { SchemaRegistry } from "@ethereum-attestation-service/eas-sdk";
import { ethers } from "ethers";

const SCHEMA_REGISTRY_CONTRACT = "0x4200000000000000000000000000000000000020";

const CODE_REVIEW_SCHEMA =
  "bytes32 repoHash, bytes32 commitHash, uint8 score, string grade, uint16 findingCount, uint32 timestamp";

const ATTACK_SCAN_SCHEMA =
  "bytes32 targetHash, string scanType, uint8 score, string grade, uint16 findingCount, uint32 timestamp";

async function main() {
  const rpcUrl = process.env.BASE_RPC_URL;
  const privateKey = process.env.EAS_PRIVATE_KEY;

  if (!rpcUrl || !privateKey) {
    console.error("Error: BASE_RPC_URL and EAS_PRIVATE_KEY must be set.");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);
  const registry = new SchemaRegistry(SCHEMA_REGISTRY_CONTRACT);
  registry.connect(signer);

  console.log(`Registering schemas from address: ${signer.address}\n`);

  // Register code review schema
  console.log("Registering Code Review schema...");
  const codeReviewTx = await registry.register({
    schema: CODE_REVIEW_SCHEMA,
    resolverAddress: ethers.ZeroAddress,
    revocable: false,
  });
  const codeReviewUid = await codeReviewTx.wait();
  console.log(`  Code Review Schema UID: ${codeReviewUid}`);

  // Register attack scan schema
  console.log("Registering Attack Scan schema...");
  const attackScanTx = await registry.register({
    schema: ATTACK_SCAN_SCHEMA,
    resolverAddress: ethers.ZeroAddress,
    revocable: false,
  });
  const attackScanUid = await attackScanTx.wait();
  console.log(`  Attack Scan Schema UID: ${attackScanUid}`);

  console.log("\nAdd these to your .env file:");
  console.log(`EAS_CODE_REVIEW_SCHEMA_UID=${codeReviewUid}`);
  console.log(`EAS_ATTACK_SCAN_SCHEMA_UID=${attackScanUid}`);
}

main().catch((err) => {
  console.error("Schema registration failed:", err);
  process.exit(1);
});
