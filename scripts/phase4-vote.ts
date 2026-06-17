import "dotenv/config";

import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import crypto from "crypto";
import fs from "fs";
import path from "path";

export type ExecutionMode = "dry-run" | "execute";

type AnyProgram = Program & {
  methods: any;
  account: any;
  programId: PublicKey;
};

export type Phase4VoteResult = {
  phase: "Phase 4: Judge Vote";
  function: "judgeVote(isPass)";
  mode: ExecutionMode;
  taskId: string;
  taskPda: string;
  judge: string;
  judgeRecord: string;
  judgeAssignment: string;
  vote: "pass" | "fail";
  statusBefore?: unknown;
  statusAfter?: unknown;
  passVoteCountBefore?: number;
  failVoteCountBefore?: number;
  passVoteCountAfter?: number;
  failVoteCountAfter?: number;
  hasVoted?: boolean;
  voteIsPass?: boolean;
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
  const taskId = args["task-id"] ?? args.id ?? process.env.PHASE4_TASK_ID;
  if (!taskId) {
    throw new Error("--task-id is required.");
  }
  return String(taskId);
}

function readVote(args: Record<string, string>) {
  const vote = args.vote ?? process.env.PHASE4_VOTE;
  if (vote === "pass" || vote === "true") {
    return { label: "pass" as const, isPass: true };
  }
  if (vote === "fail" || vote === "false") {
    return { label: "fail" as const, isPass: false };
  }
  throw new Error('--vote must be "pass" or "fail".');
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

function deriveAddresses(programId: PublicKey, taskId: string, judge: PublicKey) {
  const taskIdSeed = taskIdToSeed(taskId);
  const [taskPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("task"), taskIdSeed],
    programId
  );
  const [judgeRecord] = PublicKey.findProgramAddressSync(
    [Buffer.from("judge_record"), judge.toBuffer()],
    programId
  );
  const [judgeAssignment] = PublicKey.findProgramAddressSync(
    [Buffer.from("task_judge"), taskIdSeed, judge.toBuffer()],
    programId
  );
  return { taskPda, judgeRecord, judgeAssignment };
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

export async function judgeVote(
  taskId: string,
  voteLabel: "pass" | "fail",
  isPass: boolean,
  mode: ExecutionMode
): Promise<Phase4VoteResult> {
  const provider = createProvider();
  const program = loadProgram(provider);
  const judge = provider.wallet.publicKey;
  const { taskPda, judgeRecord, judgeAssignment } = deriveAddresses(
    program.programId,
    taskId,
    judge
  );

  const taskBefore = await program.account.task.fetch(taskPda);

  if (mode === "dry-run") {
    return {
      phase: "Phase 4: Judge Vote",
      function: "judgeVote(isPass)",
      mode,
      taskId,
      taskPda: taskPda.toBase58(),
      judge: judge.toBase58(),
      judgeRecord: judgeRecord.toBase58(),
      judgeAssignment: judgeAssignment.toBase58(),
      vote: voteLabel,
      statusBefore: taskBefore.status,
      statusAfter: taskBefore.status,
      passVoteCountBefore: Number(taskBefore.passVoteCount),
      failVoteCountBefore: Number(taskBefore.failVoteCount),
      passVoteCountAfter:
        Number(taskBefore.passVoteCount) + (isPass ? 1 : 0),
      failVoteCountAfter:
        Number(taskBefore.failVoteCount) + (isPass ? 0 : 1),
      hasVoted: true,
      voteIsPass: isPass,
      signature: fakeSignature(),
      isSimulated: true,
    };
  }

  const signature = await program.methods
    .judgeVote(isPass)
    .accounts({
      judge,
      task: taskPda,
      judgeRecord,
      judgeAssignment,
    })
    .rpc();

  const slot = await confirmSignature(provider.connection, signature);
  const taskAfter = await program.account.task.fetch(taskPda);
  const assignment = await program.account.taskJudgeAssignment.fetch(
    judgeAssignment
  );

  return {
    phase: "Phase 4: Judge Vote",
    function: "judgeVote(isPass)",
    mode,
    taskId,
    taskPda: taskPda.toBase58(),
    judge: judge.toBase58(),
    judgeRecord: judgeRecord.toBase58(),
    judgeAssignment: judgeAssignment.toBase58(),
    vote: voteLabel,
    statusBefore: taskBefore.status,
    statusAfter: taskAfter.status,
    passVoteCountBefore: Number(taskBefore.passVoteCount),
    failVoteCountBefore: Number(taskBefore.failVoteCount),
    passVoteCountAfter: Number(taskAfter.passVoteCount),
    failVoteCountAfter: Number(taskAfter.failVoteCount),
    hasVoted: assignment.hasVoted,
    voteIsPass: assignment.voteIsPass,
    signature,
    slot,
    isSimulated: false,
  };
}

export async function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const mode = readMode(args.mode ?? process.env.EXECUTION_MODE ?? "dry-run");
  const taskId = readTaskId(args);
  const vote = readVote(args);
  const result = await judgeVote(taskId, vote.label, vote.isPass, mode);

  console.log("# CURRENT PHASE");
  console.log(result.phase);
  console.log("");
  console.log("# FUNCTION");
  console.log(result.function);
  console.log("");
  console.log("# FLOW");
  console.log(
    mode === "dry-run"
      ? "dry-run: derived judge record and assignment addresses, fetched task state, did not send transaction"
      : "execute: sent Anchor judge_vote, confirmed signature, fetched task and assignment state"
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
