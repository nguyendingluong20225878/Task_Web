"use client";

import "@/lib/polyfills";
import { PublicKey } from "@solana/web3.js";
import { useAnchorWallet, useWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";
import { useRouter } from "next/compat/router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ClipboardList,
  Coins,
  Eye,
  FilePlus2,
  Lock,
  Search,
  Send,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SoftCard } from "@/components/ui/card";
import { Field, FieldLabel, Input } from "@/components/ui/form";
import { Pagination } from "@/components/ui/pagination";
import { indexTaskAfterTransaction } from "@/lib/api/chain-index";
import { fetchRequestorTasks } from "@/lib/api/requestor-tasks";
import { useRoleState } from "@/lib/auth/role-state";
import {
  getAllSubmissions,
  getLocalRequestorTasksOnly,
  getStoredRequestorTasks,
  mockRequestorTasks,
  mockJudges,
  requestorStatusLabels,
  requestorStatusOrder,
  saveStoredRequestorTask,
  submissionStatusLabels,
  type RequestorJudge,
  type RequestorSubmission,
  type RequestorTask,
  type RequestorTaskStatus,
  type SortOption,
  type SubmissionStatus,
} from "@/lib/requestor/mock-data";
import {
  DEMO_TOKEN_MINT,
  PROGRAM_ID,
  RPC_URL,
  createAssociatedTokenAccountForConnectedWallet,
  explorerAccountUrl,
  getAssociatedTokenAddress,
  initializeTask,
  mapSolanaError,
  settlePayment,
  type AnchorWalletLike,
  type Web3Result,
} from "@/lib/solana/client";
import { cn } from "@/lib/utils";

const PAGE_SIZE_OPTIONS = [10, 20, 50];
const sortLabels: Record<SortOption, string> = {
  newest: "Mới nhất",
  reward: "Thưởng cao nhất",
  deadline: "Hạn gần nhất",
};
const PUBLIC_METADATA_URI_PREFIXES = ["ipfs://", "ar://", "https://", "local://"];
const ENCRYPTED_DETAIL_URI_PREFIXES = [
  "enc://",
  "ipfs://",
  "ar://",
  "https://",
  "local://",
];

const judgeStatusLabels: Record<
  NonNullable<RequestorJudge["status"]>,
  string
> = {
  Ready: "Sẵn sàng",
  Reviewing: "Đang chấm",
  Completed: "Hoàn tất",
};

