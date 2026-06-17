import * as anchorPkg from "@coral-xyz/anchor";
import type { Idl } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import idl from "../../../../target/idl/task_contract.json";
import type { IndexedTask, TaskStatus } from "@/lib/server/db";

const { BN, BorshAccountsCoder } = anchorPkg;

export const RPC_URL = "https://api.devnet.solana.com";
export const COMMITMENT = "confirmed" as const;
export const PROGRAM_ID = new PublicKey(
  "DaLMrhPAinDFFmJeeccN9nCPwFs2UNhBvDBpr6dqwjZB"
);
export const DEFAULT_PUBLIC_KEY = new PublicKey(
  "11111111111111111111111111111111"
);

const textEncoder = new TextEncoder();
const accountCoder = new BorshAccountsCoder(idl as Idl);

export const connection = new Connection(RPC_URL, COMMITMENT);

export type ReadTaskSnapshot = {
  task: IndexedTask;
  taskPda: string;
  slot?: number;
  programId: string;
  decodedAccount: Record<string, unknown>;
};

export function taskIdToSeed(id: string | number | { toString: () => string }) {
  const seed = new Uint8Array(8);
  let value = BigInt(id.toString());
  for (let index = 0; index < seed.length; index += 1) {
    seed[index] = Number(value & 0xffn);
    value >>= 8n;
  }
  return seed;
}

export function deriveTaskPda(taskId: string, programId = PROGRAM_ID) {
  return PublicKey.findProgramAddressSync(
    [textEncoder.encode("task"), taskIdToSeed(taskId)],
    programId
  )[0];
}

function normalizeStatus(status: unknown): TaskStatus {
  if (typeof status === "string") return status as TaskStatus;
  if (status && typeof status === "object") {
    const [key] = Object.keys(status);
    return (key.charAt(0).toUpperCase() + key.slice(1)) as TaskStatus;
  }
  return "Open";
}

function readNumber(value: unknown) {
  if (value instanceof BN) return value.toNumber();
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  if (
    value &&
    typeof (value as { toString: () => string }).toString === "function"
  ) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
}

function readString(value: unknown) {
  if (value instanceof PublicKey) return value.toBase58();
  if (value instanceof BN) return value.toString();
  return String(value ?? "");
}

function getField(account: Record<string, unknown>, camel: string, snake: string) {
  return account[camel] ?? account[snake];
}

function activeAssignedJudges(account: Record<string, unknown>) {
  const count = readNumber(
    getField(account, "assignedJudgeCount", "assigned_judge_count")
  );
  return ((getField(account, "assignedJudges", "assigned_judges") ?? []) as PublicKey[])
    .slice(0, count)
    .filter((judge) => judge && !judge.equals(DEFAULT_PUBLIC_KEY));
}

function serializeDecoded(value: unknown): unknown {
  if (value instanceof PublicKey) return value.toBase58();
  if (value instanceof BN) return value.toString();
  if (Array.isArray(value)) return value.map(serializeDecoded);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, serializeDecoded(entry)])
    );
  }
  return value;
}

export function accountToIndexedTask(
  taskPda: PublicKey,
  account: Record<string, unknown>
): IndexedTask {
  const taskId = readString(getField(account, "id", "id"));
  const worker = getField(account, "worker", "worker");

  return {
    taskPda: taskPda.toBase58(),
    id: taskId,
    requestor: readString(getField(account, "requestor", "requestor")),
    worker:
      worker instanceof PublicKey && !worker.equals(DEFAULT_PUBLIC_KEY)
        ? readString(worker)
        : undefined,
    tokenMint: readString(getField(account, "tokenMint", "token_mint")),
    escrowTokenVault: readString(
      getField(account, "escrowTokenVault", "escrow_token_vault")
    ),
    nftAsset: readString(getField(account, "nftAsset", "nft_asset")),
    bountyAmount: readString(getField(account, "bountyAmount", "bounty_amount")),
    judgeFeeBps: readNumber(getField(account, "judgeFeeBps", "judge_fee_bps")),
    workerStakeAmount: readString(
      getField(account, "workerStakeAmount", "worker_stake_amount")
    ),
    requiredJudgesM: readNumber(
      getField(account, "requiredJudgesM", "required_judges_m")
    ),
    approvalThresholdN: readNumber(
      getField(account, "approvalThresholdN", "approval_threshold_n")
    ),
    passVoteCount: readNumber(
      getField(account, "passVoteCount", "pass_vote_count")
    ),
    failVoteCount: readNumber(
      getField(account, "failVoteCount", "fail_vote_count")
    ),
    assignedJudges: activeAssignedJudges(account).map((judge) =>
      judge.toBase58()
    ),
    publicMetadataUri: readString(
      getField(account, "publicMetadataUri", "public_metadata_uri")
    ),
    encryptedTaskDetailUri: readString(
      getField(account, "encryptedTaskDetailUri", "encrypted_task_detail_uri")
    ),
    encryptedSubmissionUri:
      readString(
        getField(account, "encryptedSubmissionUri", "encrypted_submission_uri")
      ) || undefined,
    status: normalizeStatus(getField(account, "status", "status")),
    createdAt: new Date(readNumber(getField(account, "createdAt", "created_at")) * 1000),
    submissionDeadline: new Date(
      readNumber(getField(account, "submissionDeadline", "submission_deadline")) *
        1000
    ),
    votingDeadline: new Date(
      readNumber(getField(account, "votingDeadline", "voting_deadline")) * 1000
    ),
    updatedAt: new Date(),
  };
}

export async function readTaskFromDevnet(
  taskId: string
): Promise<ReadTaskSnapshot> {
  const taskPda = deriveTaskPda(taskId);
  const response = await connection.getAccountInfoAndContext(
    taskPda,
    COMMITMENT
  );

  if (!response.value) {
    throw new Error("TASK_ACCOUNT_NOT_FOUND");
  }

  const decoded = accountCoder.decode(
    "Task",
    response.value.data
  ) as Record<string, unknown>;

  return {
    task: accountToIndexedTask(taskPda, decoded),
    taskPda: taskPda.toBase58(),
    slot: response.context.slot,
    programId: PROGRAM_ID.toBase58(),
    decodedAccount: serializeDecoded(decoded) as Record<string, unknown>,
  };
}

export async function getConfirmedSignatureSlot(signature: string) {
  const status = await connection.getSignatureStatuses([signature]);
  const value = status.value[0];
  if (!value) return undefined;
  if (value.err) {
    throw new Error("SIGNATURE_FAILED");
  }
  if (
    value.confirmationStatus !== "confirmed" &&
    value.confirmationStatus !== "finalized"
  ) {
    throw new Error("SIGNATURE_NOT_CONFIRMED");
  }
  return value.slot;
}
