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
  worker?: string;
  requestorTokenAccount?: string;
  workerStakeAmount?: number;
  requiredJudgesM?: number;
  approvalThresholdN?: number;
  submissionDeadline?: string;
  votingDeadline?: string;
  publicMetadataUri?: string;
  encryptedTaskDetailUri?: string;
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

export const mockJudges: RequestorJudge[] = [
  {
    id: "judge-aurora",
    name: "Minh Anh",
    wallet: "8C9x...Qp21",
    trustScore: 96,
    reputation: "120 review đã xác thực",
  },
  {
    id: "judge-zen",
    name: "Quang Huy",
    wallet: "3R7p...Km44",
    trustScore: 91,
    reputation: "Chuyên audit frontend",
  },
  {
    id: "judge-lotus",
    name: "Lan Chi",
    wallet: "6P2n...Va80",
    trustScore: 88,
    reputation: "Web3 QA reviewer",
  },
  {
    id: "judge-nova",
    name: "Gia Bảo",
    wallet: "F12a...Yt09",
    trustScore: 84,
    reputation: "Smart contract workflow",
  },
];

const assignedJudges: RequestorJudge[] = [
  { ...mockJudges[0], status: "Completed", reviewProgress: 100 },
  { ...mockJudges[1], status: "Reviewing", reviewProgress: 70 },
];

