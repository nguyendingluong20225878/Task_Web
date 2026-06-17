import * as anchorPkg from "@coral-xyz/anchor";
import type { Idl } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  Transaction,
  VersionedTransaction,
  type ConnectionConfig,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Connection } from "@solana/web3.js";
import idl from "../../../target/idl/task_contract.json";
import type { IndexedTask, TaskStatus } from "@/lib/types/quests";

type SignableTransaction = Transaction | VersionedTransaction;

export type AnchorWalletLike = {
  publicKey: PublicKey;
  signTransaction: <T extends SignableTransaction>(transaction: T) => Promise<T>;
  signAllTransactions?: <T extends SignableTransaction>(transactions: T[]) => Promise<T[]>;
};

const { AnchorProvider, BN, Program } = anchorPkg;
const textEncoder = new TextEncoder();

export const RPC_URL = "https://api.devnet.solana.com";
export const PROGRAM_ID = new PublicKey("DaLMrhPAinDFFmJeeccN9nCPwFs2UNhBvDBpr6dqwjZB");
export const DEMO_TOKEN_MINT = "GW7391EnGsU5oksJPQibH8ky5iUA2njTiobhb7bjji1B";
export const MPL_CORE_PROGRAM_ID = new PublicKey("CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d");
export const DEFAULT_PUBLIC_KEY = new PublicKey("11111111111111111111111111111111");

const commitment: ConnectionConfig["commitment"] = "confirmed";

export const connection = new Connection(RPC_URL, commitment);

export type AnyProgram = {
  methods: Record<string, (...args: unknown[]) => any>;
  account: Record<string, any>;
  programId: PublicKey;
};

export type TxProof = {
  signature: string;
  explorerTxUrl: string;
  slot?: number;
  isSimulated: false;
};

export type AccountLink = {
  label: string;
  address: string;
  url: string;
};

export type Web3Result = TxProof & {
  taskId: string;
  taskPda: string;
  accounts: AccountLink[];
  [key: string]: unknown;
};

export function explorerTxUrl(signature: string) {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

export function explorerAccountUrl(address: string) {
  return `https://explorer.solana.com/address/${address}?cluster=devnet`;
}

export function accountLink(label: string, address: PublicKey | string): AccountLink {
  const base58 = typeof address === "string" ? address : address.toBase58();
  return { label, address: base58, url: explorerAccountUrl(base58) };
}

export function createProvider(wallet: AnchorWalletLike) {
  if (!wallet.publicKey) {
    throw new Error("Connect Phantom before sending a Devnet transaction.");
  }
  const provider = new AnchorProvider(connection, wallet as never, {
    commitment,
    preflightCommitment: commitment,
  });
  return provider;
}

export function createProgram(wallet: AnchorWalletLike) {
  return new Program(idl as Idl, createProvider(wallet)) as AnyProgram;
}

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
  return PublicKey.findProgramAddressSync([textEncoder.encode("task"), taskIdToSeed(taskId)], programId)[0];
}

export function deriveEscrowTokenVault(taskPda: PublicKey, programId = PROGRAM_ID) {
  return PublicKey.findProgramAddressSync([textEncoder.encode("vault"), taskPda.toBuffer()], programId)[0];
}

export function deriveWorkerEscrow(taskId: string, worker: PublicKey, programId = PROGRAM_ID) {
  return PublicKey.findProgramAddressSync(
    [textEncoder.encode("escrow"), taskIdToSeed(taskId), worker.toBuffer()],
    programId
  )[0];
}

export function deriveSystemConfig(programId = PROGRAM_ID) {
  return PublicKey.findProgramAddressSync([textEncoder.encode("system_config")], programId)[0];
}

export function deriveJudgeRegistry(programId = PROGRAM_ID) {
  return PublicKey.findProgramAddressSync([textEncoder.encode("judge_registry")], programId)[0];
}

export function deriveJudgeStakeVault(programId = PROGRAM_ID) {
  return PublicKey.findProgramAddressSync([textEncoder.encode("judge_stake_vault")], programId)[0];
}

export function deriveJudgeRecord(judge: PublicKey, programId = PROGRAM_ID) {
  return PublicKey.findProgramAddressSync(
    [textEncoder.encode("judge_record"), judge.toBuffer()],
    programId
  )[0];
}

