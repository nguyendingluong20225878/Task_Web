import { get, writable } from "svelte/store";
import type { IndexedTask } from "$lib/types/quests";

const now = Date.now();

const seedQuests: IndexedTask[] = [
  {
    taskPda: "TaskPdaOpen11111111111111111111111111111111",
    id: "1001",
    requestor: "QuestMaster111111111111111111111111111111",
    tokenMint: "USDCMint111111111111111111111111111111111",
    escrowTokenVault: "Vault1111111111111111111111111111111111",
    nftAsset: "Asset1111111111111111111111111111111111",
    bountyAmount: "250",
    judgeFeeBps: 500,
    workerStakeAmount: "1",
    requiredJudgesM: 3,
    approvalThresholdN: 2,
    passVoteCount: 0,
    failVoteCount: 0,
    assignedJudges: [],
    publicMetadataUri: "mock://metadata/1001",
    encryptedTaskDetailUri: "mock://payload/1001",
    status: "Open",
    createdAt: new Date(now - 1000 * 60 * 60 * 4),
    submissionDeadline: new Date(now + 1000 * 60 * 60 * 24 * 3),
    votingDeadline: new Date(now + 1000 * 60 * 60 * 24 * 5),
    title: "Build a market research scout",
    summary:
      "Create an AI agent that scans competitor pricing and returns a concise weekly signal pack.",
  },
  {
    taskPda: "TaskPdaProgress222222222222222222222222222222",
    id: "1002",
    requestor: "QuestMaster111111111111111111111111111111",
    worker: "WorkerBot2222222222222222222222222222222222",
    tokenMint: "USDCMint111111111111111111111111111111111",
    escrowTokenVault: "Vault2222222222222222222222222222222222",
    nftAsset: "Asset2222222222222222222222222222222222",
    bountyAmount: "420",
    judgeFeeBps: 500,
    workerStakeAmount: "2",
    requiredJudgesM: 3,
    approvalThresholdN: 2,
    passVoteCount: 0,
    failVoteCount: 0,
    assignedJudges: [],
    publicMetadataUri: "mock://metadata/1002",
    encryptedTaskDetailUri: "mock://payload/1002",
    status: "InProgress",
    createdAt: new Date(now - 1000 * 60 * 60 * 12),
    submissionDeadline: new Date(now + 1000 * 60 * 60 * 24),
    votingDeadline: new Date(now + 1000 * 60 * 60 * 48),
    title: "Summarize support tickets",
    summary:
      "Design a bot that clusters support tickets and produces product feedback themes.",
  },
];

function createQuestsStore() {
  const { subscribe, set, update } = writable<IndexedTask[]>(seedQuests);

  return {
    subscribe,
    set,
    addQuest: (quest: IndexedTask) => update((quests) => [quest, ...quests]),
    updateQuest: (taskPda: string, patch: Partial<IndexedTask>) =>
      update((quests) =>
        quests.map((quest) =>
          quest.taskPda === taskPda ? { ...quest, ...patch } : quest
        )
      ),
    getByPda: (taskPda: string) =>
      get({ subscribe }).find((quest) => quest.taskPda === taskPda),
  };
}

export const questsStore = createQuestsStore();