export const mockRequestorTasks: RequestorTask[] = [
  {
    id: "REQ-1007",
    title: "Thiết kế dashboard staking cho agent",
    shortDescription:
      "Tạo UI dashboard giúp requestor theo dõi stake và reward theo task.",
    description:
      "Cần một dashboard responsive hiển thị reward đang khóa, trạng thái stake, submission mới và kết quả judge theo từng task.",
    skills: ["React", "Tailwind", "Web3 UX"],
    deliverable:
      "Prototype chạy được trong Next.js kèm trạng thái empty/loading/error.",
    status: "Submitted",
    rewardAmount: 2400,
    token: "USDC",
    network: "Solana Devnet",
    deadline: "2026-06-21T10:00:00.000Z",
    escrowStatus: "Reward đã khóa trong escrow",
    payoutStatus: "Chưa payout",
    createdAt: "2026-06-12T08:00:00.000Z",
    updatedAt: "2026-06-15T11:30:00.000Z",
    judges: assignedJudges,
    submissions: [
      {
        id: "SUB-301",
        taskId: "REQ-1007",
        taskTitle: "Thiết kế dashboard staking cho agent",
        workerName: "Worker Atlas",
        workerWallet: "4Kv9...Lq22",
        title: "Bản nộp dashboard v1",
        status: "PendingJudgeReview",
        submittedAt: "2026-06-15T10:20:00.000Z",
        deadline: "2026-06-21T10:00:00.000Z",
      },
      {
        id: "SUB-302",
        taskId: "REQ-1007",
        taskTitle: "Thiết kế dashboard staking cho agent",
        workerName: "Worker Node",
        workerWallet: "D81p...Fa73",
        title: "Bản nộp có demo mobile",
        status: "NeedsRevision",
        submittedAt: "2026-06-15T12:50:00.000Z",
        deadline: "2026-06-21T10:00:00.000Z",
        comment: "Cần bổ sung trạng thái lỗi khi không tải được dữ liệu.",
      },
    ],
  },
  {
    id: "REQ-1006",
    title: "Audit luồng tạo task và khóa reward",
    shortDescription: "Kiểm tra flow tạo task nhiều bước trước khi publish.",
    description:
      "Review UX và state management của flow tạo task, đảm bảo requestor không mất dữ liệu khi quay lại bước trước.",
    skills: ["QA", "React", "Form validation"],
    deliverable: "Checklist bug, ảnh minh họa và đề xuất sửa.",
    status: "Judged",
    rewardAmount: 1800,
    token: "USDC",
    network: "Solana Devnet",
    deadline: "2026-06-18T09:00:00.000Z",
    escrowStatus: "Reward đã khóa trong escrow",
    payoutStatus: "Sẵn sàng finalize payout",
    createdAt: "2026-06-10T07:30:00.000Z",
    updatedAt: "2026-06-15T09:10:00.000Z",
    judges: [
      { ...mockJudges[2], status: "Completed", reviewProgress: 100 },
      { ...mockJudges[3], status: "Completed", reviewProgress: 100 },
    ],
    submissions: [
      {
        id: "SUB-288",
        taskId: "REQ-1006",
        taskTitle: "Audit luồng tạo task và khóa reward",
        workerName: "Worker Delta",
        workerWallet: "A90x...Vb61",
        title: "Audit report final",
        status: "Accepted",
        submittedAt: "2026-06-14T15:45:00.000Z",
        deadline: "2026-06-18T09:00:00.000Z",
        score: 92,
        comment: "Đạt yêu cầu, phát hiện đúng các lỗi quan trọng.",
        decision: "Accepted",
      },
    ],
    result: {
      score: 92,
      comment: "Submission đáp ứng brief và có bằng chứng QA rõ ràng.",
      decision: "Accepted",
    },
  },
  {
    id: "REQ-1005",
    title: "Tối ưu card danh sách task",
    shortDescription: "Làm card task dễ scan hơn trên desktop và mobile.",
    description:
      "Cần cải thiện hierarchy, badge trạng thái, reward và deadline cho danh sách task requestor.",
    skills: ["UI design", "Responsive", "Tailwind"],
    deliverable: "Component card hoàn chỉnh và ghi chú responsive.",
    status: "InProgress",
    rewardAmount: 950,
    token: "USDC",
    network: "Solana Devnet",
    deadline: "2026-06-24T16:00:00.000Z",
    escrowStatus: "Reward đã khóa trong escrow",
    payoutStatus: "Chưa payout",
    createdAt: "2026-06-09T13:20:00.000Z",
    updatedAt: "2026-06-14T08:40:00.000Z",
    judges: [{ ...mockJudges[0], status: "Ready", reviewProgress: 0 }],
    submissions: [],
  },
  {
    id: "REQ-1004",
    title: "Viết test cho escrow state",
    shortDescription: "Bổ sung coverage cho các trạng thái reward escrow.",
    description:
      "Tạo test case cho reward đã khóa, chờ judge, finalize payout và completed.",
    skills: ["Testing", "TypeScript"],
    deliverable: "Test suite chạy được bằng script hiện có.",
    status: "Open",
    rewardAmount: 1200,
    token: "USDC",
    network: "Solana Devnet",
    deadline: "2026-06-28T12:00:00.000Z",
    escrowStatus: "Reward đã khóa trong escrow",
    payoutStatus: "Chưa payout",
    createdAt: "2026-06-08T09:15:00.000Z",
    updatedAt: "2026-06-08T09:15:00.000Z",
    judges: [{ ...mockJudges[1], status: "Ready", reviewProgress: 0 }],
    submissions: [],
  },
  {
    id: "REQ-1003",
    title: "Bản nháp tích hợp payout status",
    shortDescription: "Chuẩn bị brief cho màn payout sau khi judge xong.",
    description:
      "Mô tả cách hiển thị payout status cho requestor sau khi finalize.",
    skills: ["Product", "Web3 UX"],
    deliverable: "Brief rõ scope, edge case và trạng thái loading.",
    status: "Draft",
    rewardAmount: 700,
    token: "USDC",
    network: "Solana Devnet",
    deadline: "2026-07-02T09:00:00.000Z",
    escrowStatus: "Reward chưa khóa",
    payoutStatus: "Chưa payout",
    createdAt: "2026-06-06T10:30:00.000Z",
    updatedAt: "2026-06-12T16:20:00.000Z",
    judges: [],
    submissions: [],
  },
  {
    id: "REQ-1002",
    title: "Hoàn tất landing-free console",
    shortDescription:
      "Biến console dev thành màn làm việc trực tiếp, không marketing.",
    description:
      "Sắp xếp lại các action chính và trạng thái proof cho requestor.",
    skills: ["Next.js", "UX writing"],
    deliverable: "Màn console requestor đã kiểm tra responsive.",
    status: "Completed",
    rewardAmount: 1500,
    token: "USDC",
    network: "Solana Devnet",
    deadline: "2026-06-12T08:00:00.000Z",
    escrowStatus: "Escrow đã đóng",
    payoutStatus: "Payout đã hoàn tất",
    createdAt: "2026-06-01T08:00:00.000Z",
    updatedAt: "2026-06-12T08:30:00.000Z",
    judges: [{ ...mockJudges[2], status: "Completed", reviewProgress: 100 }],
    submissions: [
      {
        id: "SUB-201",
        taskId: "REQ-1002",
        taskTitle: "Hoàn tất landing-free console",
        workerName: "Worker Prime",
        workerWallet: "B91z...Tn12",
        title: "Console final",
        status: "Accepted",
        submittedAt: "2026-06-11T18:05:00.000Z",
        deadline: "2026-06-12T08:00:00.000Z",
        score: 95,
        comment: "Hoàn tất đúng scope.",
        decision: "Accepted",
      },
    ],
    result: {
      score: 95,
      comment: "Task hoàn tất và payout đã được ghi nhận.",
      decision: "Accepted",
    },
  },
];

export function getStoredRequestorTasks() {
  if (typeof window === "undefined") return mockRequestorTasks;

  try {
    const stored = getLocalRequestorTasksOnly();
    if (!stored.length) return mockRequestorTasks;
    return [
      ...stored,
      ...mockRequestorTasks.filter(
        (task) => !stored.some((item) => item.id === task.id)
      ),
    ];
  } catch {
    return mockRequestorTasks;
  }
}

export function getLocalRequestorTasksOnly() {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem("requestor.tasks");
    if (!raw) return [];
    return JSON.parse(raw) as RequestorTask[];
  } catch {
    return [];
  }
}

export function saveStoredRequestorTask(task: RequestorTask) {
  if (typeof window === "undefined") return;

  const tasks = getStoredRequestorTasks();
  const next = [
    task,
    ...tasks.filter(
      (item) =>
        item.id !== task.id &&
        !mockRequestorTasks.some((mock) => mock.id === item.id)
    ),
  ];
  window.localStorage.setItem("requestor.tasks", JSON.stringify(next));
}

export function getAllSubmissions(tasks: RequestorTask[]) {
  return tasks.flatMap((task) => task.submissions);
}
