export type TaskStatus =
  | "Open"
  | "InProgress"
  | "Resolving"
  | "Completed"
  | "Failed"
  | "Cancelled"
  | "Inconclusive";

export type VoteSide = "pass" | "fail";

export type IndexedTask = {
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
  status: TaskStatus;
  createdAt: Date;
  submissionDeadline: Date;
  votingDeadline: Date;
  lastSignature?: string;
  lastIndexedSlot?: number;
  lastIndexedCommitment?: "confirmed" | "finalized";
  programId?: string;
  decodedAccount?: Record<string, unknown>;
  updatedAt: Date;
};

export type ChainTaskSnapshot = {
  task: IndexedTask;
  slot: number;
  signature: string;
  commitment: "confirmed" | "finalized";
  programId: string;
  decodedAccount: Record<string, unknown>;
};

export type IndexedJudge = {
  judge: string;
  judgeRecordPda: string;
  amountStaked: string;
  isActive: boolean;
  totalAssignmentCount: number;
  lockedUntil?: Date;
  lastSignature?: string;
  updatedAt: Date;
};

export type IndexedJudgeAssignment = {
  taskPda: string;
  taskId: string;
  judge: string;
  assignmentPda: string;
  assignedOrder: number;
  assignedAt: Date;
  hasVoted: boolean;
  vote?: VoteSide;
  votedAt?: Date;
  hasClaimedFee: boolean;
  feeAmount?: string;
  lastSignature?: string;
  updatedAt: Date;
};

export type IndexedTransaction = {
  signature: string;
  isSimulated?: boolean;
  slot?: number;
  instruction: string;
  taskPda?: string;
  actor?: string;
  status: "confirmed" | "failed";
  error?: string;
  createdAt: Date;
};
