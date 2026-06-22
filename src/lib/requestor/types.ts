export type RequestorTaskStatus =
  | "Draft"
  | "Open"
  | "InProgress"
  | "Submitted"
  | "Judged"
  | "Completed"
  | "Failed"
  | "Cancelled"
  | "Inconclusive";

export type SubmissionStatus =
  | "PendingJudgeReview"
  | "Accepted"
  | "Rejected"
  | "NeedsRevision";

export type JudgeStatus = "Ready" | "Reviewing" | "Completed";

export type SortOption = "newest" | "reward" | "deadline";

export type RequestorTaskIndexStatus =
  | "not_indexed"
  | "indexing"
  | "indexed"
  | "stale"
  | "index_failed";

export type RequestorJudge = {
  id: string;
  name: string;
  wallet: string;
  trustScore: number;
  reputation: string;
  status?: JudgeStatus;
  reviewProgress?: number;
};

export type RequestorSubmission = {
  id: string;
  taskId: string;
  taskTitle: string;
  workerName: string;
  workerWallet: string;
  title: string;
  status: SubmissionStatus;
  submittedAt: string;
  deadline: string;
  score?: number;
  comment?: string;
  decision?: string;
};

export type JudgingResult = {
  score: number;
  comment: string;
  decision: string;
};

export type RequestorTaskAccountLink = {
  label: string;
  address: string;
  url: string;
};

export type RequestorTask = {
  id: string;
  onChainTaskId?: string;
  title: string;
  shortDescription: string;
  description: string;
  skills: string[];
  deliverable: string;
  status: RequestorTaskStatus;
  rewardAmount: number;
  token: string;
  tokenMint?: string;
  requestor?: string;
  worker?: string;
  requestorTokenAccount?: string;
  workerStakeAmount?: number;
  requiredJudgesM?: number;
  approvalThresholdN?: number;
  submissionDeadline?: string;
  votingDeadline?: string;
  publicMetadataUri?: string;
  encryptedTaskDetailUri?: string;
  encryptedSubmissionUri?: string;
  network: string;
  deadline: string;
  escrowStatus: string;
  payoutStatus: string;
  createdAt: string;
  updatedAt: string;
  judges: RequestorJudge[];
  submissions: RequestorSubmission[];
  signature?: string;
  slot?: number;
  programId?: string;
  explorerTxUrl?: string;
  taskPda?: string;
  escrowTokenVault?: string;
  nftAsset?: string;
  accounts?: RequestorTaskAccountLink[];
  isSimulated?: boolean;
  payoutSignature?: string;
  payoutExplorerTxUrl?: string;
  payoutSlot?: number;
  payoutAccounts?: RequestorTaskAccountLink[];
  payoutIsSimulated?: boolean;
  indexStatus?: RequestorTaskIndexStatus;
  indexedSlot?: number;
  indexError?: string;
  result?: JudgingResult;
};

export const requestorStatusLabels: Record<RequestorTaskStatus, string> = {
  Draft: "Bản nháp",
  Open: "Đang mở",
  InProgress: "Đang thực hiện",
  Submitted: "Đã nộp",
  Judged: "Đã chấm",
  Completed: "Hoàn tất",
  Failed: "Thất bại",
  Cancelled: "Đã hủy",
  Inconclusive: "Không đủ kết luận",
};

export const submissionStatusLabels: Record<SubmissionStatus, string> = {
  PendingJudgeReview: "Chờ người chấm duyệt",
  Accepted: "Đã chấp nhận",
  Rejected: "Đã từ chối",
  NeedsRevision: "Cần chỉnh sửa",
};

export const requestorStatusOrder: RequestorTaskStatus[] = [
  "Draft",
  "Open",
  "InProgress",
  "Submitted",
  "Judged",
  "Completed",
  "Failed",
  "Cancelled",
  "Inconclusive",
];

export const judgeStatusLabels: Record<JudgeStatus, string> = {
  Ready: "Sẵn sàng",
  Reviewing: "Đang chấm",
  Completed: "Hoàn tất",
};