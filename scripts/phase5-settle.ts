import "dotenv/config";

import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import fs from "fs";
import path from "path";

export type ExecutionMode = "dry-run" | "execute";

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

export type Phase5SettleResult = {
  phase: "Phase 5: Settle Payment";
  function: "settlePayment()";
  mode: ExecutionMode;
  taskId: string;
  taskPda: string;
  payer: string;
  requestor: string;
  worker: string;
  workerEscrow: string;
  escrowTokenVault: string;
  workerTokenAccount: string;
  requestorTokenAccount: string;
  nftAsset: string;
  result: "approved" | "rejected" | "inconclusive";
  statusBefore?: unknown;
  statusAfter?: unknown;
  passVoteCount?: number;
  failVoteCount?: number;
  feePerJudge?: string;
  totalJudgeFeeReserved?: string;
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

function readRequired(args: Record<string, string>, key: string) {
  const envKey = key.toUpperCase().replace(/-/g, "_");
  const value = args[key] ?? process.env[`PHASE5_${envKey}`];
  if (!value) {
    throw new Error(`--${key} is required.`);
  }
  return value;
}

function readTaskId(args: Record<string, string>) {
  return readRequired(args, "task-id");
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

function deriveTask(programId: PublicKey, taskId: string) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("task"), taskIdToSeed(taskId)],
    programId
  )[0];
}

function deriveWorkerEscrow(
  programId: PublicKey,
  taskId: string,
  worker: PublicKey
) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), taskIdToSeed(taskId), worker.toBuffer()],
    programId
  )[0];
}

function deriveJudgeAssignment(
  programId: PublicKey,
  taskId: string,
  judge: PublicKey
) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("task_judge"), taskIdToSeed(taskId), judge.toBuffer()],
    programId
  )[0];
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

function outcome(task: any): "approved" | "rejected" | "inconclusive" {
  const passVoteCount = Number(task.passVoteCount);
  const failVoteCount = Number(task.failVoteCount);
  const approvalThresholdN = Number(task.approvalThresholdN);
  const requiredJudgesM = Number(task.requiredJudgesM);
  const maxAllowedFailVotes = requiredJudgesM - approvalThresholdN;

  if (passVoteCount >= approvalThresholdN) {
    return "approved";
  }
  if (failVoteCount > maxAllowedFailVotes) {
    return "rejected";
  }
  return "inconclusive";
}

export async function settlePayment(
  taskId: string,
  workerTokenAccount: PublicKey,
  requestorTokenAccount: PublicKey,
  mode: ExecutionMode
): Promise<Phase5SettleResult> {
  const provider = createProvider();
  const program = loadProgram(provider);
  const payer = provider.wallet.publicKey;
  const taskPda = deriveTask(program.programId, taskId);
  const taskBefore = await program.account.task.fetch(taskPda);
  const requestor = taskBefore.requestor as PublicKey;
  const worker = taskBefore.worker as PublicKey;
  const workerEscrow = deriveWorkerEscrow(program.programId, taskId, worker);
  const escrowTokenVault = taskBefore.escrowTokenVault as PublicKey;
  const nftAsset = taskBefore.nftAsset as PublicKey;
  const result = outcome(taskBefore);
  const assignedJudges = (taskBefore.assignedJudges as PublicKey[]).slice(
    0,
    Number(taskBefore.assignedJudgeCount)
  );
  const judgeAssignments = assignedJudges.map((judge) =>
    deriveJudgeAssignment(program.programId, taskId, judge)
  );

  if (mode === "dry-run") {
    return {
      phase: "Phase 5: Settle Payment",
      function: "settlePayment()",
      mode,
      taskId,
      taskPda: taskPda.toBase58(),
      payer: payer.toBase58(),
      requestor: requestor.toBase58(),
      worker: worker.toBase58(),
      workerEscrow: workerEscrow.toBase58(),
      escrowTokenVault: escrowTokenVault.toBase58(),
      workerTokenAccount: workerTokenAccount.toBase58(),
      requestorTokenAccount: requestorTokenAccount.toBase58(),
      nftAsset: nftAsset.toBase58(),
      result,
      statusBefore: taskBefore.status,
      statusAfter:
        result === "approved"
          ? { completed: {} }
          : result === "rejected"
            ? { failed: {} }
            : { inconclusive: {} },
      passVoteCount: Number(taskBefore.passVoteCount),
      failVoteCount: Number(taskBefore.failVoteCount),
      signature: "dry-run",
      isSimulated: true,
    };
  }

  const signature = await program.methods
    .settlePayment()
    .accounts({
      payer,
      requestor,
      task: taskPda,
      workerEscrow,
      escrowTokenVault,
      workerTokenAccount,
      requestorTokenAccount,
      nftAsset,
      workerSystemAccount: worker,
      coreProgram: MPL_CORE_PROGRAM_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .remainingAccounts(
      judgeAssignments.map((pubkey) => ({
        pubkey,
        isWritable: true,
        isSigner: false,
      }))
    )
    .rpc();

  const slot = await confirmSignature(provider.connection, signature);
  const taskAfter = await program.account.task.fetch(taskPda);

  return {
    phase: "Phase 5: Settle Payment",
    function: "settlePayment()",
    mode,
    taskId,
    taskPda: taskPda.toBase58(),
    payer: payer.toBase58(),
    requestor: requestor.toBase58(),
    worker: worker.toBase58(),
    workerEscrow: workerEscrow.toBase58(),
    escrowTokenVault: escrowTokenVault.toBase58(),
    workerTokenAccount: workerTokenAccount.toBase58(),
    requestorTokenAccount: requestorTokenAccount.toBase58(),
    nftAsset: nftAsset.toBase58(),
    result,
    statusBefore: taskBefore.status,
    statusAfter: taskAfter.status,
    passVoteCount: Number(taskAfter.passVoteCount),
    failVoteCount: Number(taskAfter.failVoteCount),
    feePerJudge: taskAfter.feePerJudge?.toString(),
    totalJudgeFeeReserved: taskAfter.totalJudgeFeeReserved?.toString(),
    signature,
    slot,
    isSimulated: false,
  };
}

export async function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const mode = readMode(args.mode ?? process.env.EXECUTION_MODE ?? "dry-run");
  const taskId = readTaskId(args);
  const workerTokenAccount = new PublicKey(
    readRequired(args, "worker-token-account")
  );
  const requestorTokenAccount = new PublicKey(
    readRequired(args, "requestor-token-account")
  );
  const result = await settlePayment(
    taskId,
    workerTokenAccount,
    requestorTokenAccount,
    mode
  );

  console.log("# CURRENT PHASE");
  console.log(result.phase);
  console.log("");
  console.log("# FUNCTION");
  console.log(result.function);
  console.log("");
  console.log("# FLOW");
  console.log(
    mode === "dry-run"
      ? "dry-run: fetched task, derived settlement accounts, did not send transaction"
      : "execute: sent Anchor settle_payment, confirmed signature, fetched final task state"
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
