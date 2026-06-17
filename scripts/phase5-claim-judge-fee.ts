import "dotenv/config";

import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import fs from "fs";
import path from "path";

export type ExecutionMode = "dry-run" | "execute";

type AnyProgram = Program & {
  methods: any;
  account: any;
  programId: PublicKey;
};

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

function readRequired(args: Record<string, string>, key: string) {
  const envKey = key.toUpperCase().replace(/-/g, "_");
  const value = args[key] ?? process.env[`PHASE5_${envKey}`];
  if (!value) {
    throw new Error(`--${key} is required.`);
  }
  return value;
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

export async function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const mode = readMode(args.mode ?? process.env.EXECUTION_MODE ?? "dry-run");
  const taskId = readRequired(args, "task-id");
  const judgeTokenAccount = new PublicKey(
    readRequired(args, "judge-token-account")
  );

  const provider = createProvider();
  const program = loadProgram(provider);
  const judge = provider.wallet.publicKey;
  const taskPda = deriveTask(program.programId, taskId);
  const taskBefore = await program.account.task.fetch(taskPda);
  const judgeAssignment = deriveJudgeAssignment(
    program.programId,
    taskId,
    judge
  );
  const escrowTokenVault = taskBefore.escrowTokenVault as PublicKey;

  let signature = "dry-run";
  let slot: number | undefined;

  if (mode === "execute") {
    signature = await program.methods
      .claimJudgeFee()
      .accounts({
        judge,
        task: taskPda,
        judgeAssignment,
        escrowTokenVault,
        judgeTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    slot = await confirmSignature(provider.connection, signature);
  }

  const taskAfter =
    mode === "execute"
      ? await program.account.task.fetch(taskPda)
      : taskBefore;
  const assignment =
    mode === "execute"
      ? await program.account.taskJudgeAssignment.fetch(judgeAssignment)
      : undefined;

  console.log("# CURRENT PHASE");
  console.log("Phase 5b: Claim Judge Fee");
  console.log("");
  console.log("# FUNCTION");
  console.log("claimJudgeFee()");
  console.log("");
  console.log("# FLOW");
  console.log(
    mode === "dry-run"
      ? "dry-run: fetched task and derived judge assignment, did not send transaction"
      : "execute: sent Anchor claim_judge_fee, confirmed signature, fetched task and assignment state"
  );
  console.log("");
  console.log("# RESULT");
  console.log(
    JSON.stringify(
      {
        phase: "Phase 5b: Claim Judge Fee",
        function: "claimJudgeFee()",
        mode,
        taskId,
        taskPda: taskPda.toBase58(),
        judge: judge.toBase58(),
        judgeAssignment: judgeAssignment.toBase58(),
        escrowTokenVault: escrowTokenVault.toBase58(),
        judgeTokenAccount: judgeTokenAccount.toBase58(),
        status: taskAfter.status,
        feePerJudge: taskAfter.feePerJudge?.toString(),
        judgeFeeClaimed: taskAfter.judgeFeeClaimed?.toString(),
        hasClaimedFee: assignment?.hasClaimedFee,
        feeAmount: assignment?.feeAmount?.toString(),
        signature,
        slot,
        isSimulated: mode === "dry-run",
      },
      null,
      2
    )
  );
}

if (require.main === module) {
  runCli().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