function formatCurrency(value: number, token = "USDC") {
  return `${new Intl.NumberFormat("vi-VN").format(value)} ${token}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function toDatetimeLocal(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

function isAllowedStorageUri(value: string, prefixes: string[]) {
  const trimmed = value.trim();
  return Boolean(trimmed) && prefixes.some((prefix) => trimmed.startsWith(prefix));
}

function statusTone(status: RequestorTaskStatus | SubmissionStatus) {
  if (status === "Completed" || status === "Accepted") return "bg-[#79F2C0]";
  if (status === "Judged" || status === "PendingJudgeReview")
    return "bg-[#FFD84D]";
  if (status === "Rejected") return "bg-[#FF6B8A]";
  if (status === "NeedsRevision") return "bg-white";
  return "bg-[#FFFDF3]";
}

function ExplorerLink({ href, value }: { href: string; value: string }) {
  return (
    <a
      className="break-all underline decoration-2 underline-offset-4"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {value}
    </a>
  );
}

function ProofValue({
  label,
  value,
  href,
}: {
  label: string;
  value?: string | number | boolean;
  href?: string;
}) {
  if (value === undefined || value === null || value === "") return null;
  const text = String(value);

  return (
    <SoftCard className="p-3 font-bold">
      <p className="mb-1 text-xs font-black uppercase">{label}</p>
      {href ? <ExplorerLink href={href} value={text} /> : <p className="break-all">{text}</p>}
    </SoftCard>
  );
}

function IndexStatusNotice({ task }: { task: RequestorTask }) {
  if (task.indexStatus === "indexed") {
    return (
      <SoftCard className="border-[#79F2C0] bg-[#ECFFF6] p-3 font-bold">
        <p className="font-black">MongoDB indexed</p>
        {task.indexedSlot ? (
          <p className="mt-1 text-sm">Indexed slot: {task.indexedSlot}</p>
        ) : null}
      </SoftCard>
    );
  }

  if (task.indexStatus === "stale" || task.indexStatus === "index_failed") {
    return (
      <SoftCard className="border-[#FFD84D] bg-[#FFF7C7] p-3 font-bold">
        <p className="font-black">
          On-chain success, but MongoDB indexing is stale.
        </p>
        {task.indexError ? (
          <p className="mt-1 break-all text-sm">{task.indexError}</p>
        ) : null}
      </SoftCard>
    );
  }

  return null;
}

function DataSourceWarning({ message }: { message?: string }) {
  if (!message) return null;

  return (
    <SoftCard className="border-[#FFD84D] bg-[#FFF7C7] p-4 font-bold">
      {message}
    </SoftCard>
  );
}

function mergeRequestorTasks(
  indexedTasks: RequestorTask[],
  localTasks: RequestorTask[]
) {
  const localFallbackTasks = localTasks.filter(
    (task) =>
      task.status === "Draft" ||
      task.indexStatus === "stale" ||
      task.indexStatus === "index_failed"
  );
  const seen = new Set<string>();
  const merged: RequestorTask[] = [];

  for (const task of [...indexedTasks, ...localFallbackTasks]) {
    const key =
      task.status === "Draft" ? task.id : task.onChainTaskId || task.taskPda || task.id;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(task);
  }

  return sortTasks(merged, "newest");
}

function useRequestorTasks() {
  const [tasks, setTasks] = useState<RequestorTask[]>(mockRequestorTasks);
  const [isLoading, setIsLoading] = useState(false);
  const [sourceWarning, setSourceWarning] = useState("");
  const { activeRole, walletAddress } = useRoleState();

  useEffect(() => {
    let cancelled = false;
    const localTasks = getLocalRequestorTasksOnly();
    const localWithMockFallback = getStoredRequestorTasks();

    setTasks(localWithMockFallback);
    setSourceWarning("");

    if (!walletAddress || activeRole !== "requestor") {
      return () => {
        cancelled = true;
      };
    }

    setIsLoading(true);
    fetchRequestorTasks(walletAddress)
      .then((indexedTasks) => {
        if (cancelled) return;
        const merged = mergeRequestorTasks(indexedTasks, localTasks);
        setTasks(merged.length ? merged : localWithMockFallback);
      })
      .catch(() => {
        if (cancelled) return;
        setTasks(localWithMockFallback);
        setSourceWarning(
          "Không tải được dữ liệu MongoDB, đang dùng dữ liệu local/demo."
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeRole, walletAddress]);

  return { tasks, setTasks, isLoading, sourceWarning };
}

function usePagination<T>(items: T[]) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);

  useEffect(() => {
    setPage(1);
  }, [items, pageSize]);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedItems = items.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  );

  return {
    page: safePage,
    pageSize,
    paginatedItems,
    setPage,
    setPageSize,
  };
}

function sortTasks(tasks: RequestorTask[], sortBy: SortOption) {
  return [...tasks].sort((a, b) => {
    if (sortBy === "reward") return b.rewardAmount - a.rewardAmount;
    if (sortBy === "deadline")
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function filterTasks(
  tasks: RequestorTask[],
  search: string,
  status: RequestorTaskStatus | "all",
  sortBy: SortOption
) {
  const query = search.trim().toLowerCase();
  return sortTasks(
    tasks.filter((task) => {
      const matchesStatus = status === "all" || task.status === status;
      const matchesSearch =
        !query ||
        task.title.toLowerCase().includes(query) ||
        task.id.toLowerCase().includes(query) ||
        task.shortDescription.toLowerCase().includes(query);
      return matchesStatus && matchesSearch;
    }),
    sortBy
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
      <div>
        {eyebrow ? (
          <p className="mb-1 text-xs font-black uppercase">{eyebrow}</p>
        ) : null}
        <h1 className="text-3xl font-black">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-3xl font-bold">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

function EmptyState({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <SoftCard className="grid min-h-44 place-items-center p-6 text-center">
      <div>
        <p className="text-xl font-black">{title}</p>
        <p className="mt-2 font-bold">Chưa có dữ liệu</p>
        {action ? (
          <div className="mt-4 flex justify-center">{action}</div>
        ) : null}
      </div>
    </SoftCard>
  );
}

function StatusBadge({ status }: { status: RequestorTaskStatus }) {
  return (
    <Badge className={statusTone(status)}>
      {requestorStatusLabels[status]}
    </Badge>
  );
}

function SubmissionBadge({ status }: { status: SubmissionStatus }) {
  return (
    <Badge className={statusTone(status)}>
      {submissionStatusLabels[status]}
    </Badge>
  );
}

function TaskCard({ task }: { task: RequestorTask }) {
  return (
    <SoftCard className="grid gap-3 p-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={task.status} />
            <span className="text-sm font-black">{task.id}</span>
          </div>
          <h3 className="mt-2 text-xl font-black">{task.title}</h3>
          <p className="mt-1 font-bold">{task.shortDescription}</p>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link href={`/requestor/tasks/${task.id}`}>
            <Eye className="size-4" />
            Xem
          </Link>
        </Button>
      </div>
      <div className="grid gap-2 text-sm font-bold md:grid-cols-4">
        <p>
          <strong>Thưởng:</strong>{" "}
          {formatCurrency(task.rewardAmount, task.token)}
        </p>
        <p>
          <strong>Hạn nộp:</strong> {formatDate(task.deadline)}
        </p>
        <p>
          <strong>Người chấm:</strong> {task.judges.length || "Chưa chọn"}
        </p>
        <p>
          <strong>Bài nộp:</strong> {task.submissions.length}
        </p>
      </div>
    </SoftCard>
  );
}

function RequestorPageFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen">
      <div className="mx-auto flex w-[min(1180px,calc(100%-32px))] flex-col gap-4 py-7">
        {children}
      </div>
    </main>
  );
}

export function RequestorDashboardPage() {
  const { tasks, isLoading, sourceWarning } = useRequestorTasks();
  const submissions = useMemo(() => getAllSubmissions(tasks), [tasks]);
  const recentTasks = useMemo(
    () => sortTasks(tasks, "newest").slice(0, 5),
    [tasks]
  );
  const latestSubmissions = useMemo(
    () =>
      [...submissions]
        .sort(
          (a, b) =>
            new Date(b.submittedAt).getTime() -
            new Date(a.submittedAt).getTime()
        )
        .slice(0, 5),
    [submissions]
  );
  const lockedReward = tasks
    .filter((task) => task.escrowStatus.toLowerCase().includes("khóa"))
    .reduce((total, task) => total + task.rewardAmount, 0);
  const pendingSubmissions = submissions.filter(
    (submission) => submission.status === "PendingJudgeReview"
  ).length;
  const completedTasks = tasks.filter(
    (task) => task.status === "Completed"
  ).length;

  return (
    <RequestorPageFrame>
      <Card className="p-5">
        <SectionHeader
          eyebrow="Requestor"
          title="Dashboard tổng quan"
          description="Theo dõi task đã đăng, reward đang khóa, submission mới và trạng thái payout từ một màn làm việc."
          action={
            <Button asChild>
              <Link href="/requestor/tasks/create">
                <FilePlus2 className="size-4" />
                Tạo task mới
              </Link>
            </Button>
          }
        />
      </Card>

      {isLoading ? (
        <SoftCard className="p-4 font-black">Đang tải dữ liệu...</SoftCard>
      ) : null}
      <DataSourceWarning message={sourceWarning} />

      <div className="grid gap-3 md:grid-cols-4">
        {[
          { label: "Task đã đăng", value: tasks.length, icon: ClipboardList },
          {
            label: "Thưởng đang khóa",
            value: formatCurrency(lockedReward),
            icon: Lock,
          },
          {
            label: "Submission chờ xử lý",
            value: pendingSubmissions,
            icon: Send,
          },
          { label: "Đã hoàn thành", value: completedTasks, icon: Check },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-black uppercase">{item.label}</p>
                <Icon className="size-5" />
              </div>
              <p className="mt-3 text-2xl font-black">{item.value}</p>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-2xl font-black">Task gần đây</h2>
            <Button asChild variant="secondary" size="sm">
              <Link href="/requestor/tasks">Xem tất cả</Link>
            </Button>
          </div>
          <div className="grid gap-3">
            {recentTasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-2xl font-black">Submission mới nhất</h2>
            <Button asChild variant="secondary" size="sm">
              <Link href="/requestor/submissions">Theo dõi</Link>
            </Button>
          </div>
          <SubmissionList submissions={latestSubmissions} compact />
        </Card>
      </div>
    </RequestorPageFrame>
  );
}

export function RequestorTasksPage() {
  const { tasks, isLoading, sourceWarning } = useRequestorTasks();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<RequestorTaskStatus | "all">("all");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const filteredTasks = useMemo(
    () => filterTasks(tasks, search, status, sortBy),
    [tasks, search, status, sortBy]
  );
  const pagination = usePagination(filteredTasks);

  return (
    <RequestorPageFrame>
      <Card className="p-5">
        <SectionHeader
          eyebrow="Requestor"
          title="Task đã tạo"
          description="Quản lý task từ bản nháp đến completed, kèm trạng thái escrow và submission."
          action={
            <Button asChild>
              <Link href="/requestor/tasks/create">
                <FilePlus2 className="size-4" />
                Tạo task mới
              </Link>
            </Button>
          }
        />
      </Card>

      <Card className="grid gap-4 p-5">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={status === "all" ? "default" : "secondary"}
            size="sm"
            onClick={() => setStatus("all")}
          >
            Tất cả
          </Button>
          {requestorStatusOrder.map((item) => (
            <Button
              key={item}
              variant={status === item ? "default" : "secondary"}
              size="sm"
              onClick={() => setStatus(item)}
            >
              {requestorStatusLabels[item]}
            </Button>
          ))}
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_220px_220px]">
          <Field>
            <FieldLabel>Tìm theo tên task</FieldLabel>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 size-4" />
              <Input
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Nhập tên task hoặc mã task"
              />
            </div>
          </Field>
          <Field>
            <FieldLabel>Lọc theo trạng thái</FieldLabel>
            <select
              className="min-h-10 rounded-lg border-2 border-slate-950 bg-[#FFFDF3] px-3 py-2 font-bold outline-none focus:bg-white focus-visible:ring-4 focus-visible:ring-[#FFD84D] focus-visible:ring-offset-2"
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as RequestorTaskStatus | "all")
              }
            >
              <option value="all">Tất cả trạng thái</option>
              {requestorStatusOrder.map((item) => (
                <option key={item} value={item}>
                  {requestorStatusLabels[item]}
                </option>
              ))}
            </select>
          </Field>
          <Field>
            <FieldLabel>Sắp xếp</FieldLabel>
            <select
              className="min-h-10 rounded-lg border-2 border-slate-950 bg-[#FFFDF3] px-3 py-2 font-bold outline-none focus:bg-white focus-visible:ring-4 focus-visible:ring-[#FFD84D] focus-visible:ring-offset-2"
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as SortOption)}
            >
              {Object.entries(sortLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Card>

      {isLoading ? (
        <SoftCard className="p-4 font-black">Đang tải dữ liệu...</SoftCard>
      ) : null}
      <DataSourceWarning message={sourceWarning} />
      {!isLoading && tasks.length === 0 ? (
        <EmptyState
          title="Bạn chưa tạo task nào"
          action={
            <Button asChild>
              <Link href="/requestor/tasks/create">Tạo task đầu tiên</Link>
            </Button>
          }
        />
      ) : filteredTasks.length === 0 ? (
        <EmptyState title="Không tìm thấy task phù hợp" />
      ) : (
        <>
          <div className="grid gap-3">
            {pagination.paginatedItems.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
          <Pagination
            page={pagination.page}
            pageSize={pagination.pageSize}
            total={filteredTasks.length}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
          />
        </>
      )}
    </RequestorPageFrame>
  );
}

type CreateTaskForm = {
  taskId: string;
  title: string;
  shortDescription: string;
  description: string;
  skills: string;
  deliverable: string;
  rewardAmount: string;
  token: string;
  tokenMint: string;
  requestorTokenAccount: string;
  workerStakeAmount: string;
  requiredJudgesM: string;
  approvalThresholdN: string;
  submissionDeadline: string;
  votingDeadline: string;
  publicMetadataUri: string;
  encryptedTaskDetailUri: string;
  network: string;
  deadline: string;
  escrowNote: string;
  judgeIds: string[];
};

type PublishPhase =
  | "idle"
  | "preparing"
  | "sending"
  | "confirming"
  | "indexing"
  | "success"
  | "error";

type DetailActionStatus =
  | "idle"
  | "publishing"
  | "indexing"
  | "success"
  | "error";

type PayoutPhase =
  | "idle"
  | "preparing"
  | "sending"
  | "confirming"
  | "indexing"
  | "success"
  | "error";

function createInitialCreateForm(): CreateTaskForm {
  const timestamp = Date.now();
  const submissionDeadline = toDatetimeLocal(
    new Date(timestamp + 2 * 86400_000)
  );
  const votingDeadline = toDatetimeLocal(new Date(timestamp + 3 * 86400_000));

  return {
    taskId: String(timestamp),
    title: "",
    shortDescription: "",
    description: "",
    skills: "",
    deliverable: "",
    rewardAmount: "",
    token: "USDC",
    tokenMint: DEMO_TOKEN_MINT,
    requestorTokenAccount: "",
    workerStakeAmount: "1",
    requiredJudgesM: "1",
    approvalThresholdN: "1",
    submissionDeadline,
    votingDeadline,
    publicMetadataUri: `ipfs://task-${timestamp}`,
    encryptedTaskDetailUri: `enc://task-detail-${timestamp}`,
    network: "Solana Devnet",
    deadline: submissionDeadline,
    escrowNote: "Phần thưởng sẽ được khóa trong escrow khi đăng task.",
    judgeIds: [],
  };
}

function publishPhaseLabel(phase: PublishPhase) {
  if (phase === "preparing") return "preparing";
  if (phase === "sending") return "sending transaction";
  if (phase === "confirming") return "confirming transaction";
  if (phase === "indexing") return "Saving to MongoDB";
  if (phase === "success") return "success";
  if (phase === "error") return "error";
  return "";
}

