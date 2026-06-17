export type TaskStatus =
  | "Open"
  | "InProgress"
  | "Resolving"
  | "Completed"
  | "Failed"
  | "Cancelled"
  | "Inconclusive";

export type IndexedTask = {
  taskPda: string;
  id: string;
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
  status: TaskStatus;
  createdAt: Date;
  submissionDeadline: Date;
  votingDeadline: Date;
  title?: string;
  summary?: string;
};

export type InitializeQuestParams = {
  title: string;
  summary: string;
  publicMetadataUri: string;
  encryptedTaskDetailUri: string;
  bountyAmount: string;
  workerStakeAmount: string;
  submissionDeadline: Date;
  votingDeadline: Date;
  requiredJudgesM: number;
  approvalThresholdN: number;
};
