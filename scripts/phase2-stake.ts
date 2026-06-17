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

export type Phase2StakeResult = {
  phase: "Phase 2: Stake";
  function: "stakeToUnlock()";
  mode: ExecutionMode;
  taskId: string;
  taskPda: string;
  worker: string;
  workerEscrow: string;
  workerStakeAmount?: string;
  statusBefore?: unknown;
  statusAfter?: unknown;
  amountStaked?: string;
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
  const taskId = args["task-id"] ?? args.id ?? process.env.PHASE2_TASK_ID;
  if (!taskId) {
    throw new Error("--task-id is required.");
  }
  return String(taskId);
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

function deriveAddresses(programId: PublicKey, taskId: string, worker: PublicKey) {
  const taskIdSeed = taskIdToSeed(taskId);
  const [taskPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("task"), taskIdSeed],
    programId
  );
  const [workerEscrow] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), taskIdSeed, worker.toBuffer()],
    programId
  );
  return { taskPda, workerEscrow };
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

export async function stakeToUnlock(
  taskId: string,
  mode: ExecutionMode
): Promise<Phase2StakeResult> {
  const provider = createProvider();
  const program = loadProgram(provider);
  const worker = provider.wallet.publicKey;
  const { taskPda, workerEscrow } = deriveAddresses(
    program.programId,
    taskId,
    worker
  );

  const taskBefore = await program.account.task.fetch(taskPda);

  if (mode === "dry-run") {
    return {
      phase: "Phase 2: Stake",
      function: "stakeToUnlock()",
      mode,
      taskId,
      taskPda: taskPda.toBase58(),
      worker: worker.toBase58(),
      workerEscrow: workerEscrow.toBase58(),
      workerStakeAmount: taskBefore.workerStakeAmount?.toString(),
      statusBefore: taskBefore.status,
      statusAfter: { inProgress: {} },
      signature: fakeSignature(),
      isSimulated: true,
    };
  }

  const signature = await program.methods
    .stakeToUnlock()
    .accounts({
      worker,
      task: taskPda,
      workerEscrow,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  const slot = await confirmSignature(provider.connection, signature);
  const taskAfter = await program.account.task.fetch(taskPda);
  const escrow = await program.account.workerEscrow.fetch(workerEscrow);

  return {
    phase: "Phase 2: Stake",
    function: "stakeToUnlock()",
    mode,
    taskId,
    taskPda: taskPda.toBase58(),
    worker: worker.toBase58(),
    workerEscrow: workerEscrow.toBase58(),
    workerStakeAmount: taskBefore.workerStakeAmount?.toString(),
    statusBefore: taskBefore.status,
    statusAfter: taskAfter.status,
    amountStaked: escrow.amountStaked?.toString(),
    signature,
    slot,
    isSimulated: false,
  };
}

export async function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const mode = readMode(args.mode ?? process.env.EXECUTION_MODE ?? "dry-run");
  const taskId = readTaskId(args);
  const result = await stakeToUnlock(taskId, mode);

  console.log("# CURRENT PHASE");
  console.log(result.phase);
  console.log("");
  console.log("# FUNCTION");
  console.log(result.function);
  console.log("");
  console.log("# FLOW");
  console.log(
    mode === "dry-run"
      ? "dry-run: derived task/worker escrow addresses, fetched task state, did not send transaction"
      : "execute: sent Anchor stake_to_unlock, confirmed signature, fetched task and worker escrow state"
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