function readStoredOnChainTaskId(task: RequestorTask) {
  return (
    task.onChainTaskId ??
    (task as RequestorTask & { taskId?: string }).taskId ??
    ""
  );
}

function payoutPhaseLabel(phase: PayoutPhase) {
  if (phase === "preparing") return "preparing payout";
  if (phase === "sending") return "sending transaction";
  if (phase === "confirming") return "confirming transaction";
  if (phase === "indexing") return "saving to MongoDB";
  if (phase === "success") return "success";
  if (phase === "error") return "error";
  return "";
}

function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "min-h-28 w-full rounded-lg border-2 border-slate-950 bg-[#FFFDF3] px-3 py-2 outline-none focus:bg-white focus-visible:ring-4 focus-visible:ring-[#FFD84D] focus-visible:ring-offset-2",
        className
      )}
    />
  );
}

export function RequestorCreateTaskPage() {
  const router = useRouter();
  const anchorWallet = useAnchorWallet();
  const { publicKey } = useWallet();
  const wallet = anchorWallet as AnchorWalletLike | undefined;
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<CreateTaskForm>(() =>
    createInitialCreateForm()
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [ataLoading, setAtaLoading] = useState(false);
  const [ataStatus, setAtaStatus] = useState("");
  const [publishPhase, setPublishPhase] = useState<PublishPhase>("idle");
  const [publishError, setPublishError] = useState("");
  const steps = [
    "Thông tin task",
    "Thưởng và hạn nộp",
    "Chọn người chấm",
    "Xem lại và đăng",
  ];

  function update<K extends keyof CreateTaskForm>(
    key: K,
    value: CreateTaskForm[K]
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
  }

  function updateDeadline(value: string) {
    setForm((current) => ({
      ...current,
      deadline: value,
      submissionDeadline: value,
    }));
    setErrors((current) => ({
      ...current,
      deadline: "",
      submissionDeadline: "",
    }));
  }

  function isValidDateTime(value: string) {
    return Boolean(value) && !Number.isNaN(new Date(value).getTime());
  }

  function isFiniteNumericString(value: string) {
    return Boolean(value.trim()) && Number.isFinite(Number(value));
  }

  function validate(targetStep = step, full = false) {
    const nextErrors: Record<string, string> = {};

    if (targetStep === 0) {
      if (!form.title.trim()) nextErrors.title = "Vui lòng nhập tên task.";
      if (!form.shortDescription.trim())
        nextErrors.shortDescription = "Vui lòng nhập mô tả ngắn.";
      if (!form.description.trim())
        nextErrors.description = "Vui lòng nhập mô tả chi tiết.";
      if (!form.skills.trim())
        nextErrors.skills = "Vui lòng nhập kỹ năng yêu cầu.";
      if (!form.deliverable.trim())
        nextErrors.deliverable = "Vui lòng nhập kết quả bàn giao mong muốn.";
    }

    if (targetStep === 1) {
      if (
        !isFiniteNumericString(form.rewardAmount) ||
        Number(form.rewardAmount) <= 0
      )
        nextErrors.rewardAmount = "Số thưởng base units phải lớn hơn 0.";
      if (!form.deadline) nextErrors.deadline = "Vui lòng chọn hạn nộp.";
      if (!form.token.trim()) nextErrors.token = "Vui lòng chọn token.";
      if (!form.network.trim()) nextErrors.network = "Vui lòng chọn mạng.";

      if (full) {
        if (!form.taskId.trim() || !/^\d+$/.test(form.taskId.trim()))
          nextErrors.taskId = "taskId phải là chuỗi số và không được trống.";
        if (!form.tokenMint.trim())
          nextErrors.tokenMint = "Vui lòng nhập token mint.";
        if (!form.requestorTokenAccount.trim())
          nextErrors.requestorTokenAccount =
            "Vui lòng nhập hoặc tìm requestor token account.";
        if (
          !isFiniteNumericString(form.workerStakeAmount) ||
          Number(form.workerStakeAmount) < 0
        )
          nextErrors.workerStakeAmount =
            "workerStakeAmount phải lớn hơn hoặc bằng 0.";
        if (
          !isFiniteNumericString(form.requiredJudgesM) ||
          Number(form.requiredJudgesM) <= 0
        )
          nextErrors.requiredJudgesM = "requiredJudgesM phải lớn hơn 0.";
        if (
          !isFiniteNumericString(form.approvalThresholdN) ||
          Number(form.approvalThresholdN) <= 0
        )
          nextErrors.approvalThresholdN = "approvalThresholdN phải lớn hơn 0.";
        if (!isValidDateTime(form.submissionDeadline))
          nextErrors.submissionDeadline =
            "submissionDeadline phải là thời gian hợp lệ.";
        if (!isValidDateTime(form.votingDeadline)) {
          nextErrors.votingDeadline =
            "votingDeadline phải là thời gian hợp lệ.";
        } else if (
          isValidDateTime(form.submissionDeadline) &&
          new Date(form.votingDeadline).getTime() <=
            new Date(form.submissionDeadline).getTime()
        ) {
          nextErrors.votingDeadline =
            "votingDeadline phải sau submissionDeadline.";
        }
        if (
          !isAllowedStorageUri(form.publicMetadataUri, PUBLIC_METADATA_URI_PREFIXES)
        )
          nextErrors.publicMetadataUri =
            "URI public metadata phải bắt đầu bằng ipfs://, ar://, https:// hoặc local://.";
        if (
          !isAllowedStorageUri(
            form.encryptedTaskDetailUri,
            ENCRYPTED_DETAIL_URI_PREFIXES
          )
        )
          nextErrors.encryptedTaskDetailUri =
            "URI encrypted/private payload phải bắt đầu bằng enc://, ipfs://, ar://, https:// hoặc local://.";
      }
    }

    if (targetStep === 2 && form.judgeIds.length === 0) {
      nextErrors.judgeIds = "Vui lòng chọn ít nhất một người chấm.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function goNext() {
    if (!validate(step)) return;
    setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  function selectedJudges() {
    return mockJudges.filter((judge) => form.judgeIds.includes(judge.id));
  }

  function findRequestorAta() {
    setAtaStatus("");
    setErrors((current) => ({ ...current, requestorTokenAccount: "" }));
    if (!publicKey) {
      setErrors((current) => ({
        ...current,
        requestorTokenAccount: "Connect wallet trước khi Find ATA.",
      }));
      return;
    }

    try {
      const ata = getAssociatedTokenAddress(
        publicKey,
        new PublicKey(form.tokenMint)
      ).toBase58();
      update("requestorTokenAccount", ata);
      setAtaStatus("Đã derive ATA từ wallet hiện tại.");
    } catch (caught) {
      setErrors((current) => ({
        ...current,
        requestorTokenAccount: mapSolanaError(caught),
      }));
    }
  }

  async function createRequestorAta() {
    setAtaStatus("");
    setErrors((current) => ({ ...current, requestorTokenAccount: "" }));
    if (!wallet) {
      setErrors((current) => ({
        ...current,
        requestorTokenAccount: "Connect wallet trước khi Create ATA.",
      }));
      return;
    }

    setAtaLoading(true);
    try {
      const result = await createAssociatedTokenAccountForConnectedWallet(
        wallet,
        form.tokenMint
      );
      update("requestorTokenAccount", result.associatedTokenAccount);
      setAtaStatus(
        result.alreadyExists
          ? "ATA đã tồn tại, đã điền vào form."
          : "Đã tạo ATA trên Devnet và điền vào form."
      );
    } catch (caught) {
      setErrors((current) => ({
        ...current,
        requestorTokenAccount: mapSolanaError(caught),
      }));
    } finally {
      setAtaLoading(false);
    }
  }

  function buildTask(
    status: RequestorTaskStatus,
    proofResult?: Web3Result
  ): RequestorTask {
    const now = new Date().toISOString();
    const id = `REQ-${String(Date.now()).slice(-5)}`;
    const isDraft = status === "Draft";

    return {
      id,
      title: form.title.trim() || "Bản nháp chưa đặt tên",
      shortDescription: form.shortDescription.trim() || "Chưa có mô tả ngắn.",
      description: form.description.trim() || "Chưa có mô tả chi tiết.",
      skills: form.skills
        .split(",")
        .map((skill) => skill.trim())
        .filter(Boolean),
      deliverable: form.deliverable.trim() || "Chưa có kết quả bàn giao.",
      status,
      onChainTaskId: form.taskId.trim(),
      rewardAmount: Number(form.rewardAmount) || 0,
      token: form.token.trim() || "USDC",
      tokenMint: form.tokenMint.trim(),
      requestorTokenAccount: form.requestorTokenAccount.trim(),
      workerStakeAmount: Number(form.workerStakeAmount) || 0,
      requiredJudgesM: Number(form.requiredJudgesM) || 0,
      approvalThresholdN: Number(form.approvalThresholdN) || 0,
      submissionDeadline: form.submissionDeadline
        ? new Date(form.submissionDeadline).toISOString()
        : now,
      votingDeadline: form.votingDeadline
        ? new Date(form.votingDeadline).toISOString()
        : now,
      publicMetadataUri: form.publicMetadataUri.trim(),
      encryptedTaskDetailUri: form.encryptedTaskDetailUri.trim(),
      network: form.network.trim() || "Solana Devnet",
      deadline: form.deadline ? new Date(form.deadline).toISOString() : now,
      escrowStatus: isDraft
        ? "Phần thưởng chưa khóa"
        : "Phần thưởng đã khóa trong escrow",
      payoutStatus: "Chưa payout",
      createdAt: now,
      updatedAt: now,
      judges: selectedJudges().map((judge) => ({
        ...judge,
        status: "Ready",
        reviewProgress: 0,
      })),
      submissions: [],
      signature: proofResult?.signature,
      slot: proofResult?.slot,
      explorerTxUrl: proofResult?.explorerTxUrl,
      taskPda: proofResult?.taskPda,
      escrowTokenVault:
        typeof proofResult?.escrowTokenVault === "string"
          ? proofResult.escrowTokenVault
          : undefined,
      nftAsset:
        typeof proofResult?.nftAsset === "string"
          ? proofResult.nftAsset
          : undefined,
      accounts: proofResult?.accounts,
      isSimulated: proofResult?.isSimulated,
    };
  }

  function saveDraft() {
    const task = buildTask("Draft");

    saveStoredRequestorTask(task);
    void router?.push(`/requestor/tasks/${task.id}`);
  }

  async function publishTask() {
    setPublishError("");
    setPublishPhase("idle");

    for (let index = 0; index < 3; index += 1) {
      if (!validate(index, true)) {
        setStep(index);
        return;
      }
    }

    if (!wallet) {
      setPublishPhase("error");
      setPublishError("Connect wallet trước khi đăng task lên Solana Devnet.");
      return;
    }

    try {
      setPublishPhase("preparing");
      await Promise.resolve();
      setPublishPhase("sending");
      await Promise.resolve();
      setPublishPhase("confirming");
      const proofResult = await initializeTask(wallet, {
        taskId: form.taskId.trim(),
        tokenMint: form.tokenMint.trim(),
        requestorTokenAccount: form.requestorTokenAccount.trim(),
        bountyAmount: form.rewardAmount.trim(),
        workerStakeAmount: form.workerStakeAmount.trim(),
        requiredJudgesM: Number(form.requiredJudgesM),
        approvalThresholdN: Number(form.approvalThresholdN),
        submissionDeadline: new Date(form.submissionDeadline || form.deadline),
        votingDeadline: new Date(form.votingDeadline),
        publicMetadataUri: form.publicMetadataUri.trim(),
        encryptedTaskDetailUri: form.encryptedTaskDetailUri.trim(),
      });
      let task = buildTask("Open", proofResult);

      setPublishPhase("indexing");
      try {
        const indexed = await indexTaskAfterTransaction({
          taskId: form.taskId.trim(),
          signature: proofResult.signature,
          instruction: "initialize_task",
          actor: wallet.publicKey.toBase58(),
          slot: proofResult.slot,
        });
        task = {
          ...task,
          indexStatus: "indexed",
          indexedSlot: indexed.indexedSlot,
          indexError: undefined,
        };
      } catch (indexCaught) {
        task = {
          ...task,
          indexStatus: "index_failed",
          indexError:
            indexCaught instanceof Error
              ? indexCaught.message
              : String(indexCaught),
        };
      }

      saveStoredRequestorTask(task);
      setPublishPhase("success");
      void router?.push(`/requestor/tasks/${task.id}`);
    } catch (caught) {
      setPublishPhase("error");
      setPublishError(mapSolanaError(caught));
    }
  }

  const isPublishing =
    publishPhase === "preparing" ||
    publishPhase === "sending" ||
    publishPhase === "confirming" ||
    publishPhase === "indexing";
  const publishMessage = publishPhaseLabel(publishPhase);

  return (
    <RequestorPageFrame>
      <Card className="p-5">
        <SectionHeader
          eyebrow="Requestor"
          title="Tạo task mới"
          description="Điền brief, reward, deadline và judge. Dữ liệu không mất khi chuyển bước trong wizard."
        />
      </Card>

      <Card className="p-5">
        <div className="mb-5 grid gap-2 md:grid-cols-4">
          {steps.map((label, index) => (
            <div
              key={label}
              className={cn(
                "rounded-lg border-2 border-slate-950 bg-white p-3 font-black",
                step === index && "bg-[#FFD84D]"
              )}
            >
              <span className="text-xs uppercase">Bước {index + 1}</span>
              <p>{label}</p>
            </div>
          ))}
        </div>

        {step === 0 ? (
          <div className="grid gap-3">
            <Field>
              <FieldLabel>Tên task</FieldLabel>
              <Input
                value={form.title}
                onChange={(event) => update("title", event.target.value)}
              />
              <ErrorText value={errors.title} />
            </Field>
            <Field>
              <FieldLabel>Mô tả ngắn</FieldLabel>
              <Input
                value={form.shortDescription}
                onChange={(event) =>
                  update("shortDescription", event.target.value)
                }
              />
              <ErrorText value={errors.shortDescription} />
            </Field>
            <Field>
              <FieldLabel>Mô tả chi tiết</FieldLabel>
              <Textarea
                value={form.description}
                onChange={(event) => update("description", event.target.value)}
              />
              <ErrorText value={errors.description} />
            </Field>
            <Field>
              <FieldLabel>Kỹ năng yêu cầu</FieldLabel>
              <Input
                value={form.skills}
                onChange={(event) => update("skills", event.target.value)}
                placeholder="React, Tailwind, QA"
              />
              <ErrorText value={errors.skills} />
            </Field>
            <Field>
              <FieldLabel>Kết quả bàn giao mong muốn</FieldLabel>
              <Textarea
                value={form.deliverable}
                onChange={(event) => update("deliverable", event.target.value)}
              />
              <ErrorText value={errors.deliverable} />
            </Field>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="grid gap-3 md:grid-cols-2">
            <Field>
              <FieldLabel>Số thưởng (base units)</FieldLabel>
              <Input
                type="number"
                min="0"
                value={form.rewardAmount}
                onChange={(event) => update("rewardAmount", event.target.value)}
              />
              <ErrorText value={errors.rewardAmount} />
            </Field>
            <Field>
              <FieldLabel>Token</FieldLabel>
              <Input
                value={form.token}
                onChange={(event) => update("token", event.target.value)}
              />
              <ErrorText value={errors.token} />
            </Field>
            <Field>
              <FieldLabel>Mạng</FieldLabel>
              <Input
                value={form.network}
                onChange={(event) => update("network", event.target.value)}
              />
              <ErrorText value={errors.network} />
            </Field>
            <Field>
              <FieldLabel>Hạn nộp</FieldLabel>
              <Input
                type="datetime-local"
                value={form.deadline}
                onChange={(event) => updateDeadline(event.target.value)}
              />
              <ErrorText value={errors.deadline} />
            </Field>
            <Field>
              <FieldLabel>taskId</FieldLabel>
              <Input
                inputMode="numeric"
                value={form.taskId}
                onChange={(event) => update("taskId", event.target.value)}
              />
              <ErrorText value={errors.taskId} />
            </Field>
            <Field>
              <FieldLabel>tokenMint</FieldLabel>
              <Input
                value={form.tokenMint}
                onChange={(event) => update("tokenMint", event.target.value)}
              />
              <ErrorText value={errors.tokenMint} />
            </Field>
            <Field className="md:col-span-2">
              <FieldLabel>requestorTokenAccount</FieldLabel>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                <Input
                  className="min-w-0"
                  value={form.requestorTokenAccount}
                  onChange={(event) =>
                    update("requestorTokenAccount", event.target.value)
                  }
                />
                <Button variant="secondary" onClick={findRequestorAta}>
                  Find ATA
                </Button>
                <Button
                  variant="secondary"
                  disabled={ataLoading}
                  onClick={createRequestorAta}
                >
                  {ataLoading ? "Creating..." : "Create ATA"}
                </Button>
              </div>
              <ErrorText value={errors.requestorTokenAccount} />
              {ataStatus ? (
                <span className="text-sm font-black text-emerald-700">
                  {ataStatus}
                </span>
              ) : null}
            </Field>
            <Field>
              <FieldLabel>workerStakeAmount</FieldLabel>
              <Input
                type="number"
                min="0"
                value={form.workerStakeAmount}
                onChange={(event) =>
                  update("workerStakeAmount", event.target.value)
                }
              />
              <ErrorText value={errors.workerStakeAmount} />
            </Field>
            <Field>
              <FieldLabel>requiredJudgesM</FieldLabel>
              <Input
                type="number"
                min="1"
                value={form.requiredJudgesM}
                onChange={(event) =>
                  update("requiredJudgesM", event.target.value)
                }
              />
              <ErrorText value={errors.requiredJudgesM} />
            </Field>
            <Field>
              <FieldLabel>approvalThresholdN</FieldLabel>
              <Input
                type="number"
                min="1"
                value={form.approvalThresholdN}
                onChange={(event) =>
                  update("approvalThresholdN", event.target.value)
                }
              />
              <ErrorText value={errors.approvalThresholdN} />
            </Field>
            <Field>
              <FieldLabel>submissionDeadline</FieldLabel>
              <Input
                type="datetime-local"
                value={form.submissionDeadline}
                onChange={(event) =>
                  update("submissionDeadline", event.target.value)
                }
              />
              <ErrorText value={errors.submissionDeadline} />
            </Field>
            <Field>
              <FieldLabel>votingDeadline</FieldLabel>
              <Input
                type="datetime-local"
                value={form.votingDeadline}
                onChange={(event) =>
                  update("votingDeadline", event.target.value)
                }
              />
              <ErrorText value={errors.votingDeadline} />
            </Field>
            <Field>
              <FieldLabel>
                Public metadata URI: URI public metadata ghi on-chain
              </FieldLabel>
              <Input
                value={form.publicMetadataUri}
                onChange={(event) =>
                  update("publicMetadataUri", event.target.value)
                }
              />
              <p className="text-xs font-semibold text-black/60">
                Không đưa secret plaintext vào publicMetadataUri.
              </p>
              <ErrorText value={errors.publicMetadataUri} />
            </Field>
            <Field>
              <FieldLabel>
                Encrypted detail URI: URI encrypted/private payload ghi on-chain
              </FieldLabel>
              <Input
                value={form.encryptedTaskDetailUri}
                onChange={(event) =>
                  update("encryptedTaskDetailUri", event.target.value)
                }
              />
              <p className="text-xs font-semibold text-black/60">
                Nên trỏ tới payload đã mã hóa hoặc storage service.
              </p>
              <ErrorText value={errors.encryptedTaskDetailUri} />
            </Field>
            <Field className="md:col-span-2">
              <FieldLabel>Ghi chú escrow</FieldLabel>
              <Input
                value={form.escrowNote}
                onChange={(event) => update("escrowNote", event.target.value)}
              />
            </Field>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="grid gap-3">
            {mockJudges.map((judge) => {
              const checked = form.judgeIds.includes(judge.id);
              return (
                <label
                  key={judge.id}
                  className="flex cursor-pointer flex-col gap-3 rounded-lg border-2 border-slate-950 bg-[#FFFDF3] p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          update(
                            "judgeIds",
                            event.target.checked
                              ? [...form.judgeIds, judge.id]
                              : form.judgeIds.filter((id) => id !== judge.id)
                          );
                        }}
                      />
                      <strong>{judge.name}</strong>
                      <Badge>Điểm tin cậy {judge.trustScore}</Badge>
                    </div>
                    <p className="mt-1 break-all font-bold">{judge.wallet}</p>
                    <p className="text-sm font-bold">{judge.reputation}</p>
                  </div>
                </label>
              );
            })}
            <ErrorText value={errors.judgeIds} />
          </div>
        ) : null}

        {step === 3 ? (
          <div className="grid gap-4">
            <SoftCard className="p-4">
              <h2 className="text-2xl font-black">
                {form.title || "Chưa nhập tên task"}
              </h2>
              <p className="mt-2 font-bold">
                {form.shortDescription || "Chưa nhập mô tả ngắn"}
              </p>
              <div className="mt-4 grid gap-2 font-bold md:grid-cols-2">
                <p>
                  Thưởng:{" "}
                  {form.rewardAmount
                    ? formatCurrency(Number(form.rewardAmount), form.token)
                    : "Chưa nhập"}
                </p>
                <p>
                  Hạn nộp:{" "}
                  {form.deadline
                    ? formatDate(new Date(form.deadline).toISOString())
                    : "Chưa chọn"}
                </p>
                <p>Mạng: {form.network}</p>
                <p>Escrow: {form.escrowNote}</p>
              </div>
            </SoftCard>
            <SoftCard className="p-4">
              <h3 className="text-xl font-black">On-chain initializeTask data</h3>
              <div className="mt-3 grid gap-2 break-all font-bold md:grid-cols-2">
                <p>taskId: {form.taskId || "Chưa nhập"}</p>
                <p>tokenMint: {form.tokenMint || "Chưa nhập"}</p>
                <p>
                  requestorTokenAccount:{" "}
                  {form.requestorTokenAccount || "Chưa nhập"}
                </p>
                <p>
                  bountyAmount base units: {form.rewardAmount || "Chưa nhập"}
                </p>
                <p>
                  workerStakeAmount: {form.workerStakeAmount || "Chưa nhập"}
                </p>
                <p>requiredJudgesM: {form.requiredJudgesM || "Chưa nhập"}</p>
                <p>
                  approvalThresholdN: {form.approvalThresholdN || "Chưa nhập"}
                </p>
                <p>
                  submissionDeadline:{" "}
                  {form.submissionDeadline
                    ? formatDate(new Date(form.submissionDeadline).toISOString())
                    : "Chưa chọn"}
                </p>
                <p>
                  votingDeadline:{" "}
                  {form.votingDeadline
                    ? formatDate(new Date(form.votingDeadline).toISOString())
                    : "Chưa chọn"}
                </p>
                <p>publicMetadataUri: {form.publicMetadataUri || "Chưa nhập"}</p>
                <p>
                  encryptedTaskDetailUri:{" "}
                  {form.encryptedTaskDetailUri || "Chưa nhập"}
                </p>
              </div>
            </SoftCard>
            <SoftCard className="p-4">
              <h3 className="text-xl font-black">Người chấm</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedJudges().length ? (
                  selectedJudges().map((judge) => (
                    <Badge key={judge.id}>{judge.name}</Badge>
                  ))
                ) : (
                  <Badge>Chưa chọn người chấm</Badge>
                )}
              </div>
            </SoftCard>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-between gap-2">
          <Button
            variant="secondary"
            disabled={step === 0 || isPublishing}
            onClick={() => setStep((current) => Math.max(current - 1, 0))}
          >
            <ArrowLeft className="size-4" />
            Quay lại
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={saveDraft}>
              Lưu bản nháp
            </Button>
            {step === steps.length - 1 ? (
              <Button disabled={isPublishing} onClick={publishTask}>
                <Lock className="size-4" />
                {isPublishing ? "Đang đăng..." : "Đăng task"}
              </Button>
            ) : (
              <Button disabled={isPublishing} onClick={goNext}>
                Tiếp tục
                <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
        </div>
        {publishMessage ? (
          <div
            className={cn(
              "mt-4 rounded-lg border-2 border-slate-950 p-3 font-black",
              publishPhase === "error"
                ? "bg-[#FF6B8A]"
                : publishPhase === "success"
                  ? "bg-[#79F2C0]"
                  : "bg-[#FFFDF3]"
            )}
          >
            <p>Transaction status: {publishMessage}</p>
            {publishPhase === "confirming" ? (
              <p className="mt-1 text-sm">
                Wallet transaction sent; waiting for Devnet confirmation.
              </p>
            ) : null}
            {publishError ? (
              <p className="mt-1 break-all text-sm">{publishError}</p>
            ) : null}
          </div>
        ) : null}
      </Card>
    </RequestorPageFrame>
  );
}

function ErrorText({ value }: { value?: string }) {
  return value ? (
    <span className="text-sm font-black text-rose-700">{value}</span>
  ) : null;
}

export function RequestorTaskDetailPage({ taskId }: { taskId: string }) {
  const { tasks, setTasks, isLoading, sourceWarning } = useRequestorTasks();
  const anchorWallet = useAnchorWallet();
  const { publicKey } = useWallet();
  const wallet = anchorWallet as AnchorWalletLike | undefined;
  const [submissionPage, setSubmissionPage] = useState(1);
  const [submissionPageSize, setSubmissionPageSize] = useState(10);
  const [actionStatus, setActionStatus] =
    useState<DetailActionStatus>("idle");
  const [actionError, setActionError] = useState("");
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [workerTokenAccount, setWorkerTokenAccount] = useState("");
  const [requestorPayoutTokenAccount, setRequestorPayoutTokenAccount] =
    useState("");
  const [payoutPhase, setPayoutPhase] = useState<PayoutPhase>("idle");
  const [payoutError, setPayoutError] = useState("");
  const task = tasks.find((item) => item.id === taskId);
  const submissions = task?.submissions ?? [];
  const safePage = Math.min(
    submissionPage,
    Math.max(1, Math.ceil(submissions.length / submissionPageSize))
  );
  const visibleSubmissions = submissions.slice(
    (safePage - 1) * submissionPageSize,
    safePage * submissionPageSize
  );

  function updateTask(updater: (task: RequestorTask) => RequestorTask) {
    if (!task) return;
    const nextTask = updater(task);
    saveStoredRequestorTask(nextTask);
    setTasks((current) =>
      current.map((item) => (item.id === task.id ? nextTask : item))
    );
  }

  useEffect(() => {
    if (!task) return;
    setRequestorPayoutTokenAccount(task.requestorTokenAccount ?? "");
    setWorkerTokenAccount("");
    setPayoutPhase("idle");
    setPayoutError("");
  }, [task?.id, task?.requestorTokenAccount]);

  const payoutChainTaskId = task ? readStoredOnChainTaskId(task).trim() : "";
  const payoutEligible = task?.status === "Judged";
  const hasPayoutChainData = Boolean(
    payoutChainTaskId && /^\d+$/.test(payoutChainTaskId) && task?.taskPda && task?.tokenMint
  );
  const payoutDisabledReason = !payoutEligible
    ? "Chỉ task đã chấm mới đủ điều kiện payout."
    : !hasPayoutChainData
      ? "Thiếu onChainTaskId numeric, taskPda hoặc tokenMint."
      : "";
  const isPayoutRunning =
    payoutPhase === "preparing" ||
    payoutPhase === "sending" ||
    payoutPhase === "confirming" ||
    payoutPhase === "indexing";

  function deriveRequestorPayoutAta() {
    setPayoutError("");
    if (!publicKey) {
      setPayoutError("Connect wallet trước khi derive requestor ATA.");
      return;
    }
    if (!task?.tokenMint) {
      setPayoutError("Thiếu tokenMint để derive requestor ATA.");
      return;
    }

    try {
      const ata = getAssociatedTokenAddress(
        publicKey,
        new PublicKey(task.tokenMint)
      ).toBase58();
      setRequestorPayoutTokenAccount(ata);
    } catch (caught) {
      setPayoutError(mapSolanaError(caught));
    }
  }

  function deriveWorkerPayoutAta() {
    setPayoutError("");
    if (!task?.worker || !task.tokenMint) {
      setPayoutError("Thiếu worker wallet hoặc tokenMint để derive worker ATA.");
      return;
    }

    try {
      const ata = getAssociatedTokenAddress(
        new PublicKey(task.worker),
        new PublicKey(task.tokenMint)
      ).toBase58();
      setWorkerTokenAccount(ata);
    } catch (caught) {
      setPayoutError(mapSolanaError(caught));
    }
  }

  async function completePayoutOnChain() {
    if (!task) return;
    setPayoutError("");
    setPayoutPhase("idle");

    if (!wallet || !publicKey) {
      setPayoutError("Connect wallet trước khi hoàn tất payout.");
      setPayoutPhase("error");
      return;
    }
    if (!payoutChainTaskId || !/^\d+$/.test(payoutChainTaskId)) {
      setPayoutError("Thiếu onChainTaskId numeric.");
      setPayoutPhase("error");
      return;
    }
    if (!task.taskPda || !task.tokenMint) {
      setPayoutError("Thiếu taskPda hoặc tokenMint để payout.");
      setPayoutPhase("error");
      return;
    }
    if (!workerTokenAccount.trim()) {
      setPayoutError("Vui lòng nhập Worker token account.");
      setPayoutPhase("error");
      return;
    }
    if (!requestorPayoutTokenAccount.trim()) {
      setPayoutError("Vui lòng nhập Requestor token account.");
      setPayoutPhase("error");
      return;
    }

    try {
      setPayoutPhase("preparing");
      await Promise.resolve();
      setPayoutPhase("sending");
      await Promise.resolve();
      setPayoutPhase("confirming");
      const payoutResult = await settlePayment(
        wallet,
        payoutChainTaskId,
        workerTokenAccount.trim(),
        requestorPayoutTokenAccount.trim()
      );

      let indexMetadata: Pick<
        RequestorTask,
        "indexStatus" | "indexedSlot" | "indexError"
      >;
      setPayoutPhase("indexing");
      try {
        const indexed = await indexTaskAfterTransaction({
          taskId: payoutChainTaskId,
          signature: payoutResult.signature,
          instruction: "settle_payment",
          actor: publicKey.toBase58(),
          slot: payoutResult.slot,
        });
        indexMetadata = {
          indexStatus: "indexed",
          indexedSlot: indexed.indexedSlot,
          indexError: undefined,
        };
      } catch (indexCaught) {
        indexMetadata = {
          indexStatus: "index_failed",
          indexedSlot: undefined,
          indexError:
            indexCaught instanceof Error
              ? indexCaught.message
              : String(indexCaught),
        };
      }

      updateTask((item) => ({
        ...item,
        payoutStatus: "Payout đã gửi on-chain",
        payoutSignature: payoutResult.signature,
        payoutExplorerTxUrl: payoutResult.explorerTxUrl,
        payoutSlot: payoutResult.slot,
        payoutAccounts: payoutResult.accounts,
        payoutIsSimulated: false,
        ...indexMetadata,
      }));
      setPayoutPhase("success");
    } catch (caught) {
      setPayoutPhase("error");
      setPayoutError(mapSolanaError(caught));
    }
  }

  function validateDraftPublish(item: RequestorTask) {
    const missing: string[] = [];
    const chainTaskId = readStoredOnChainTaskId(item).trim();
    const submissionDeadline = item.submissionDeadline
      ? new Date(item.submissionDeadline)
      : null;
    const votingDeadline = item.votingDeadline
      ? new Date(item.votingDeadline)
      : null;

    if (!chainTaskId || !/^\d+$/.test(chainTaskId))
      missing.push("onChainTaskId numeric");
    if (!item.tokenMint?.trim()) missing.push("tokenMint");
    if (!item.requestorTokenAccount?.trim())
      missing.push("requestorTokenAccount");
    if (!Number.isFinite(item.rewardAmount) || item.rewardAmount <= 0)
      missing.push("rewardAmount > 0");
    if (
      item.workerStakeAmount === undefined ||
      item.workerStakeAmount === null ||
      !Number.isFinite(item.workerStakeAmount)
    )
      missing.push("workerStakeAmount");
    if (
      item.requiredJudgesM === undefined ||
      !Number.isFinite(item.requiredJudgesM) ||
      item.requiredJudgesM <= 0
    )
      missing.push("requiredJudgesM > 0");
    if (
      item.approvalThresholdN === undefined ||
      !Number.isFinite(item.approvalThresholdN) ||
      item.approvalThresholdN <= 0
    )
      missing.push("approvalThresholdN > 0");
    if (!submissionDeadline || Number.isNaN(submissionDeadline.getTime()))
      missing.push("submissionDeadline hợp lệ");
    if (!votingDeadline || Number.isNaN(votingDeadline.getTime())) {
      missing.push("votingDeadline hợp lệ");
    } else if (
      submissionDeadline &&
      !Number.isNaN(submissionDeadline.getTime()) &&
      votingDeadline.getTime() <= submissionDeadline.getTime()
    ) {
      missing.push("votingDeadline sau submissionDeadline");
    }
    if (
      !isAllowedStorageUri(
        item.publicMetadataUri ?? "",
        PUBLIC_METADATA_URI_PREFIXES
      )
    )
      missing.push("publicMetadataUri hợp lệ");
    if (
      !isAllowedStorageUri(
        item.encryptedTaskDetailUri ?? "",
        ENCRYPTED_DETAIL_URI_PREFIXES
      )
    )
      missing.push("encryptedTaskDetailUri hợp lệ");

    return { chainTaskId, submissionDeadline, votingDeadline, missing };
  }

  async function publishDraftOnChain() {
    if (!task) return;
    setActionError("");
    setMissingFields([]);
    setActionStatus("idle");

    const validation = validateDraftPublish(task);
    if (validation.missing.length) {
      setMissingFields(validation.missing);
      setActionStatus("error");
      return;
    }

    if (!wallet || !publicKey) {
      setActionError("Connect wallet trước khi publish draft lên Solana Devnet.");
      setActionStatus("error");
      return;
    }

    setActionStatus("publishing");
    try {
      const proofResult = await initializeTask(wallet, {
        taskId: validation.chainTaskId,
        tokenMint: task.tokenMint!.trim(),
        requestorTokenAccount: task.requestorTokenAccount!.trim(),
        bountyAmount: String(task.rewardAmount),
        workerStakeAmount: String(task.workerStakeAmount),
        requiredJudgesM: task.requiredJudgesM!,
        approvalThresholdN: task.approvalThresholdN!,
        submissionDeadline: validation.submissionDeadline!,
        votingDeadline: validation.votingDeadline!,
        publicMetadataUri: task.publicMetadataUri!.trim(),
        encryptedTaskDetailUri: task.encryptedTaskDetailUri!.trim(),
      });

      let indexMetadata: Pick<
        RequestorTask,
        "indexStatus" | "indexedSlot" | "indexError"
      >;
      setActionStatus("indexing");
      try {
        const indexed = await indexTaskAfterTransaction({
          taskId: validation.chainTaskId,
          signature: proofResult.signature,
          instruction: "initialize_task",
          actor: publicKey.toBase58(),
          slot: proofResult.slot,
        });
        indexMetadata = {
          indexStatus: "indexed",
          indexedSlot: indexed.indexedSlot,
          indexError: undefined,
        };
      } catch (indexCaught) {
        indexMetadata = {
          indexStatus: "index_failed",
          indexedSlot: undefined,
          indexError:
            indexCaught instanceof Error
              ? indexCaught.message
              : String(indexCaught),
        };
      }

      updateTask((item) => ({
        ...item,
        status: "Open",
        escrowStatus: "Phần thưởng đã khóa trong escrow",
        signature: proofResult.signature,
        slot: proofResult.slot,
        explorerTxUrl: proofResult.explorerTxUrl,
        taskPda: proofResult.taskPda,
        escrowTokenVault:
          typeof proofResult.escrowTokenVault === "string"
            ? proofResult.escrowTokenVault
            : undefined,
        nftAsset:
          typeof proofResult.nftAsset === "string"
            ? proofResult.nftAsset
            : undefined,
        accounts: proofResult.accounts,
        isSimulated: proofResult.isSimulated,
        ...indexMetadata,
      }));
      setActionStatus("success");
    } catch (caught) {
      setActionStatus("error");
      setActionError(mapSolanaError(caught));
    }
  }

  if (isLoading) {
    return (
      <RequestorPageFrame>
        <SoftCard className="p-4 font-black">Đang tải dữ liệu...</SoftCard>
      </RequestorPageFrame>
    );
  }

  if (!task) {
    return (
      <RequestorPageFrame>
        <EmptyState title="Không thể tải dữ liệu. Vui lòng thử lại." />
      </RequestorPageFrame>
    );
  }

  return (
    <RequestorPageFrame>
      <Card className="p-5">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <StatusBadge status={task.status} />
              <Badge>{task.id}</Badge>
            </div>
            <h1 className="text-3xl font-black">{task.title}</h1>
            <p className="mt-2 max-w-3xl font-bold">{task.shortDescription}</p>
          </div>
          <div className="grid gap-2 font-bold md:grid-cols-3 lg:text-right">
            <p>Thưởng: {formatCurrency(task.rewardAmount, task.token)}</p>
            <p>Hạn nộp: {formatDate(task.deadline)}</p>
            <p>{task.network}</p>
          </div>
        </div>
      </Card>
      <DataSourceWarning message={sourceWarning} />

      <Card className="p-5">
        <h2 className="mb-4 text-2xl font-black">Timeline trạng thái task</h2>
        <div className="grid gap-2 md:grid-cols-6">
          {requestorStatusOrder.map((status) => {
            const active =
              requestorStatusOrder.indexOf(status) <=
              requestorStatusOrder.indexOf(task.status);
            return (
              <div
                key={status}
                className={cn(
                  "rounded-lg border-2 border-slate-950 bg-white p-3 font-black",
                  active && "bg-[#79F2C0]"
                )}
              >
                {requestorStatusLabels[status]}
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 text-2xl font-black">
          Proof & Smart Contract Accounts
        </h2>
        {!task.signature && !task.taskPda ? (
          <SoftCard className="p-4 font-bold">
            <p>Chưa publish on-chain.</p>
            {task.status === "Draft" ? (
              <p className="mt-1">
                Publish sẽ tạo escrow và task PDA trên Solana Devnet.
              </p>
            ) : null}
          </SoftCard>
        ) : (
          <div className="grid gap-3">
            <IndexStatusNotice task={task} />
            <div className="grid gap-3 md:grid-cols-2">
              <ProofValue
                label="Program ID"
                value={task.programId ?? PROGRAM_ID.toBase58()}
                href={explorerAccountUrl(task.programId ?? PROGRAM_ID.toBase58())}
              />
              <ProofValue label="RPC" value={RPC_URL} />
              <ProofValue label="Network" value="Solana Devnet" />
              <ProofValue label="isSimulated" value={task.isSimulated ?? false} />
              <ProofValue
                label="Signature"
                value={task.signature}
                href={task.explorerTxUrl}
              />
              <ProofValue label="Slot" value={task.slot} />
              <ProofValue
                label="taskPda"
                value={task.taskPda}
                href={task.taskPda ? explorerAccountUrl(task.taskPda) : undefined}
              />
              <ProofValue
                label="escrowTokenVault"
                value={task.escrowTokenVault}
                href={
                  task.escrowTokenVault
                    ? explorerAccountUrl(task.escrowTokenVault)
                    : undefined
                }
              />
              <ProofValue
                label="nftAsset / Core Asset"
                value={task.nftAsset}
                href={task.nftAsset ? explorerAccountUrl(task.nftAsset) : undefined}
              />
              <ProofValue
                label="requestorTokenAccount"
                value={task.requestorTokenAccount}
                href={
                  task.requestorTokenAccount
                    ? explorerAccountUrl(task.requestorTokenAccount)
                    : undefined
                }
              />
              <ProofValue
                label="tokenMint"
                value={task.tokenMint}
                href={task.tokenMint ? explorerAccountUrl(task.tokenMint) : undefined}
              />
              <ProofValue label="onChainTaskId" value={task.onChainTaskId} />
              <ProofValue
                label="Payout signature"
                value={task.payoutSignature}
                href={task.payoutExplorerTxUrl}
              />
              <ProofValue label="Payout slot" value={task.payoutSlot} />
            </div>

            {task.accounts?.length ? (
              <SoftCard className="p-4">
                <h3 className="mb-2 text-lg font-black">Account links</h3>
                <div className="grid gap-2 font-bold md:grid-cols-2">
                  {task.accounts.map((account) => (
                    <p key={`${account.label}-${account.address}`}>
                      <span className="font-black">{account.label}: </span>
                      <ExplorerLink href={account.url} value={account.address} />
                    </p>
                  ))}
                </div>
              </SoftCard>
            ) : null}

            {task.payoutAccounts?.length ? (
              <SoftCard className="p-4">
                <h3 className="mb-2 text-lg font-black">Payout account links</h3>
                <div className="grid gap-2 font-bold md:grid-cols-2">
                  {task.payoutAccounts.map((account) => (
                    <p key={`payout-${account.label}-${account.address}`}>
                      <span className="font-black">{account.label}: </span>
                      <ExplorerLink href={account.url} value={account.address} />
                    </p>
                  ))}
                </div>
              </SoftCard>
            ) : null}
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="grid gap-4">
          <Card className="p-5">
            <h2 className="mb-3 text-2xl font-black">Bài nộp của worker</h2>
            {submissions.length ? (
              <>
                <SubmissionList submissions={visibleSubmissions} />
                <div className="mt-3">
                  <Pagination
                    page={safePage}
                    pageSize={submissionPageSize}
                    total={submissions.length}
                    onPageChange={setSubmissionPage}
                    onPageSizeChange={(value) => {
                      setSubmissionPageSize(value);
                      setSubmissionPage(1);
                    }}
                  />
                </div>
              </>
            ) : (
              <EmptyState title="Chưa có submission" />
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-2xl font-black">Kết quả chấm</h2>
            {task.result ? (
              <SoftCard className="grid gap-2 p-4 font-bold">
                <p>Điểm: {task.result.score}</p>
                <p>Quyết định: {task.result.decision}</p>
                <p>Nhận xét: {task.result.comment}</p>
              </SoftCard>
            ) : (
              <EmptyState title="Chưa có kết quả chấm" />
            )}
          </Card>
        </div>

        <div className="grid gap-4">
          <Card className="p-5">
            <h2 className="mb-3 text-2xl font-black">Escrow phần thưởng</h2>
            <div className="grid gap-2 font-bold">
              <SoftCard className="p-3">
                Số thưởng: {formatCurrency(task.rewardAmount, task.token)}
              </SoftCard>
              <SoftCard className="p-3">
                Trạng thái escrow: {task.escrowStatus}
              </SoftCard>
              <SoftCard className="p-3">
                Trạng thái payout: {task.payoutStatus}
              </SoftCard>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-2xl font-black">Người chấm được chọn</h2>
            <div className="grid gap-3">
              {task.judges.length ? (
                task.judges.map((judge) => (
                  <SoftCard key={judge.id} className="p-3 font-bold">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <strong>{judge.name}</strong>
                        <p>{judgeStatusLabels[judge.status ?? "Ready"]}</p>
                      </div>
                      <Badge>{judge.reviewProgress ?? 0}%</Badge>
                    </div>
                    <div className="mt-2 h-2 rounded-full border border-slate-950 bg-white">
                      <div
                        className="h-full rounded-full bg-[#79F2C0]"
                        style={{ width: `${judge.reviewProgress ?? 0}%` }}
                      />
                    </div>
                  </SoftCard>
                ))
              ) : (
                <EmptyState title="Chưa chọn người chấm" />
              )}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-2xl font-black">Hành động</h2>
            <div className="flex flex-wrap gap-2">
              {task.status === "Draft" ? (
                <>
                  <Button variant="secondary">Chỉnh sửa</Button>
                  <Button
                    disabled={
                      actionStatus === "publishing" ||
                      actionStatus === "indexing"
                    }
                    onClick={publishDraftOnChain}
                  >
                    {actionStatus === "publishing"
                      ? "Đang đăng..."
                      : actionStatus === "indexing"
                        ? "Đang lưu MongoDB..."
                      : "Đăng task"}
                  </Button>
                </>
              ) : null}
              {task.status === "Submitted" || task.status === "Judged" ? (
                <Button variant="secondary">Xem kết quả</Button>
              ) : null}
              {task.status === "Judged" ? (
                <div className="grid w-full gap-3">
                  <SoftCard className="grid gap-3 p-3">
                    <div className="grid gap-2 break-all text-sm font-bold">
                      <p>
                        onChainTaskId:{" "}
                        {payoutChainTaskId || "Chưa có onChainTaskId"}
                      </p>
                      <p>taskPda: {task.taskPda || "Chưa có taskPda"}</p>
                      <p>tokenMint: {task.tokenMint || "Chưa có tokenMint"}</p>
                      <p>
                        worker wallet:{" "}
                        {task.worker ||
                          "Chưa có worker wallet trong Mongo/indexed data"}
                      </p>
                    </div>
                    <Field>
                      <FieldLabel>Worker token account</FieldLabel>
                      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                        <Input
                          className="min-w-0"
                          disabled={isPayoutRunning}
                          value={workerTokenAccount}
                          onChange={(event) =>
                            setWorkerTokenAccount(event.target.value)
                          }
                        />
                        <Button
                          variant="secondary"
                          disabled={
                            isPayoutRunning || !task.worker || !task.tokenMint
                          }
                          onClick={deriveWorkerPayoutAta}
                        >
                          Derive worker ATA
                        </Button>
                      </div>
                      {!task.worker ? (
                        <p className="text-sm font-bold">
                          Chưa có worker wallet từ dữ liệu on-chain/indexed;
                          nhập Worker token account thủ công nếu bạn đã biết
                          tài khoản nhận token.
                        </p>
                      ) : null}
                    </Field>
                    <Field>
                      <FieldLabel>Requestor token account</FieldLabel>
                      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                        <Input
                          className="min-w-0"
                          disabled={isPayoutRunning}
                          value={requestorPayoutTokenAccount}
                          onChange={(event) =>
                            setRequestorPayoutTokenAccount(event.target.value)
                          }
                        />
                        <Button
                          variant="secondary"
                          disabled={
                            isPayoutRunning || !publicKey || !task.tokenMint
                          }
                          onClick={deriveRequestorPayoutAta}
                        >
                          Derive requestor ATA
                        </Button>
                      </div>
                    </Field>
                    {payoutDisabledReason ? (
                      <p className="text-sm font-black text-rose-700">
                        {payoutDisabledReason}
                      </p>
                    ) : null}
                  </SoftCard>
                  <Button
                    disabled={
                      isPayoutRunning || !payoutEligible || !hasPayoutChainData
                    }
                    onClick={completePayoutOnChain}
                  >
                    <Coins className="size-4" />
                    {isPayoutRunning ? "Đang payout..." : "Hoàn tất payout"}
                  </Button>
                </div>
              ) : null}
              {task.status === "Completed" ? (
                <Button variant="secondary">Xem trạng thái payout</Button>
              ) : null}
            </div>
            {payoutPhase !== "idle" || payoutError ? (
              <SoftCard className="mt-3 p-3 font-bold">
                {payoutPhaseLabel(payoutPhase) ? (
                  <p>Transaction status: {payoutPhaseLabel(payoutPhase)}</p>
                ) : null}
                {payoutPhase === "confirming" ? (
                  <p className="mt-1 text-sm">
                    Wallet transaction sent; waiting for Devnet confirmation.
                  </p>
                ) : null}
                {payoutPhase === "success" ? (
                  <p className="mt-1 text-sm">
                    Payout proof đã lưu local. MongoDB index là nguồn trạng
                    thái chính khi refresh.
                  </p>
                ) : null}
                {task.payoutSignature ? (
                  <p className="mt-1 break-all text-sm">
                    Payout tx:{" "}
                    <ExplorerLink
                      href={task.payoutExplorerTxUrl ?? ""}
                      value={task.payoutSignature}
                    />
                  </p>
                ) : null}
                {payoutError ? (
                  <p className="mt-1 break-all text-sm text-rose-700">
                    {payoutError}
                  </p>
                ) : null}
              </SoftCard>
            ) : null}
            {task.status === "Draft" &&
            (actionStatus !== "idle" ||
              actionError ||
              missingFields.length > 0) ? (
              <SoftCard className="mt-3 p-3 font-bold">
                {actionStatus === "publishing" ? (
                  <p>Đang gửi initializeTask lên Solana Devnet...</p>
                ) : null}
                {actionStatus === "indexing" ? (
                  <p>Transaction confirmed. Đang lưu MongoDB index...</p>
                ) : null}
                {actionStatus === "success" ? (
                  <p>Publish on-chain thành công. Proof đã được lưu.</p>
                ) : null}
                {missingFields.length ? (
                  <div>
                    <p className="font-black">
                      Draft thiếu dữ liệu on-chain:
                    </p>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {missingFields.map((field) => (
                        <li key={field}>{field}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {actionError ? (
                  <p className="break-all text-rose-700">{actionError}</p>
                ) : null}
              </SoftCard>
            ) : null}
          </Card>
        </div>
      </div>
    </RequestorPageFrame>
  );
}

function SubmissionList({
  submissions,
  compact = false,
}: {
  submissions: RequestorSubmission[];
  compact?: boolean;
}) {
  if (!submissions.length) return <EmptyState title="Chưa có submission" />;

  return (
    <div className="grid gap-3">
      {submissions.map((submission) => (
        <SoftCard key={submission.id} className="p-4">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <SubmissionBadge status={submission.status} />
                <span className="text-sm font-black">{submission.id}</span>
              </div>
              <h3
                className={cn(
                  "mt-2 font-black",
                  compact ? "text-lg" : "text-xl"
                )}
              >
                {submission.title}
              </h3>
              <p className="mt-1 font-bold">{submission.taskTitle}</p>
            </div>
            <div className="font-bold md:text-right">
              <p>{submission.workerName}</p>
              <p className="break-all text-sm">{submission.workerWallet}</p>
            </div>
          </div>
          {!compact ? (
            <div className="mt-3 grid gap-2 text-sm font-bold md:grid-cols-3">
              <p>Đã nộp: {formatDate(submission.submittedAt)}</p>
              <p>Hạn nộp: {formatDate(submission.deadline)}</p>
              <p>Điểm: {submission.score ?? "Chưa có"}</p>
            </div>
          ) : null}
        </SoftCard>
      ))}
    </div>
  );
}

export function RequestorSubmissionsPage() {
  const { tasks, isLoading, sourceWarning } = useRequestorTasks();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<SubmissionStatus | "all">("all");
  const [sortBy, setSortBy] = useState<"newest" | "deadline">("newest");
  const submissions = useMemo(() => getAllSubmissions(tasks), [tasks]);
  const filteredSubmissions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...submissions]
      .filter((submission) => {
        const matchesStatus = status === "all" || submission.status === status;
        const matchesSearch =
          !query ||
          submission.title.toLowerCase().includes(query) ||
          submission.taskTitle.toLowerCase().includes(query) ||
          submission.workerName.toLowerCase().includes(query) ||
          submission.id.toLowerCase().includes(query);
        return matchesStatus && matchesSearch;
      })
      .sort((a, b) => {
        const field = sortBy === "deadline" ? "deadline" : "submittedAt";
        const direction = sortBy === "deadline" ? 1 : -1;
        return (
          direction *
          (new Date(a[field]).getTime() - new Date(b[field]).getTime())
        );
      });
  }, [submissions, search, status, sortBy]);
  const pagination = usePagination(filteredSubmissions);
  const tabs: Array<SubmissionStatus | "all"> = [
    "all",
    "PendingJudgeReview",
    "Accepted",
    "Rejected",
    "NeedsRevision",
  ];

  return (
    <RequestorPageFrame>
      <Card className="p-5">
        <SectionHeader
          eyebrow="Requestor"
          title="Theo dõi submission"
          description="Lọc submission theo task, worker, trạng thái review và deadline."
        />
      </Card>

      <Card className="grid gap-4 p-5">
        <div className="flex flex-wrap gap-2">
          {tabs.map((item) => (
            <Button
              key={item}
              variant={status === item ? "default" : "secondary"}
              size="sm"
              onClick={() => setStatus(item)}
            >
              {item === "all" ? "Tất cả" : submissionStatusLabels[item]}
            </Button>
          ))}
        </div>
        <div className="grid gap-3 lg:grid-cols-[1fr_220px_220px]">
          <Field>
            <FieldLabel>Tìm theo task/submission/worker</FieldLabel>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 size-4" />
              <Input
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Nhập task, submission hoặc worker"
              />
            </div>
          </Field>
          <Field>
            <FieldLabel>Lọc theo trạng thái</FieldLabel>
            <select
              className="min-h-10 rounded-lg border-2 border-slate-950 bg-[#FFFDF3] px-3 py-2 font-bold outline-none focus:bg-white focus-visible:ring-4 focus-visible:ring-[#FFD84D] focus-visible:ring-offset-2"
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as SubmissionStatus | "all")
              }
            >
              <option value="all">Tất cả trạng thái</option>
              {Object.entries(submissionStatusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field>
            <FieldLabel>Sắp xếp</FieldLabel>
            <select
              className="min-h-10 rounded-lg border-2 border-slate-950 bg-[#FFFDF3] px-3 py-2 font-bold outline-none focus:bg-white focus-visible:ring-4 focus-visible:ring-[#FFD84D] focus-visible:ring-offset-2"
              value={sortBy}
              onChange={(event) =>
                setSortBy(event.target.value as "newest" | "deadline")
              }
            >
              <option value="newest">Mới nhất</option>
              <option value="deadline">Hạn gần nhất</option>
            </select>
          </Field>
        </div>
      </Card>

      {isLoading ? (
        <SoftCard className="p-4 font-black">Đang tải dữ liệu...</SoftCard>
      ) : null}
      <DataSourceWarning message={sourceWarning} />
      {!isLoading && filteredSubmissions.length === 0 ? (
        <EmptyState title="Chưa có submission phù hợp" />
      ) : (
        <>
          <Card className="p-5">
            <SubmissionList submissions={pagination.paginatedItems} />
          </Card>
          <Pagination
            page={pagination.page}
            pageSize={pagination.pageSize}
            total={filteredSubmissions.length}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
          />
        </>
      )}
    </RequestorPageFrame>
  );
}
