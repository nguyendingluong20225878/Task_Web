import "dotenv/config";

import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import {
  taskCollection,
  transactionCollection,
} from "../src/lib/server/db/collections";
import { closeMongoDb, getMongoDb } from "../src/lib/server/db/mongo";
import type { IndexedTask } from "../src/lib/server/db/models";

export type ExecutionMode = "dry-run" | "execute";

export type CreateTaskParams = {
  id: string;
  creator?: string;
  tokenMint?: string;
  creatorTokenAccount?: string;
  bountyAmount: string;
  workerStakeAmount: string;
  requiredJudgesM: number;
  approvalThresholdN: number;
  submissionDeadline: number;
  votingDeadline: number;
  publicMetadataUri: string;
  encryptedTaskDetailUri: string;
  encryptedSubmissionUri: string;
};

export type CreateTaskResult = {
  phase: "Phase 1: Create Task";
  function: "createTask(params, mode)";
  mode: ExecutionMode;
  taskPda: string;
  escrowTokenVault: string;
  nftAsset: string;
  signature: string;
  slot?: number;
  isSimulated: boolean;
};

type AnyProgram = Program & {
  methods: any;
  account: any;
  programId: PublicKey;
};

const MPL_CORE_PROGRAM_ID = new PublicKey(
  "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
);
const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);

function parseArgs(argv: string[]) {
  return Object.fromEntries(
    argv
      .filter((arg) => arg.startsWith("--"))
      .map((arg) => {
        const [key, ...value] = arg.slice(2).split("=");
        return [key, value.length ? value.join("=") : "true"];
      })
  );
}

function readMode(raw?: string): ExecutionMode {
  if (raw === "dry-run" || raw === "execute") {
    return raw;
  }
  throw new Error('mode must be "dry-run" or "execute".');
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function readParams(args: Record<string, string>): CreateTaskParams {
  const now = nowSeconds();
  const submissionDeadline = Number(
    args["submission-deadline"] ??
      process.env.CREATE_TASK_SUBMISSION_DEADLINE ??
      now + 2 * 86400
  );
  const votingDeadline = Number(
    args["voting-deadline"] ??
      process.env.CREATE_TASK_VOTING_DEADLINE ??
      submissionDeadline + 86400
  );

  return {
    id: String(args.id ?? process.env.CREATE_TASK_ID ?? Date.now()),
    creator: args.creator ?? process.env.CREATE_TASK_CREATOR,
    tokenMint: args["token-mint"] ?? process.env.CREATE_TASK_TOKEN_MINT,
    creatorTokenAccount:
      args["creator-token-account"] ??
      process.env.CREATE_TASK_CREATOR_TOKEN_ACCOUNT,
    bountyAmount: String(
      args["bounty-amount"] ?? process.env.CREATE_TASK_BOUNTY_AMOUNT ?? "1"
    ),
    workerStakeAmount: String(
      args["worker-stake-amount"] ??
        process.env.CREATE_TASK_WORKER_STAKE_AMOUNT ??
        "1"
    ),
    requiredJudgesM: Number(
      args["required-judges-m"] ??
        process.env.CREATE_TASK_REQUIRED_JUDGES_M ??
        1
    ),
    approvalThresholdN: Number(
      args["approval-threshold-n"] ??
        process.env.CREATE_TASK_APPROVAL_THRESHOLD_N ??
        1
    ),
    submissionDeadline,
    votingDeadline,
    publicMetadataUri:
      args["public-metadata-uri"] ??
      process.env.CREATE_TASK_PUBLIC_METADATA_URI ??
      `ipfs://task-${Date.now()}`,
    encryptedTaskDetailUri:
      args["encrypted-task-detail-uri"] ??
      process.env.CREATE_TASK_ENCRYPTED_TASK_DETAIL_URI ??
      `enc://task-detail-${Date.now()}`,
    encryptedSubmissionUri:
      args["encrypted-submission-uri"] ??
      process.env.CREATE_TASK_ENCRYPTED_SUBMISSION_URI ??
      "",
  };
}

function requirePublicKey(value: string | undefined, name: string) {
  if (!value) {
    throw new Error(`${name} is required in execute mode.`);
  }
  return new PublicKey(value);
}

function optionalPublicKey(value: string | undefined) {
  return value ? new PublicKey(value) : Keypair.generate().publicKey;
}

function taskIdToSeed(id: string) {
  return new BN(id).toArrayLike(Buffer, "le", 8);
}

function loadProgram(provider: anchor.AnchorProvider): AnyProgram {
  const idlPath = path.resolve("target/idl/task_contract.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  return new Program(idl, provider) as AnyProgram;
}

function createProvider() {
  const rpcUrl =
    process.env.SOLANA_RPC_URL ??
    process.env.ANCHOR_PROVIDER_URL ??
    "http://127.0.0.1:8899";
  const connection = new anchor.web3.Connection(rpcUrl, "confirmed");
  const wallet = anchor.Wallet.local();
  const provider = new anchor.AnchorProvider(
    connection,
    wallet,
    anchor.AnchorProvider.defaultOptions()
  );
  anchor.setProvider(provider);
  return provider;
}

function deriveAddresses(programId: PublicKey, id: string) {
  const [systemConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("system_config")],
    programId
  );
  const [taskPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("task"), taskIdToSeed(id)],
    programId
  );
  const [escrowTokenVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), taskPda.toBuffer()],
    programId
  );

  return { systemConfig, taskPda, escrowTokenVault };
}

