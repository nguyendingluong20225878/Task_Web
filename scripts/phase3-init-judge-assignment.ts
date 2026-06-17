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

type AssignmentResult = {
  judge: string;
  judgeAssignment: string;
  assignedOrder?: number;
  hasVoted?: boolean;
  voteIsPass?: boolean;
  hasClaimedFee?: boolean;
  signature: string;
  slot?: number;
  isSimulated: boolean;
};

export type Phase3InitJudgeAssignmentResult = {
  phase: "Phase 3b: Init Judge Assignment";
  function: "initJudgeAssignment()";
  mode: ExecutionMode;
  taskId: string;
  taskPda: string;
  payer: string;
  statusBefore?: unknown;
  assignments: AssignmentResult[];
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

function assignedJudgesFromTask(task: any) {
  const assignedCount = Number(task.assignedJudgeCount ?? 0);
  return task.assignedJudges
    .slice(0, assignedCount)
    .filter((judge: PublicKey) => !judge.equals(PublicKey.default));
}

function readJudges(args: Record<string, string>, task: any) {
  if (args.judge) {
    return [new PublicKey(args.judge)];
  }
  if (args.judges) {
    return args.judges
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => new PublicKey(value));
  }
  return assignedJudgesFromTask(task);
}

export async function initJudgeAssignments(
  taskId: string,
  mode: ExecutionMode,
  judgeArgs?: Record<string, string>
): Promise<Phase3InitJudgeAssignmentResult> {
  const provider = createProvider();
  const program = loadProgram(provider);
  const payer = provider.wallet.publicKey;
  const taskPda = deriveTask(program.programId, taskId);
  const task = await program.account.task.fetch(taskPda);
  const judges = readJudges(judgeArgs ?? {}, task);

  if (!judges.length) {
    throw new Error(
      "No assigned judges found. Run phase3-submit first or pass --judge=<JUDGE_PUBKEY>."
    );
  }

  const assignments: AssignmentResult[] = [];

  for (const judge of judges) {
    const judgeAssignment = deriveJudgeAssignment(
      program.programId,
      taskId,
      judge
    );

    if (mode === "dry-run") {
      assignments.push({
        judge: judge.toBase58(),
        judgeAssignment: judgeAssignment.toBase58(),
        signature: fakeSignature(),
        isSimulated: true,
      });
      continue;
    }

    const signature = await program.methods
      .initJudgeAssignment()
      .accounts({
        payer,
        judge,
        task: taskPda,
        judgeAssignment,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const slot = await confirmSignature(provider.connection, signature);
    const assignment = await program.account.taskJudgeAssignment.fetch(
      judgeAssignment
    );

    assignments.push({
      judge: judge.toBase58(),
      judgeAssignment: judgeAssignment.toBase58(),
      assignedOrder: Number(assignment.assignedOrder),
      hasVoted: assignment.hasVoted,
      voteIsPass: assignment.voteIsPass,
      hasClaimedFee: assignment.hasClaimedFee,
      signature,
      slot,
      isSimulated: false,
    });
  }

  return {
    phase: "Phase 3b: Init Judge Assignment",
    function: "initJudgeAssignment()",
    mode,
    taskId,
    taskPda: taskPda.toBase58(),
    payer: payer.toBase58(),
    statusBefore: task.status,
    assignments,
  };
}

export async function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const mode = readMode(args.mode ?? process.env.EXECUTION_MODE ?? "dry-run");
  const taskId = readTaskId(args);
  const result = await initJudgeAssignments(taskId, mode, args);

  console.log("# CURRENT PHASE");
  console.log(result.phase);
  console.log("");
  console.log("# FUNCTION");
  console.log(result.function);
  console.log("");
  console.log("# FLOW");
  console.log(
    mode === "dry-run"
      ? "dry-run: derived judge assignment PDA(s), did not send transaction"
      : "execute: sent Anchor init_judge_assignment transaction(s), confirmed signature(s), fetched assignment state"
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