export function deriveJudgeAssignment(taskId: string, judge: PublicKey, programId = PROGRAM_ID) {
  return PublicKey.findProgramAddressSync(
    [textEncoder.encode("task_judge"), taskIdToSeed(taskId), judge.toBuffer()],
    programId
  )[0];
}

export function getAssociatedTokenAddress(owner: PublicKey, mint: PublicKey) {
  return getAssociatedTokenAddressSync(mint, owner, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
}

export async function confirmSignature(signature: string): Promise<number | undefined> {
  const latestBlockhash = await connection.getLatestBlockhash(commitment);
  await connection.confirmTransaction({ signature, ...latestBlockhash }, commitment);
  const status = await connection.getSignatureStatuses([signature]);
  return status.value[0]?.slot;
}

export async function sendTransactionWithWallet(wallet: AnchorWalletLike, transaction: Transaction) {
  if (!wallet.publicKey) throw new Error("Connect Phantom first.");
  transaction.feePayer = wallet.publicKey;
  transaction.recentBlockhash = (await connection.getLatestBlockhash(commitment)).blockhash;
  const signed = await wallet.signTransaction(transaction);
  const signature = await connection.sendRawTransaction(signed.serialize(), {
    preflightCommitment: commitment,
  });
  const slot = await confirmSignature(signature);
  return { signature, slot };
}

export async function validateTokenAccount(params: {
  tokenAccount: PublicKey;
  owner: PublicKey;
  mint: PublicKey;
  minimumAmount?: bigint;
}) {
  const account = await getAccount(connection, params.tokenAccount, commitment, TOKEN_PROGRAM_ID);
  if (!account.owner.equals(params.owner)) {
    throw new Error("InvalidTokenAccount: token account owner is not the connected wallet.");
  }
  if (!account.mint.equals(params.mint)) {
    throw new Error("InvalidTokenAccount: token account mint does not match tokenMint.");
  }
  if (params.minimumAmount !== undefined && account.amount < params.minimumAmount) {
    throw new Error("InvalidTokenAccount: token account balance is below the required amount.");
  }
  return account;
}

export async function createAssociatedTokenAccountForConnectedWallet(wallet: AnchorWalletLike, mintValue: string) {
  if (!wallet.publicKey) throw new Error("Connect Phantom first.");
  const mint = new PublicKey(mintValue);
  const ata = getAssociatedTokenAddress(wallet.publicKey, mint);
  const existing = await connection.getAccountInfo(ata, commitment);
  if (existing) {
    return {
      signature: "",
      slot: undefined,
      associatedTokenAccount: ata.toBase58(),
      alreadyExists: true,
      explorerTxUrl: "",
      isSimulated: false as const,
    };
  }
  const transaction = new Transaction().add(
    createAssociatedTokenAccountInstruction(
      wallet.publicKey,
      ata,
      wallet.publicKey,
      mint,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  );
  const { signature, slot } = await sendTransactionWithWallet(wallet, transaction);
  return {
    signature,
    slot,
    associatedTokenAccount: ata.toBase58(),
    alreadyExists: false,
    explorerTxUrl: explorerTxUrl(signature),
    isSimulated: false as const,
  };
}

export function normalizeStatus(status: unknown): TaskStatus {
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
  if (value && typeof (value as { toString: () => string }).toString === "function") {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
}

function readString(value: unknown) {
  if (value instanceof PublicKey) return value.toBase58();
  if (value instanceof BN) return value.toString();
  return String(value ?? "");
}

function activeAssignedJudges(task: any) {
  const count = readNumber(task.assignedJudgeCount);
  return ((task.assignedJudges ?? []) as PublicKey[])
    .slice(0, count)
    .filter((judge) => judge && !judge.equals(DEFAULT_PUBLIC_KEY));
}

export function accountToIndexedTask(taskPda: PublicKey, account: any): IndexedTask {
  const taskId = readString(account.id);
  return {
    taskPda: taskPda.toBase58(),
    id: taskId,
    requestor: readString(account.requestor),
    worker: account.worker && !account.worker.equals(DEFAULT_PUBLIC_KEY) ? readString(account.worker) : undefined,
    tokenMint: readString(account.tokenMint),
    escrowTokenVault: readString(account.escrowTokenVault),
    nftAsset: readString(account.nftAsset),
    bountyAmount: readString(account.bountyAmount),
    judgeFeeBps: readNumber(account.judgeFeeBps),
    workerStakeAmount: readString(account.workerStakeAmount),
    requiredJudgesM: readNumber(account.requiredJudgesM),
    approvalThresholdN: readNumber(account.approvalThresholdN),
    passVoteCount: readNumber(account.passVoteCount),
    failVoteCount: readNumber(account.failVoteCount),
    assignedJudges: activeAssignedJudges(account).map((judge) => judge.toBase58()),
    publicMetadataUri: readString(account.publicMetadataUri),
    encryptedTaskDetailUri: readString(account.encryptedTaskDetailUri),
    encryptedSubmissionUri: readString(account.encryptedSubmissionUri) || undefined,
    status: normalizeStatus(account.status),
    createdAt: new Date(readNumber(account.createdAt) * 1000),
    submissionDeadline: new Date(readNumber(account.submissionDeadline) * 1000),
    votingDeadline: new Date(readNumber(account.votingDeadline) * 1000),
  };
}

export async function fetchTask(program: AnyProgram, taskId: string): Promise<IndexedTask> {
  const taskPda = deriveTaskPda(taskId, program.programId);
  const account = await program.account.task.fetch(taskPda);
  return accountToIndexedTask(taskPda, account);
}

export async function fetchTasks(program: AnyProgram): Promise<IndexedTask[]> {
  const accounts = await program.account.task.all();
  return accounts.map((entry: { publicKey: PublicKey; account: any }) =>
    accountToIndexedTask(entry.publicKey, entry.account)
  );
}

export async function fetchWorkerTasks(program: AnyProgram, workerPubkey: string): Promise<IndexedTask[]> {
  const allTasks = await fetchTasks(program);
  return allTasks.filter((task: IndexedTask) => task.worker === workerPubkey);
}

export async function fetchSystemConfig(program: AnyProgram) {
  const systemConfig = deriveSystemConfig(program.programId);
  const account = await program.account.systemConfig.fetch(systemConfig);
  return { address: systemConfig.toBase58(), account };
}

export async function fetchJudgeRegistry(program: AnyProgram) {
  const judgeRegistry = deriveJudgeRegistry(program.programId);
  const account = await program.account.judgeRegistry.fetch(judgeRegistry);
  const activeCount = readNumber(account.activeCount);
  const judges = ((account.judges ?? []) as PublicKey[])
    .slice(0, activeCount)
    .filter((judge) => judge && !judge.equals(DEFAULT_PUBLIC_KEY))
    .map((judge) => judge.toBase58());
  return { address: judgeRegistry.toBase58(), activeCount, judges, account };
}

export async function fetchJudgeRecord(program: AnyProgram, judgeValue: string) {
  const judge = new PublicKey(judgeValue);
  const judgeRecord = deriveJudgeRecord(judge, program.programId);
  const info = await connection.getAccountInfo(judgeRecord, commitment);
  if (!info) return { address: judgeRecord.toBase58(), exists: false, account: null };
  const account = await program.account.judgeRecord.fetch(judgeRecord);
  return { address: judgeRecord.toBase58(), exists: true, account };
}

export async function fetchJudgeAssignment(program: AnyProgram, taskId: string, judgeValue: string) {
  const judge = new PublicKey(judgeValue);
  const judgeAssignment = deriveJudgeAssignment(taskId, judge, program.programId);
  const info = await connection.getAccountInfo(judgeAssignment, commitment);
  if (!info) return { address: judgeAssignment.toBase58(), exists: false, account: null };
  const account = await program.account.taskJudgeAssignment.fetch(judgeAssignment);
  return { address: judgeAssignment.toBase58(), exists: true, account };
}

function proof(signature: string, slot?: number): TxProof {
  return {
    signature,
    slot,
    explorerTxUrl: explorerTxUrl(signature),
    isSimulated: false,
  };
}

export function mapSolanaError(caught: unknown) {
  const raw = caught instanceof Error ? caught.message : String(caught);
  const known = [
    "UnauthorizedAdmin",
    "NotEnoughJudges",
    "InvalidTokenAccount",
    "InvalidStatus",
    "DeadlinePassed",
    "AlreadyVoted",
    "AlreadyClaimed",
    "AssignmentSetIncomplete",
    "account already in use",
    "already in use",
    "User rejected",
    "rejected",
  ];
  const hit = known.find((token) => raw.toLowerCase().includes(token.toLowerCase()));
  if (hit) return `${hit}: ${raw}`;
  return raw;
}

export type InitializeTaskInput = {
  taskId: string;
  tokenMint: string;
  requestorTokenAccount: string;
  bountyAmount: string;
  workerStakeAmount: string;
  requiredJudgesM: number;
  approvalThresholdN: number;
  submissionDeadline: Date;
  votingDeadline: Date;
  publicMetadataUri: string;
  encryptedTaskDetailUri: string;
  encryptedSubmissionUri?: string;
};

export async function initializeTask(wallet: AnchorWalletLike, input: InitializeTaskInput): Promise<Web3Result> {
  if (!wallet.publicKey) throw new Error("Connect Phantom first.");
  const program = createProgram(wallet);
  const creator = wallet.publicKey;
  const tokenMint = new PublicKey(input.tokenMint);
  const creatorTokenAccount = new PublicKey(input.requestorTokenAccount);
  const taskPda = deriveTaskPda(input.taskId, program.programId);
  const escrowTokenVault = deriveEscrowTokenVault(taskPda, program.programId);
  const nftAsset = Keypair.generate();
  const systemConfig = deriveSystemConfig(program.programId);

  await validateTokenAccount({
    tokenAccount: creatorTokenAccount,
    owner: creator,
    mint: tokenMint,
    minimumAmount: BigInt(input.bountyAmount),
  });

  const signature = await program.methods
    .initializeTask(
      new BN(input.taskId),
      new BN(input.bountyAmount),
      new BN(input.workerStakeAmount),
      input.requiredJudgesM,
      input.approvalThresholdN,
      [
        new BN(Math.floor(input.submissionDeadline.getTime() / 1000)),
        new BN(Math.floor(input.votingDeadline.getTime() / 1000)),
      ],
      input.publicMetadataUri,
      input.encryptedTaskDetailUri,
      input.encryptedSubmissionUri ?? ""
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
  const slot = await confirmSignature(signature);

  return {
    ...proof(signature, slot),
    taskId: input.taskId,
    taskPda: taskPda.toBase58(),
    escrowTokenVault: escrowTokenVault.toBase58(),
    nftAsset: nftAsset.publicKey.toBase58(),
    accounts: [
      accountLink("taskPda", taskPda),
      accountLink("escrowTokenVault", escrowTokenVault),
      accountLink("nftAsset", nftAsset.publicKey),
      accountLink("requestorTokenAccount", creatorTokenAccount),
    ],
  };
}

export async function cancelOpenTask(
  wallet: AnchorWalletLike,
  taskId: string,
  requestorTokenAccountValue?: string
): Promise<Web3Result> {
  if (!wallet.publicKey) throw new Error("Connect Phantom first.");
  const program = createProgram(wallet);
  const task = await fetchTask(program, taskId);
  const requestorTokenAccount = requestorTokenAccountValue
    ? new PublicKey(requestorTokenAccountValue)
    : getAssociatedTokenAddress(wallet.publicKey, new PublicKey(task.tokenMint));

  await validateTokenAccount({
    tokenAccount: requestorTokenAccount,
    owner: wallet.publicKey,
    mint: new PublicKey(task.tokenMint),
  });

  const signature = await program.methods
    .cancelOpenTask()
    .accounts({
      requestor: wallet.publicKey,
      task: new PublicKey(task.taskPda),
      escrowTokenVault: new PublicKey(task.escrowTokenVault),
      requestorTokenAccount,
      nftAsset: new PublicKey(task.nftAsset),
      coreProgram: MPL_CORE_PROGRAM_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  const slot = await confirmSignature(signature);
  return {
    ...proof(signature, slot),
    taskId,
    taskPda: task.taskPda,
    accounts: [
      accountLink("taskPda", task.taskPda),
      accountLink("escrowTokenVault", task.escrowTokenVault),
      accountLink("nftAsset", task.nftAsset),
      accountLink("requestorTokenAccount", requestorTokenAccount),
    ],
  };
}

export async function stakeToUnlock(wallet: AnchorWalletLike, taskId: string): Promise<Web3Result> {
  if (!wallet.publicKey) throw new Error("Connect Phantom first.");
  const program = createProgram(wallet);
  const taskPda = deriveTaskPda(taskId, program.programId);
  const workerEscrow = deriveWorkerEscrow(taskId, wallet.publicKey, program.programId);
  const signature = await program.methods
    .stakeToUnlock()
    .accounts({
      worker: wallet.publicKey,
      task: taskPda,
      workerEscrow,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  const slot = await confirmSignature(signature);
  return {
    ...proof(signature, slot),
    taskId,
    taskPda: taskPda.toBase58(),
    workerEscrow: workerEscrow.toBase58(),
    accounts: [accountLink("taskPda", taskPda), accountLink("workerEscrow", workerEscrow)],
  };
}

export async function submitAndAssign(wallet: AnchorWalletLike, taskId: string, encryptedSubmissionUri: string) {
  if (!wallet.publicKey) throw new Error("Connect Phantom first.");
  const program = createProgram(wallet);
  const taskPda = deriveTaskPda(taskId, program.programId);
  const systemConfig = deriveSystemConfig(program.programId);
  const judgeRegistry = deriveJudgeRegistry(program.programId);
  const registry = await fetchJudgeRegistry(program);
  const judgeRecords = registry.judges.map((judge) =>
    deriveJudgeRecord(new PublicKey(judge), program.programId)
  );

  const signature = await program.methods
    .submitAndAssign(encryptedSubmissionUri)
    .accounts({
      worker: wallet.publicKey,
      task: taskPda,
      systemConfig,
      judgeRegistry,
      systemProgram: SystemProgram.programId,
    })
    .remainingAccounts(judgeRecords.map((pubkey) => ({ pubkey, isWritable: true, isSigner: false })))
    .rpc();
  const slot = await confirmSignature(signature);
  const task = await fetchTask(program, taskId);
  return {
    ...proof(signature, slot),
    taskId,
    taskPda: taskPda.toBase58(),
    assignedJudges: task.assignedJudges,
    accounts: [
      accountLink("taskPda", taskPda),
      accountLink("systemConfig", systemConfig),
      accountLink("judgeRegistry", judgeRegistry),
      ...judgeRecords.map((record, index) => accountLink(`judgeRecord${index + 1}`, record)),
    ],
  };
}

export async function judgeRegister(wallet: AnchorWalletLike, stakeAmount: string): Promise<Web3Result> {
  if (!wallet.publicKey) throw new Error("Connect Phantom first.");
  const program = createProgram(wallet);
  const systemConfig = deriveSystemConfig(program.programId);
  const judgeRegistry = deriveJudgeRegistry(program.programId);
  const judgeRecord = deriveJudgeRecord(wallet.publicKey, program.programId);
  const judgeStakeVault = deriveJudgeStakeVault(program.programId);
  const signature = await program.methods
    .judgeRegister(new BN(stakeAmount))
    .accounts({
      judge: wallet.publicKey,
      systemConfig,
      judgeRegistry,
      judgeRecord,
      judgeStakeVault,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  const slot = await confirmSignature(signature);
  return {
    ...proof(signature, slot),
    taskId: "",
    taskPda: "",
    judgeRecord: judgeRecord.toBase58(),
    accounts: [
      accountLink("judgeRecord", judgeRecord),
      accountLink("judgeRegistry", judgeRegistry),
      accountLink("judgeStakeVault", judgeStakeVault),
    ],
  };
}

export async function initJudgeAssignment(wallet: AnchorWalletLike, taskId: string, judgeValue?: string) {
  if (!wallet.publicKey) throw new Error("Connect Phantom first.");
  const program = createProgram(wallet);
  const task = await fetchTask(program, taskId);
  const judges = judgeValue ? [judgeValue] : task.assignedJudges;
  if (!judges.length) throw new Error("AssignmentSetIncomplete: no assigned judges found on task.");
  const results: Web3Result[] = [];

  for (const judgeAddress of judges) {
    const judge = new PublicKey(judgeAddress);
    const taskPda = new PublicKey(task.taskPda);
    const judgeAssignment = deriveJudgeAssignment(taskId, judge, program.programId);
    const signature = await program.methods
      .initJudgeAssignment()
      .accounts({
        payer: wallet.publicKey,
        judge,
        task: taskPda,
        judgeAssignment,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    const slot = await confirmSignature(signature);
    results.push({
      ...proof(signature, slot),
      taskId,
      taskPda: task.taskPda,
      judge: judge.toBase58(),
      judgeAssignment: judgeAssignment.toBase58(),
      accounts: [accountLink("taskPda", taskPda), accountLink("judgeAssignment", judgeAssignment)],
    });
  }
  return results;
}

export async function judgeVote(wallet: AnchorWalletLike, taskId: string, isPass: boolean): Promise<Web3Result> {
  if (!wallet.publicKey) throw new Error("Connect Phantom first.");
  const program = createProgram(wallet);
  const taskPda = deriveTaskPda(taskId, program.programId);
  const judgeRecord = deriveJudgeRecord(wallet.publicKey, program.programId);
  const judgeAssignment = deriveJudgeAssignment(taskId, wallet.publicKey, program.programId);
  const signature = await program.methods
    .judgeVote(isPass)
    .accounts({
      judge: wallet.publicKey,
      task: taskPda,
      judgeRecord,
      judgeAssignment,
    })
    .rpc();
  const slot = await confirmSignature(signature);
  return {
    ...proof(signature, slot),
    taskId,
    taskPda: taskPda.toBase58(),
    vote: isPass ? "pass" : "fail",
    accounts: [
      accountLink("taskPda", taskPda),
      accountLink("judgeRecord", judgeRecord),
      accountLink("judgeAssignment", judgeAssignment),
    ],
  };
}

export async function settlePayment(
  wallet: AnchorWalletLike,
  taskId: string,
  workerTokenAccountValue: string,
  requestorTokenAccountValue: string
): Promise<Web3Result> {
  if (!wallet.publicKey) throw new Error("Connect Phantom first.");
  const program = createProgram(wallet);
  const task = await fetchTask(program, taskId);
  if (!task.worker) throw new Error("InvalidStatus: task has no worker.");
  const taskPda = new PublicKey(task.taskPda);
  const worker = new PublicKey(task.worker);
  const workerEscrow = deriveWorkerEscrow(taskId, worker, program.programId);
  const workerTokenAccount = new PublicKey(workerTokenAccountValue);
  const requestorTokenAccount = new PublicKey(requestorTokenAccountValue);
  const judgeAssignments = task.assignedJudges.map((judge) =>
    deriveJudgeAssignment(taskId, new PublicKey(judge), program.programId)
  );
  const signature = await program.methods
    .settlePayment()
    .accounts({
      payer: wallet.publicKey,
      requestor: new PublicKey(task.requestor),
      task: taskPda,
      workerEscrow,
      escrowTokenVault: new PublicKey(task.escrowTokenVault),
      workerTokenAccount,
      requestorTokenAccount,
      nftAsset: new PublicKey(task.nftAsset),
      workerSystemAccount: worker,
      coreProgram: MPL_CORE_PROGRAM_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .remainingAccounts(judgeAssignments.map((pubkey) => ({ pubkey, isWritable: true, isSigner: false })))
    .rpc();
  const slot = await confirmSignature(signature);
  return {
    ...proof(signature, slot),
    taskId,
    taskPda: task.taskPda,
    accounts: [
      accountLink("taskPda", taskPda),
      accountLink("workerEscrow", workerEscrow),
      accountLink("workerTokenAccount", workerTokenAccount),
      accountLink("requestorTokenAccount", requestorTokenAccount),
      ...judgeAssignments.map((assignment, index) => accountLink(`judgeAssignment${index + 1}`, assignment)),
    ],
  };
}

export async function claimJudgeFee(
  wallet: AnchorWalletLike,
  taskId: string,
  judgeTokenAccountValue: string
): Promise<Web3Result> {
  if (!wallet.publicKey) throw new Error("Connect Phantom first.");
  const program = createProgram(wallet);
  const task = await fetchTask(program, taskId);
  const taskPda = new PublicKey(task.taskPda);
  const judgeAssignment = deriveJudgeAssignment(taskId, wallet.publicKey, program.programId);
  const judgeTokenAccount = new PublicKey(judgeTokenAccountValue);
  const signature = await program.methods
    .claimJudgeFee()
    .accounts({
      judge: wallet.publicKey,
      task: taskPda,
      judgeAssignment,
      escrowTokenVault: new PublicKey(task.escrowTokenVault),
      judgeTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
  const slot = await confirmSignature(signature);
  return {
    ...proof(signature, slot),
    taskId,
    taskPda: task.taskPda,
    accounts: [
      accountLink("taskPda", taskPda),
      accountLink("judgeAssignment", judgeAssignment),
      accountLink("judgeTokenAccount", judgeTokenAccount),
    ],
  };
}
