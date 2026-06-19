import type { IndexedTask, TaskStatus } from "@/lib/server/db/models";

type DateLike = Date | string | number | null | undefined;

type WorkerTaskSourceDates = {
  createdAt?: DateLike;
  submissionDeadline?: DateLike;
  votingDeadline?: DateLike;
  updatedAt?: DateLike;
};

export type IndexedWorkerTask = Partial<
  Omit<
    IndexedTask,
    "createdAt" | "submissionDeadline" | "votingDeadline" | "updatedAt"
  >
> &
  WorkerTaskSourceDates & {
    indexStatus?: string;
    indexError?: string;
  };

export type WorkerTask = {
  id: string;
  onChainTaskId: string;
  taskPda?: string;
  requestor?: string;
  worker?: string;
  tokenMint?: string;
  escrowTokenVault?: string;
  nftAsset?: string;
  bountyAmount?: string;
  workerStakeAmount?: string;
  requiredJudgesM?: number;
  approvalThresholdN?: number;
  passVoteCount?: number;
  failVoteCount?: number;
  assignedJudges?: string[];
  publicMetadataUri?: string;
  encryptedTaskDetailUri?: string;
  encryptedSubmissionUri?: string;
  status: string;
  createdAt?: string;
  submissionDeadline?: string;
  votingDeadline?: string;
  lastSignature?: string;
  lastIndexedSlot?: number;
  indexStatus?: string;
  indexError?: string;
};

function toOptionalString(value: unknown) {
  if (value === null || value === undefined) return undefined;
  return String(value);
}

function toOptionalNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toOptionalIsoString(value: DateLike) {
  if (value === null || value === undefined || value === "") return undefined;

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function normalizeWallet(value?: string) {
  return value?.trim().toLowerCase();
}

function walletMatches(left?: string, right?: string) {
  const normalizedLeft = normalizeWallet(left);
  const normalizedRight = normalizeWallet(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

export function mapIndexedTaskToWorkerTask(task: IndexedWorkerTask): WorkerTask {
  const onChainTaskId = toOptionalString(task.id) ?? "";

  return {
    id: task.taskPda ? `WORKER-${task.taskPda}` : `WORKER-${onChainTaskId}`,
    onChainTaskId,
    taskPda: task.taskPda,
    requestor: task.requestor,
    worker: task.worker,
    tokenMint: task.tokenMint,
    escrowTokenVault: task.escrowTokenVault,
    nftAsset: task.nftAsset,
    bountyAmount: toOptionalString(task.bountyAmount),
    workerStakeAmount: toOptionalString(task.workerStakeAmount),
    requiredJudgesM: toOptionalNumber(task.requiredJudgesM),
    approvalThresholdN: toOptionalNumber(task.approvalThresholdN),
    passVoteCount: toOptionalNumber(task.passVoteCount),
    failVoteCount: toOptionalNumber(task.failVoteCount),
    assignedJudges: Array.isArray(task.assignedJudges) ? task.assignedJudges : undefined,
    publicMetadataUri: task.publicMetadataUri,
    encryptedTaskDetailUri: task.encryptedTaskDetailUri,
    encryptedSubmissionUri: task.encryptedSubmissionUri,
    status: task.status ?? "Open",
    createdAt: toOptionalIsoString(task.createdAt),
    submissionDeadline: toOptionalIsoString(task.submissionDeadline),
    votingDeadline: toOptionalIsoString(task.votingDeadline),
    lastSignature: task.lastSignature,
    lastIndexedSlot: toOptionalNumber(task.lastIndexedSlot),
    indexStatus: task.indexStatus ?? (task.lastSignature ? "indexed" : undefined),
    indexError: task.indexError,
  };
}

export function isOpenWorkerTask(task: Pick<WorkerTask, "status">) {
  return task.status === "Open";
}

export function isActiveWorkerTask(
  task: Pick<WorkerTask, "status" | "worker">,
  workerWallet?: string
) {
  const activeStatuses: TaskStatus[] = [
    "InProgress",
    "Resolving",
    "Completed",
    "Failed",
    "Inconclusive",
  ];

  if (!activeStatuses.includes(task.status as TaskStatus)) return false;
  return task.worker ? walletMatches(task.worker, workerWallet) : true;
}

export function canStakeTask(task: Pick<WorkerTask, "status">) {
  return task.status === "Open";
}

export function canSubmitTask(
  task: Pick<WorkerTask, "status" | "worker">,
  workerWallet?: string
) {
  if (task.status !== "InProgress") return false;
  return task.worker ? walletMatches(task.worker, workerWallet) : true;
}
