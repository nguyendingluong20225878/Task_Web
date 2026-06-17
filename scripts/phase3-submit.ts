import "dotenv/config";

import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import crypto from "crypto";
import fs from "fs";
import path from "path";

export type ExecutionMode = "dry-run" | "execute";

type AnyProgram = Program & {
  methods: any;
  account: any;
  programId: PublicKey;
};

export type Phase3SubmitResult = {
  phase: "Phase 3: Submit and Assign";
  function: "submitAndAssign(encryptedSubmissionUri)";
  mode: ExecutionMode;
  taskId: string;
  taskPda: string;
  worker: string;
  systemConfig: string;
  judgeRegistry: string;
  judgeRecords: string[];
  encryptedSubmissionUri: string;
  statusBefore?: unknown;
  statusAfter?: unknown;
  assignedJudgeCount?: number;
  assignedJudges?: string[];
  signature: string;
  slot?: number;
  isSimulated: boolean;
};

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

function readTaskId(args: Record<string, string>) {
  const taskId = args["task-id"] ?? args.id ?? process.env.PHASE3_TASK_ID;
  if (!taskId) {
    throw new Error("--task-id is required.");
  }
  return String(taskId);
}

function readEncryptedSubmissionUri(args: Record<string, string>) {
  const uri =
    args["encrypted-submission-uri"] ??
    process.env.PHASE3_ENCRYPTED_SUBMISSION_URI;
  if (!uri) {
    throw new Error("--encrypted-submission-uri is required.");
  }
  return uri;
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

function taskIdToSeed(id: string) {
  return new BN(id).toArrayLike(Buffer, "le", 8);
}

function deriveBaseAddresses(programId: PublicKey, taskId: string) {
  const taskIdSeed = taskIdToSeed(taskId);
  const [taskPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("task"), taskIdSeed],
    programId
  );
  const [systemConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("system_config")],
    programId
  );
  const [judgeRegistry] = PublicKey.findProgramAddressSync(
    [Buffer.from("judge_registry")],
    programId
  );
  return { taskPda, systemConfig, judgeRegistry };
}

function deriveJudgeRecord(programId: PublicKey, judge: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("judge_record"), judge.toBuffer()],
    programId
  )[0];
}

function fakeSignature() {
  return anchor.utils.bytes.bs58.encode(crypto.randomBytes(64));
}

async function confirmSignature(
  connection: anchor.web3.Connection,
  signature: string
) {
  const latestBlockhash = await connection.getLatestBlockhash();
  await connection.confirmTransaction(
    { signature, ...latestBlockhash },
    "confirmed"
  );
  const status = await connection.getSignatureStatuses([signature]);
  return status.value[0]?.slot;
}

function activeJudgesFromRegistry(registry: any) {
  const activeCount = Number(registry.activeCount);
  return registry.judges
    .slice(0, activeCount)
    .filter((judge: PublicKey) => !judge.equals(PublicKey.default));
}

function nonDefaultAssignedJudges(task: any) {
  const assignedCount = Number(task.assignedJudgeCount ?? 0);
  return task.assignedJudges
    .slice(0, assignedCount)
    .filter((judge: PublicKey) => !judge.equals(PublicKey.default));
}

export async function submitAndAssign(
  taskId: string,
  encryptedSubmissionUri: string,
  mode: ExecutionMode
): Promise<Phase3SubmitResult> {
  const provider = createProvider();
  const program = loadProgram(provider);
  const worker = provider.wallet.publicKey;
  const { taskPda, systemConfig, judgeRegistry } = deriveBaseAddresses(
    program.programId,
    taskId
  );

  const taskBefore = await program.account.task.fetch(taskPda);
  const registry = await program.account.judgeRegistry.fetch(judgeRegistry);
  const activeJudges = activeJudgesFromRegistry(registry);
  const judgeRecords = activeJudges.map((judge) =>
    deriveJudgeRecord(program.programId, judge)
  );

  if (mode === "dry-run") {
    return {
      phase: "Phase 3: Submit and Assign",
      function: "submitAndAssign(encryptedSubmissionUri)",
      mode,
      taskId,
      taskPda: taskPda.toBase58(),
      worker: worker.toBase58(),
      systemConfig: systemConfig.toBase58(),
      judgeRegistry: judgeRegistry.toBase58(),
      judgeRecords: judgeRecords.map((record) => record.toBase58()),
      encryptedSubmissionUri,
      statusBefore: taskBefore.status,
      statusAfter: { resolving: {} },
      assignedJudgeCount: Number(taskBefore.requiredJudgesM),
      assignedJudges: activeJudges
        .slice(0, Number(taskBefore.requiredJudgesM))
        .map((judge) => judge.toBase58()),
      signature: fakeSignature(),
      isSimulated: true,
    };
  }

  const signature = await program.methods
    .submitAndAssign(encryptedSubmissionUri)
    .accounts({
      worker,
      task: taskPda,
      systemConfig,
      judgeRegistry,
      systemProgram: SystemProgram.programId,
    })
    .remainingAccounts(
      judgeRecords.map((record) => ({
        pubkey: record,
        isWritable: true,
        isSigner: false,
      }))
    )
    .rpc();

  const slot = await confirmSignature(provider.connection, signature);
  const taskAfter = await program.account.task.fetch(taskPda);
  const assignedJudges = nonDefaultAssignedJudges(taskAfter);

  return {
    phase: "Phase 3: Submit and Assign",
    function: "submitAndAssign(encryptedSubmissionUri)",
    mode,
    taskId,
    taskPda: taskPda.toBase58(),
    worker: worker.toBase58(),
    systemConfig: systemConfig.toBase58(),
    judgeRegistry: judgeRegistry.toBase58(),
    judgeRecords: judgeRecords.map((record) => record.toBase58()),
    encryptedSubmissionUri: taskAfter.encryptedSubmissionUri,
    statusBefore: taskBefore.status,
    statusAfter: taskAfter.status,
    assignedJudgeCount: Number(taskAfter.assignedJudgeCount),
    assignedJudges: assignedJudges.map((judge) => judge.toBase58()),
    signature,
    slot,
    isSimulated: false,
  };
}

export async function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const mode = readMode(args.mode ?? process.env.EXECUTION_MODE ?? "dry-run");
  const taskId = readTaskId(args);
  const encryptedSubmissionUri = readEncryptedSubmissionUri(args);
  const result = await submitAndAssign(taskId, encryptedSubmissionUri, mode);

  console.log("# CURRENT PHASE");
  console.log(result.phase);
  console.log("");
  console.log("# FUNCTION");
  console.log(result.function);
  console.log("");
  console.log("# FLOW");
  console.log(
    mode === "dry-run"
      ? "dry-run: fetched task and active judge records, did not send transaction"
      : "execute: sent Anchor submit_and_assign, confirmed signature, fetched assigned judges"
  );
  console.log("");
  console.log("# RESULT");
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  runCli().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
