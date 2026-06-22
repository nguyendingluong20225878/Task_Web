import type { IndexedTask } from "@/lib/server/db/models";

type SerializableTask = Omit<IndexedTask, "createdAt" | "submissionDeadline" | "votingDeadline" | "updatedAt" | "decodedAccount"> & {
  createdAt: string; submissionDeadline: string; votingDeadline: string; updatedAt: string;
};

function base(task: IndexedTask) {
  return {
    taskPda: task.taskPda, id: task.id, requestor: task.requestor, worker: task.worker,
    tokenMint: task.tokenMint, bountyAmount: task.bountyAmount, workerStakeAmount: task.workerStakeAmount,
    requiredJudgesM: task.requiredJudgesM, approvalThresholdN: task.approvalThresholdN,
    publicMetadataUri: task.publicMetadataUri, status: task.status,
    createdAt: task.createdAt.toISOString(), submissionDeadline: task.submissionDeadline.toISOString(),
    votingDeadline: task.votingDeadline.toISOString(), updatedAt: task.updatedAt.toISOString(),
  };
}
export function toPublicTaskDto(task: IndexedTask) { return base(task); }
export function toActiveWorkerTaskDto(task: IndexedTask) { return { ...base(task), encryptedTaskDetailUri: task.encryptedTaskDetailUri }; }
export function toRequestorTaskDto(task: IndexedTask): SerializableTask {
  return { ...base(task), escrowTokenVault: task.escrowTokenVault, nftAsset: task.nftAsset,
    judgeFeeBps: task.judgeFeeBps, passVoteCount: task.passVoteCount, failVoteCount: task.failVoteCount,
    assignedJudges: task.assignedJudges, encryptedTaskDetailUri: task.encryptedTaskDetailUri,
    encryptedSubmissionUri: task.encryptedSubmissionUri, lastSignature: task.lastSignature,
    lastIndexedSlot: task.lastIndexedSlot, lastIndexedCommitment: task.lastIndexedCommitment,
    programId: task.programId, isSimulated: task.isSimulated };
}
