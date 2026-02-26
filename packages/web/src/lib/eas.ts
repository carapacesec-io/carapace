import { EAS, SchemaEncoder } from "@ethereum-attestation-service/eas-sdk";
import { ethers } from "ethers";

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

// Base mainnet EAS contracts
const EAS_CONTRACT = "0x4200000000000000000000000000000000000021";

const BASE_EASSCAN_URL = "https://base.easscan.org/attestation/view";

/* -------------------------------------------------------------------------- */
/*  Configuration check                                                        */
/* -------------------------------------------------------------------------- */

export function isEASConfigured(): boolean {
  return !!(
    process.env.BASE_RPC_URL &&
    process.env.EAS_PRIVATE_KEY &&
    process.env.EAS_CODE_REVIEW_SCHEMA_UID &&
    process.env.EAS_ATTACK_SCAN_SCHEMA_UID
  );
}

export function getAttestationUrl(uid: string): string {
  return `${BASE_EASSCAN_URL}/${uid}`;
}

/* -------------------------------------------------------------------------- */
/*  Internal: get signer + EAS instance                                        */
/* -------------------------------------------------------------------------- */

function getEAS(): { eas: EAS; signer: ethers.Wallet } {
  const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
  const signer = new ethers.Wallet(process.env.EAS_PRIVATE_KEY!, provider);
  const eas = new EAS(EAS_CONTRACT);
  eas.connect(signer);
  return { eas, signer };
}

/* -------------------------------------------------------------------------- */
/*  Code Review Attestation                                                    */
/* -------------------------------------------------------------------------- */

// Schema: bytes32 repoHash, bytes32 commitHash, uint8 score, string grade, uint16 findingCount, uint32 timestamp
const CODE_REVIEW_SCHEMA =
  "bytes32 repoHash, bytes32 commitHash, uint8 score, string grade, uint16 findingCount, uint32 timestamp";

export async function createCodeReviewAttestation({
  repoFullName,
  commitSha,
  score,
  grade,
  findingCount,
}: {
  repoFullName: string;
  commitSha: string;
  score: number;
  grade: string;
  findingCount: number;
}): Promise<string | null> {
  if (!isEASConfigured()) return null;

  try {
    const { eas } = getEAS();
    const schemaEncoder = new SchemaEncoder(CODE_REVIEW_SCHEMA);

    const repoHash = ethers.keccak256(ethers.toUtf8Bytes(repoFullName));
    const commitHash = ethers.keccak256(ethers.toUtf8Bytes(commitSha));

    const encodedData = schemaEncoder.encodeData([
      { name: "repoHash", value: repoHash, type: "bytes32" },
      { name: "commitHash", value: commitHash, type: "bytes32" },
      { name: "score", value: Math.min(100, Math.max(0, score)), type: "uint8" },
      { name: "grade", value: grade, type: "string" },
      { name: "findingCount", value: findingCount, type: "uint16" },
      { name: "timestamp", value: Math.floor(Date.now() / 1000), type: "uint32" },
    ]);

    const tx = await eas.attest({
      schema: process.env.EAS_CODE_REVIEW_SCHEMA_UID!,
      data: {
        recipient: ethers.ZeroAddress,
        expirationTime: 0n,
        revocable: false,
        data: encodedData,
      },
    });

    const uid = await tx.wait();
    console.log(`[eas] Code review attestation created: ${uid}`);
    return uid;
  } catch (err) {
    console.error("[eas] Failed to create code review attestation:", err);
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*  Attack Scan Attestation                                                    */
/* -------------------------------------------------------------------------- */

// Schema: bytes32 targetHash, string scanType, uint8 score, string grade, uint16 findingCount, uint32 timestamp
const ATTACK_SCAN_SCHEMA =
  "bytes32 targetHash, string scanType, uint8 score, string grade, uint16 findingCount, uint32 timestamp";

export async function createAttackScanAttestation({
  targetUrl,
  scanType,
  score,
  grade,
  findingCount,
}: {
  targetUrl: string;
  scanType: string;
  score: number;
  grade: string;
  findingCount: number;
}): Promise<string | null> {
  if (!isEASConfigured()) return null;

  try {
    const { eas } = getEAS();
    const schemaEncoder = new SchemaEncoder(ATTACK_SCAN_SCHEMA);

    const targetHash = ethers.keccak256(ethers.toUtf8Bytes(targetUrl));

    const encodedData = schemaEncoder.encodeData([
      { name: "targetHash", value: targetHash, type: "bytes32" },
      { name: "scanType", value: scanType, type: "string" },
      { name: "score", value: Math.min(100, Math.max(0, score)), type: "uint8" },
      { name: "grade", value: grade, type: "string" },
      { name: "findingCount", value: findingCount, type: "uint16" },
      { name: "timestamp", value: Math.floor(Date.now() / 1000), type: "uint32" },
    ]);

    const tx = await eas.attest({
      schema: process.env.EAS_ATTACK_SCAN_SCHEMA_UID!,
      data: {
        recipient: ethers.ZeroAddress,
        expirationTime: 0n,
        revocable: false,
        data: encodedData,
      },
    });

    const uid = await tx.wait();
    console.log(`[eas] Attack scan attestation created: ${uid}`);
    return uid;
  } catch (err) {
    console.error("[eas] Failed to create attack scan attestation:", err);
    return null;
  }
}
