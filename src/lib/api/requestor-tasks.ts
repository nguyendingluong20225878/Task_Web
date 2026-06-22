import {
  type RequestorTask,
  type RequestorTaskStatus,
} from "@/lib/requestor/types";

type IndexedTaskStatus =
  | "Open"
  | "InProgress"
  | "Resolving"
  | "Completed"
  | "Failed"
  | "Cancelled"
  | "Inconclusive";

export type IndexedRequestorTask = {
  taskPda: string;
  id: string;
  isSimulated?: boolean;
  requestor: string;
  worker?: string;
  tokenMint: string;
  escrowTokenVault: string;
  nftAsset: string;
  bountyAmount: string;
  judgeFeeBps: number;
  workerStakeAmount: string;
  requiredJudgesM: number;
  approvalThresholdN: number;
  passVoteCount: number;
  failVoteCount: number;
  assignedJudges: string[];
  publicMetadataUri: string;
  encryptedTaskDetailUri: string;
  encryptedSubmissionUri?: string;
  status: IndexedTaskStatus;
  createdAt: string;
  submissionDeadline: string;
  votingDeadline: string;
  lastSignature?: string;
  lastIndexedSlot?: number;
  lastIndexedCommitment?: "confirmed" | "finalized";
  programId?: string;
  decodedAccount?: Record<string, unknown>;
  updatedAt: string;
};

type RequestorTasksResponse =
  | { ok: true; tasks: IndexedRequestorTask[] }
  | { ok: false; message?: string; error?: { message?: string } };

function toIsoDate(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function toNumber(value: string | number | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapIndexedStatus(status: IndexedTaskStatus): RequestorTaskStatus {
  if (status === "Open") return "Open";
  if (status === "InProgress") return "InProgress";
  // Resolving means submissions are closed and votes are being collected.
  if (status === "Resolving") return "Submitted";
  if (status === "Completed") return "Completed";
  if (status === "Failed") return "Failed";
  if (status === "Cancelled") return "Cancelled";
  if (status === "Inconclusive") return "Inconclusive";
  return "Open";
}

function shortAddress(value: string) {
  if (!value) return "";
  if (value.length <= 12) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function explorerTxUrl(signature?: string) {
  return signature
    ? `https://explorer.solana.com/tx/${signature}?cluster=devnet`
    : undefined;
}

function explorerAccountUrl(address: string) {
  return `https://explorer.solana.com/address/${address}?cluster=devnet`;
}

export function mapIndexedTaskToRequestorTask(
  task: IndexedRequestorTask
): RequestorTask {
  const now = new Date().toISOString();
  const createdAt = toIsoDate(task.createdAt, now);
  const updatedAt = toIsoDate(task.updatedAt, createdAt);
  const submissionDeadline = toIsoDate(task.submissionDeadline, updatedAt);
  const votingDeadline = toIsoDate(task.votingDeadline, submissionDeadline);
  const metadataLabel =
    task.publicMetadataUri?.trim() || `Metadata ${shortAddress(task.taskPda)}`;

  return {
    id: `REQ-${task.id}`,
    onChainTaskId: task.id,
    title: `Task #${task.id}`,
    shortDescription: metadataLabel,
    description:
      task.publicMetadataUri?.trim() ||
      "Task đã được index từ MongoDB nhưng chưa có public metadata để hiển thị.",
    skills: [],
    deliverable: "Xem publicMetadataUri để biết yêu cầu bàn giao.",
    status: mapIndexedStatus(task.status),
    rewardAmount: toNumber(task.bountyAmount),
    token: "USDC",
    tokenMint: task.tokenMint,
    requestor: task.requestor,
    worker: task.worker,
    workerStakeAmount: toNumber(task.workerStakeAmount),
    requiredJudgesM: task.requiredJudgesM,
    approvalThresholdN: task.approvalThresholdN,
    submissionDeadline,
    votingDeadline,
    publicMetadataUri: task.publicMetadataUri,
    encryptedTaskDetailUri: task.encryptedTaskDetailUri,
    encryptedSubmissionUri: task.encryptedSubmissionUri,
    network: "Solana Devnet",
    deadline: submissionDeadline,
    escrowStatus:
      task.status === "Open"
        ? "Phần thưởng đã khóa trong escrow"
        : "Escrow đã ghi nhận on-chain",
    payoutStatus: task.status === "Completed" ? "Đã hoàn tất" : "Chưa payout",
    createdAt,
    updatedAt,
    judges: task.assignedJudges.map((judge, index) => ({
      id: judge,
      name: `Judge ${index + 1}`,
      wallet: judge,
      trustScore: 0,
      reputation: "Indexed on-chain",
      status: task.status === "Completed" ? "Completed" : "Ready",
      reviewProgress: task.status === "Completed" ? 100 : 0,
    })),
    submissions: [],
    signature: task.lastSignature,
    slot: task.lastIndexedSlot,
    programId: task.programId,
    explorerTxUrl: explorerTxUrl(task.lastSignature),
    taskPda: task.taskPda,
    escrowTokenVault: task.escrowTokenVault,
    nftAsset: task.nftAsset,
    accounts: [
      { label: "taskPda", address: task.taskPda, url: explorerAccountUrl(task.taskPda) },
      {
        label: "escrowTokenVault",
        address: task.escrowTokenVault,
        url: explorerAccountUrl(task.escrowTokenVault),
      },
      { label: "nftAsset", address: task.nftAsset, url: explorerAccountUrl(task.nftAsset) },
      { label: "tokenMint", address: task.tokenMint, url: explorerAccountUrl(task.tokenMint) },
    ].filter((account) => account.address),
    isSimulated: task.isSimulated,
    indexStatus: task.lastIndexedSlot ? "indexed" : "not_indexed",
    indexedSlot: task.lastIndexedSlot,
    indexError: undefined,
  };
}

export async function fetchRequestorTasks(requestorWallet: string) {
  const requestor = requestorWallet.trim();
  if (!requestor) return [];

  const response = await fetch(
    `/api/requestor/tasks?requestor=${encodeURIComponent(requestor)}`
  );
  const data = (await response.json().catch(() => null)) as
    | RequestorTasksResponse
    | null;

  if (!response.ok || !data?.ok) {
    const message =
      data && !data.ok
        ? data.message ?? data.error?.message
        : "Không tải được dữ liệu MongoDB.";
    throw new Error(message || "Không tải được dữ liệu MongoDB.");
  }

  return data.tasks.map(mapIndexedTaskToRequestorTask);
}