function fakeSignature() {
  return anchor.utils.bytes.bs58.encode(crypto.randomBytes(64));
}

function normalizeStatus(status: unknown): IndexedTask["status"] {
  if (typeof status === "string") {
    return status as IndexedTask["status"];
  }
  if (status && typeof status === "object") {
    const [key] = Object.keys(status);
    const normalized = key.charAt(0).toUpperCase() + key.slice(1);
    return normalized as IndexedTask["status"];
  }
  return "Open";
}

function accountToTaskRecord(input: {
  account?: any;
  params: CreateTaskParams;
  taskPda: PublicKey;
  escrowTokenVault: PublicKey;
  nftAsset: PublicKey;
  creator: PublicKey;
  tokenMint: PublicKey;
  signature: string;
  slot?: number;
  programId: PublicKey;
  isSimulated: boolean;
}): IndexedTask {
  const now = new Date();
  const account = input.account;
  const assignedJudges = account?.assignedJudges
    ? account.assignedJudges.map((judge: PublicKey) => judge.toBase58())
    : [];

  return {
    taskPda: input.taskPda.toBase58(),
    id: input.params.id,
    isSimulated: input.isSimulated,
    requestor: (account?.requestor ?? input.creator).toBase58(),
    worker: account?.worker?.toBase58(),
    tokenMint: (account?.tokenMint ?? input.tokenMint).toBase58(),
    escrowTokenVault: (
      account?.escrowTokenVault ?? input.escrowTokenVault
    ).toBase58(),
    nftAsset: (account?.nftAsset ?? input.nftAsset).toBase58(),
    bountyAmount: String(account?.bountyAmount ?? input.params.bountyAmount),
    judgeFeeBps: Number(account?.judgeFeeBps ?? 0),
    workerStakeAmount: String(
      account?.workerStakeAmount ?? input.params.workerStakeAmount
    ),
    requiredJudgesM: Number(
      account?.requiredJudgesM ?? input.params.requiredJudgesM
    ),
    approvalThresholdN: Number(
      account?.approvalThresholdN ?? input.params.approvalThresholdN
    ),
    passVoteCount: Number(account?.passVoteCount ?? 0),
    failVoteCount: Number(account?.failVoteCount ?? 0),
    assignedJudges,
    publicMetadataUri:
      account?.publicMetadataUri ?? input.params.publicMetadataUri,
    encryptedTaskDetailUri:
      account?.encryptedTaskDetailUri ?? input.params.encryptedTaskDetailUri,
    encryptedSubmissionUri:
      account?.encryptedSubmissionUri ??
      input.params.encryptedSubmissionUri ??
      undefined,
    status: normalizeStatus(account?.status),
    createdAt: new Date(
      Number(account?.createdAt ?? Math.floor(now.getTime() / 1000)) * 1000
    ),
    submissionDeadline: new Date(
      Number(account?.submissionDeadline ?? input.params.submissionDeadline) *
        1000
    ),
    votingDeadline: new Date(
      Number(account?.votingDeadline ?? input.params.votingDeadline) * 1000
    ),
    lastSignature: input.signature,
    lastIndexedSlot: input.slot,
    lastIndexedCommitment: input.slot ? "confirmed" : undefined,
    programId: input.programId.toBase58(),
    decodedAccount: account
      ? JSON.parse(JSON.stringify(account))
      : {
          mode: "dry-run",
          instruction: "initialize_task",
          params: input.params,
        },
    updatedAt: now,
  };
}

async function writeCreateTaskRecord(
  result: CreateTaskResult,
  task: IndexedTask,
  actor?: string
) {
  const timeoutMS = Number(process.env.DB_WRITE_TIMEOUT_MS ?? 15000);
  await withTimeout(
    (async () => {
      const db = await getMongoDb();
      await taskCollection(db).updateOne(
        { taskPda: task.taskPda },
        { $set: task },
        { upsert: true }
      );
      await transactionCollection(db).updateOne(
        { signature: result.signature },
        {
          $setOnInsert: {
            signature: result.signature,
            isSimulated: result.isSimulated,
            slot: result.slot,
            instruction: "initialize_task",
            taskPda: result.taskPda,
            actor,
            status: "confirmed",
            createdAt: new Date(),
          },
        },
        { upsert: true }
      );
    })(),
    timeoutMS,
    `Atlas DB write timed out after ${timeoutMS}ms`
  );
}

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMS: number,
  message: string
) {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMS);
  });

  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
  });
}
export async function createTask(
  params: CreateTaskParams,
  mode: ExecutionMode
): Promise<CreateTaskResult> {
  const provider = mode === "execute" ? createProvider() : undefined;
  const program = provider
    ? loadProgram(provider)
    : ({
        programId: new PublicKey(
          "DaLMrhPAinDFFmJeeccN9nCPwFs2UNhBvDBpr6dqwjZB"
        ),
      } as AnyProgram);
  const { systemConfig, taskPda, escrowTokenVault } = deriveAddresses(
    program.programId,
    params.id
  );
  const creator =
    mode === "execute"
      ? provider!.wallet.publicKey
      : optionalPublicKey(params.creator);
  const tokenMint =
    mode === "execute"
      ? requirePublicKey(params.tokenMint, "tokenMint")
      : optionalPublicKey(params.tokenMint);
  const creatorTokenAccount =
    mode === "execute"
      ? requirePublicKey(params.creatorTokenAccount, "creatorTokenAccount")
      : optionalPublicKey(params.creatorTokenAccount);
  const nftAsset = Keypair.generate();

  if (mode === "dry-run") {
    const signature = fakeSignature();
    const result: CreateTaskResult = {
      phase: "Phase 1: Create Task",
      function: "createTask(params, mode)",
      mode,
      taskPda: taskPda.toBase58(),
      escrowTokenVault: escrowTokenVault.toBase58(),
      nftAsset: nftAsset.publicKey.toBase58(),
      signature,
      isSimulated: true,
    };
    const task = accountToTaskRecord({
      params,
      taskPda,
      escrowTokenVault,
      nftAsset: nftAsset.publicKey,
      creator,
      tokenMint,
      signature,
      programId: program.programId,
      isSimulated: true,
    });
    await writeCreateTaskRecord(result, task, creator.toBase58()).catch(
      (error) => {
        console.warn(
          `WARN: create task record was not written: ${error.message}`
        );
      }
    );
    return result;
  }

  const signature = await program.methods
    .initializeTask(
      new BN(params.id),
      new BN(params.bountyAmount),
      new BN(params.workerStakeAmount),
      params.requiredJudgesM,
      params.approvalThresholdN,
      [new BN(params.submissionDeadline), new BN(params.votingDeadline)],
      params.publicMetadataUri,
      params.encryptedTaskDetailUri,
      params.encryptedSubmissionUri
    )
    .accounts({
      creator,
      systemConfig,
      task: taskPda,
      tokenMint,
      escrowTokenVault,
      creatorTokenAccount,
      nftAsset: nftAsset.publicKey,
      coreProgram: MPL_CORE_PROGRAM_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .signers([nftAsset])
    .rpc();

  const latestBlockhash = await provider!.connection.getLatestBlockhash();
  await provider!.connection.confirmTransaction(
    { signature, ...latestBlockhash },
    "confirmed"
  );
  const status = await provider!.connection.getSignatureStatuses([signature]);
  const slot = status.value[0]?.slot;
  const account = await program.account.task.fetch(taskPda);
  const result: CreateTaskResult = {
    phase: "Phase 1: Create Task",
    function: "createTask(params, mode)",
    mode,
    taskPda: taskPda.toBase58(),
    escrowTokenVault: escrowTokenVault.toBase58(),
    nftAsset: nftAsset.publicKey.toBase58(),
    signature,
    slot,
    isSimulated: false,
  };
  const task = accountToTaskRecord({
    account,
    params,
    taskPda,
    escrowTokenVault,
    nftAsset: nftAsset.publicKey,
    creator,
    tokenMint,
    signature,
    slot,
    programId: program.programId,
    isSimulated: false,
  });
  await writeCreateTaskRecord(result, task, creator.toBase58()).catch(
    (error) => {
      console.warn(
        `WARN: create task record was not written: ${error.message}`
      );
    }
  );
  return result;
}

export async function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const mode = readMode(args.mode ?? process.env.EXECUTION_MODE ?? "dry-run");
  const params = readParams(args);
  const result = await createTask(params, mode);

  console.log("# CURRENT PHASE");
  console.log(result.phase);
  console.log("");
  console.log("# FUNCTION");
  console.log("createTask(params, mode)");
  console.log("");
  console.log("# FLOW");
  console.log(
    mode === "dry-run"
      ? "dry-run: simulated initialize_task, generated fake signature/PDA, attempted Atlas DB write with isSimulated=true"
      : "execute: sent Anchor initialize_task, confirmed signature, attempted Atlas DB write with isSimulated=false"
  );
  console.log("");
  console.log("# RESULT");
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  runCli()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await withTimeout(
        closeMongoDb(),
        Number(process.env.DB_CLOSE_TIMEOUT_MS ?? 2000),
        "MongoDB close timed out"
      ).catch(() => undefined);
      if (process.exitCode) {
        process.exit(process.exitCode);
      }
    });
}
