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
  LayoutDashboard,
  Search,
  Send,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SoftCard } from "@/components/ui/card";
import { Field, FieldLabel, Input } from "@/components/ui/form";
import { Pagination } from "@/components/ui/pagination";
import { indexTaskAfterTransaction } from "@/lib/api/chain-index";
import { getRequestorDrafts, removeRequestorDraft, saveRequestorDraft } from "@/lib/requestor/drafts";
import { fetchRequestorTasks, type IndexedRequestorTask } from "@/lib/api/requestor-tasks";
import { useRoleState } from "@/lib/auth/role-state";
import {
  requestorStatusLabels,
  requestorStatusOrder,
  submissionStatusLabels,
  judgeStatusLabels,
  type RequestorJudge,
  type RequestorSubmission,
  type RequestorTask,
  type RequestorTaskStatus,
  type SortOption,
  type SubmissionStatus,
} from "@/lib/requestor/types";
import {
  DEMO_TOKEN_MINT,
  PROGRAM_ID,
  RPC_URL,
  cancelOpenTask,
  createAssociatedTokenAccountForConnectedWallet,
  explorerAccountUrl,
  getAssociatedTokenAddress,
  initializeTask,
  mapSolanaError,
  settlePayment,
  type AnchorWalletLike,
  type Web3Result,
} from "@/lib/solana/client";
import { isProtocolUri, publicUriHref } from "@/lib/task-presentation";
import { cn } from "@/lib/utils";

const PAGE_SIZE_OPTIONS = [10, 20, 50];
const sortLabels: Record<SortOption, string> = {
  newest: "Mới nhất",
  reward: "Thưởng cao nhất",
  deadline: "Hạn gần nhất",
};
const PUBLIC_METADATA_URI_PREFIXES = [
  "ipfs://",
  "ar://",
  "https://",
];
const ENCRYPTED_DETAIL_URI_PREFIXES = [
  "enc://",
  "ipfs://",
  "ar://",
  "https://",
];



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
  return isProtocolUri(value, prefixes === ENCRYPTED_DETAIL_URI_PREFIXES);
}

function shortTaskId(taskId: string): string {
  if (!taskId || taskId.length <= 8) return taskId;
  return `...${taskId.slice(-4)}`;
}

function getStatusBadgeColor(status: RequestorTaskStatus): string {
  if (status === "Open") return "bg-teal-100 border-teal-300 text-teal-900";
  if (status === "InProgress") return "bg-amber-100 border-amber-300 text-amber-900";
  if (status === "Submitted") return "bg-purple-100 border-purple-300 text-purple-900";
  if (status === "Judged") return "bg-amber-100 border-amber-300 text-amber-900";
  if (status === "Completed") return "bg-green-100 border-green-300 text-green-900";
  if (status === "Failed" || status === "Cancelled" || status === "Inconclusive") 
    return "bg-red-100 border-red-300 text-red-900";
  if (status === "Draft") return "bg-gray-100 border-gray-300 text-gray-900";
  return "bg-white border-slate-300 text-slate-900";
}

function getStatusTextColor(status: RequestorTaskStatus): string {
  if (status === "Completed") return "text-green-700";
  if (status === "Judged" || status === "Submitted") return "text-amber-700";
  if (status === "Failed" || status === "Cancelled" || status === "Inconclusive") 
    return "text-red-700";
  return "text-slate-700";
}

function statusTone(status: RequestorTaskStatus | SubmissionStatus) {
  if (status === "Completed" || status === "Accepted")
    return "bg-[var(--status-success)]";
  if (status === "Judged" || status === "PendingJudgeReview")
    return "bg-[#FFD84D]";
  if (status === "Failed" || status === "Cancelled" || status === "Rejected")
    return "bg-[var(--status-danger)]";
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
      {href ? (
        <ExplorerLink href={href} value={text} />
      ) : (
        <p className="break-all">{text}</p>
      )}
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

function mergeRequestorTasks(indexedTasks: RequestorTask[], drafts: RequestorTask[]) {
  const seen = new Set<string>();
  const mergedTasks: RequestorTask[] = [];

  // Add indexed tasks first
  indexedTasks.forEach((task) => {
    const key = task.onChainTaskId || task.taskPda || task.id;
    if (!seen.has(key)) {
      seen.add(key);
      mergedTasks.push(task);
    }
  });

  // Add drafts, ensuring they don't overwrite indexed tasks with the same ID
  drafts.forEach((draft) => {
    const key = draft.id; // Drafts use their local ID
    if (!seen.has(key)) {
      seen.add(key);
      mergedTasks.push(draft);
    }
  });

  return sortTasks(mergedTasks, "newest");
}

function useRequestorTasks() {
  const [tasks, setTasks] = useState<RequestorTask[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sourceWarning, setSourceWarning] = useState("");
  const { activeRole, walletAddress } = useRoleState();

  useEffect(() => {
    let cancelled = false;
    const drafts = getRequestorDrafts(walletAddress ?? undefined);
    setTasks(drafts);
    setSourceWarning("");

    if (!walletAddress || activeRole !== "requestor") {
      return () => {
        cancelled = true;
      };
    }

    setIsLoading(true);
    fetchRequestorTasks(walletAddress)
      .then((indexedTasks) => {
        if (!cancelled) setTasks(mergeRequestorTasks(indexedTasks, drafts));
      })
      .catch(() => {
        if (!cancelled) {
          setTasks(drafts);
          setSourceWarning("MongoDB indexed data is unavailable. Only this wallet's unpublished drafts are shown.");
        }
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
        <h1 className="text-3xl font-black sm:text-4xl">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-4xl font-bold leading-7">{description}</p>
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
    <SoftCard className="grid min-h-44 place-items-center p-7 text-center">
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
    <Card tone="requestor" className="grid gap-4 p-5 sm:p-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={task.status} />
            <span className="text-sm font-black">{task.id}</span>
          </div>
          <h3 className="mt-2 text-2xl font-black leading-tight">
            {task.title}
          </h3>
          <p className="mt-2 font-bold leading-7">{task.shortDescription}</p>
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
    </Card>
  );
}

function RequestorActionNavigation() {
  const router = useRouter();
  const pathname = router?.asPath.split("?")[0] ?? "/requestor";
  const actions = [
    { href: "/requestor", label: "Dashboard", icon: LayoutDashboard },
    { href: "/requestor/tasks", label: "Task của tôi", icon: ClipboardList },
    { href: "/requestor/submissions", label: "Submission", icon: Send },
  ];

  return (
    <nav
      className="flex gap-3 overflow-x-auto pb-2 sm:flex-wrap sm:overflow-visible"
      aria-label="Thao tác Requestor"
    >
      {actions.map((action) => {
        const Icon = action.icon;
        const active =
          pathname === action.href ||
          (action.href === "/requestor/tasks" &&
            pathname.startsWith("/requestor/tasks/"));

        return (
          <Button
            key={action.href}
            asChild
            tone={active ? "requestor" : "default"}
            variant={active ? "default" : "secondary"}
            size="sm"
            className="shrink-0"
          >
            <Link
              className={cn("gap-2.5", active && "pointer-events-none")}
              href={action.href}
            >
              <Icon className="size-4" />
              {action.label}
            </Link>
          </Button>
        );
      })}
    </nav>
  );
}

function RequestorPageFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="requestor-page min-h-screen">
      <div className="mx-auto flex w-[min(1560px,calc(100%-24px))] flex-col gap-6 py-8 sm:py-10">
        <RequestorActionNavigation />
        {children}
      </div>
    </main>
  );
}

export function RequestorDashboardPage() {
  const { tasks, isLoading, sourceWarning } = useRequestorTasks();
  const recentTasks = useMemo(
    () => sortTasks(tasks, "newest").slice(0, 5),
    [tasks]
  );
  const lockedReward = tasks
    .filter((task) => task.escrowStatus.toLowerCase().includes("khóa"))
    .reduce((total, task) => total + task.rewardAmount, 0);
  const completedTasks = tasks.filter(
    (task) => task.status === "Completed"
  ).length;

  return (
    <RequestorPageFrame>
      <Card tone="requestor" className="p-5 sm:p-6">
        <SectionHeader
          eyebrow="Requestor"
          title="Dashboard tổng quan"
          description="Theo dõi task đã đăng, reward đang khóa, submission mới và trạng thái payout từ một màn làm việc."
          action={
            <Button asChild tone="requestor">
              <Link href="/requestor/tasks/create">
                <FilePlus2 className="size-4" />
                Tạo task mới
              </Link>
            </Button>
          }
        />
      </Card>

      {isLoading ? (
        <SoftCard className="p-5 font-black">Đang tải dữ liệu...</SoftCard>
      ) : null}
      <DataSourceWarning message={sourceWarning} />

      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: "Task đã đăng", value: tasks.length, icon: ClipboardList },
          {
            label: "Thưởng đang khóa",
            value: formatCurrency(lockedReward),
            icon: Lock,
          },
          {
            label: "Đã hoàn thành",
            value: completedTasks,
            icon: Check,
          },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Card tone="requestor" key={item.label} className="p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-black uppercase">{item.label}</p>
                <Icon className="size-5" />
              </div>
              <p className="mt-3 text-3xl font-black">{item.value}</p>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-5 lg:grid-cols-1">
        <Card tone="requestor" className="p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-2xl font-black lg:text-3xl">Task gần đây</h2>
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
      <Card tone="requestor" className="p-5">
        <SectionHeader
          eyebrow="Requestor"
          title="Task đã tạo"
          description="Quản lý task từ bản nháp đến completed, kèm trạng thái escrow và submission."
          action={
            <Button asChild tone="requestor">
              <Link href="/requestor/tasks/create">
                <FilePlus2 className="size-4" />
                Tạo task mới
              </Link>
            </Button>
          }
        />
      </Card>

      <Card tone="requestor" className="grid gap-4 p-5">
        <div className="flex flex-wrap gap-2">
          <Button
            tone={status === "all" ? "requestor" : "default"}
            variant={status === "all" ? "default" : "secondary"}
            size="sm"
            onClick={() => setStatus("all")}
          >
            Tất cả
          </Button>
          {requestorStatusOrder.map((item) => (
            <Button
              key={item}
              tone={status === item ? "requestor" : "default"}
              variant={status === item ? "default" : "secondary"}
              size="sm"
              onClick={() => setStatus(item)}
            >
              {requestorStatusLabels[item]}
            </Button>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_240px_240px]">
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
              className="min-h-11 rounded-lg border-2 border-slate-950 bg-[#FFFDF3] px-3.5 py-2.5 font-bold outline-none focus:bg-white focus-visible:ring-4 focus-visible:ring-[var(--role-requestor)] focus-visible:ring-offset-2"
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
              className="min-h-10 rounded-lg border-2 border-slate-950 bg-[#FFFDF3] px-3 py-2 font-bold outline-none focus:bg-white focus-visible:ring-4 focus-visible:ring-[var(--role-requestor)] focus-visible:ring-offset-2"
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
        <SoftCard className="p-5 font-black">Đang tải dữ liệu...</SoftCard>
      ) : null}
      <DataSourceWarning message={sourceWarning} />
      {!isLoading && tasks.length === 0 ? (
        <EmptyState
          title="Bạn chưa tạo task nào"
          action={
            <Button asChild tone="requestor">
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

type CancelPhase =
  | "idle"
  | "preparing"
  | "sending"
  | "confirming"
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
        "min-h-28 w-full rounded-lg border-2 border-slate-950 bg-[#FFFDF3] px-3 py-2 outline-none focus:bg-white focus-visible:ring-4 focus-visible:ring-[var(--role-requestor)] focus-visible:ring-offset-2",
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
          !isAllowedStorageUri(
            form.publicMetadataUri,
            PUBLIC_METADATA_URI_PREFIXES
          )
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


    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function goNext() {
    if (!validate(step)) return;
    setStep((current) => Math.min(current + 1, steps.length - 1));
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
      judges: [],
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
    const walletAddress = publicKey?.toBase58();
    if (!walletAddress) {
      setPublishPhase("error");
      setPublishError("Connect the requestor wallet before saving a wallet-scoped draft.");
      return;
    }
    const task = buildTask("Draft");
    saveRequestorDraft(task, walletAddress);
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

      if (task.indexStatus === "index_failed") {
        setPublishPhase("error");
        setPublishError(task.indexError ?? "The transaction is confirmed, but MongoDB indexing failed. Retry indexing before leaving this page.");
        return;
      }
      removeRequestorDraft(`REQ-${form.taskId.trim()}`, wallet.publicKey.toBase58());
      setPublishPhase("success");
      void router?.push(`/requestor/tasks/REQ-${form.taskId.trim()}`);
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
      <Card tone="requestor" className="p-5 sm:p-6">
        <SectionHeader
          eyebrow="Requestor"
          title="Tạo task mới"
          description="Điền brief, reward, deadline và judge. Dữ liệu không mất khi chuyển bước trong wizard."
        />
      </Card>

      <Card tone="requestor" className="p-6 sm:p-7">
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
          <div className="grid gap-4">
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
          <div className="grid gap-4 md:grid-cols-2">
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
          <SoftCard className="grid gap-3 p-5 font-bold">
            <h2 className="text-2xl font-black">Judge protocol</h2>
            <p>Judges are not selected per task. The program randomly assigns eligible judges from the on-chain JudgeRegistry only after a worker submits.</p>
            <p>The judge stake is a protocol-level prerequisite locked when a judge registers. It is not a task-specific requestor charge or a configurable task stake.</p>
            <p>requiredJudgesM controls the number of judges the protocol will assign; approvalThresholdN controls the settlement threshold.</p>
          </SoftCard>
        ) : null}

        {step === 3 ? (
          <div className="grid gap-4">
            <SoftCard className="p-5">
              <h2 className="text-3xl font-black">
                {form.title || "Chưa nhập tên task"}
              </h2>
              <p className="mt-2 font-bold leading-7">
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
            <SoftCard className="p-5">
              <h3 className="text-2xl font-black">
                On-chain initializeTask data
              </h3>
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
                    ? formatDate(
                        new Date(form.submissionDeadline).toISOString()
                      )
                    : "Chưa chọn"}
                </p>
                <p>
                  votingDeadline:{" "}
                  {form.votingDeadline
                    ? formatDate(new Date(form.votingDeadline).toISOString())
                    : "Chưa chọn"}
                </p>
                <p>
                  publicMetadataUri: {form.publicMetadataUri || "Chưa nhập"}
                </p>
                <p>
                  encryptedTaskDetailUri:{" "}
                  {form.encryptedTaskDetailUri || "Chưa nhập"}
                </p>
              </div>
            </SoftCard>
            <SoftCard className="p-5">
              <h3 className="text-2xl font-black">Judge protocol</h3>
              <p className="mt-2 font-bold">Judges are assigned from the on-chain registry after submission. This task does not select judges or charge a task-specific judge stake.</p>
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
              <Button
                tone="requestor"
                disabled={isPublishing}
                onClick={publishTask}
              >
                <Lock className="size-4" />
                {isPublishing ? "Đang đăng..." : "Đăng task"}
              </Button>
            ) : (
              <Button tone="requestor" disabled={isPublishing} onClick={goNext}>
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
  const [cancelPhase, setCancelPhase] = useState<CancelPhase>("idle");
  const [cancelError, setCancelError] = useState("");
  const [cancelIndexError, setCancelIndexError] = useState("");
  const [cancelConfirmationOpen, setCancelConfirmationOpen] = useState(false);
  const task = tasks.find((item) => item.id === taskId);

  async function cancelOpenTaskOnChain() {
    if (!task || task.status !== "Open") return;
    const chainTaskId = readStoredOnChainTaskId(task).trim();
    if (!wallet || !publicKey) {
      setCancelPhase("error");
      setCancelError("Connect the requestor wallet before cancelling this task.");
      return;
    }
    if (!/^\d+$/.test(chainTaskId)) {
      setCancelPhase("error");
      setCancelError("The indexed task does not have a numeric on-chain id.");
      return;
    }

    setCancelError("");
    setCancelIndexError("");
    try {
      setCancelPhase("preparing");
      setCancelPhase("sending");
      const result = await cancelOpenTask(wallet, chainTaskId, task.requestorTokenAccount);
      setCancelPhase("confirming");
      setCancelPhase("indexing");
      try {
        await indexTaskAfterTransaction({
          taskId: chainTaskId,
          signature: result.signature,
          instruction: "cancel_open_task",
          actor: publicKey.toBase58(),
          slot: result.slot,
        });
        const indexedTasks = await fetchRequestorTasks(publicKey.toBase58());
        setTasks((current) =>
          mergeRequestorTasks(indexedTasks, current.filter((item) => item.status === "Draft"))
        );
        setCancelPhase("success");
      } catch (caught) {
        setCancelIndexError(caught instanceof Error ? caught.message : String(caught));
        setCancelPhase("error");
      }
    } catch (caught) {
      setCancelError(mapSolanaError(caught));
      setCancelPhase("error");
    }
  }

  if (isLoading) {
    return <RequestorPageFrame><SoftCard className="p-5 font-black">Loading indexed tasks...</SoftCard></RequestorPageFrame>;
  }
  if (!task) {
    return <RequestorPageFrame><EmptyState title="Task is not available in the indexed requestor data." /></RequestorPageFrame>;
  }

  const metadataHref = publicUriHref(task.publicMetadataUri);
  const cancelling = ["preparing", "sending", "confirming", "indexing"].includes(cancelPhase);
  const canCancel = task.status === "Open" && Boolean(wallet && publicKey) && task.requestor === publicKey?.toBase58() && /^\d+$/.test(readStoredOnChainTaskId(task).trim());
  const submissionVisible = Boolean(task.encryptedSubmissionUri) || ["Submitted", "Completed", "Failed", "Inconclusive"].includes(task.status);
  const submissionHref = publicUriHref(task.encryptedSubmissionUri);

  return (
    <RequestorPageFrame>
      <div className="flex items-center gap-3">
        <Button asChild variant="secondary" size="sm"><Link href="/requestor/tasks"><ArrowLeft className="size-4" />Back to tasks</Link></Button>
      </div>
      <Card tone="requestor" className="p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-black">Task #{shortTaskId(task.id)}</h1>
              <span className={`rounded-full border px-3 py-1 text-sm font-bold ${getStatusBadgeColor(task.status)}`}>{requestorStatusLabels[task.status]}</span>
            </div>
            <p className="mt-2 font-bold">Created: {formatDate(task.createdAt)}</p>
          </div>
          <Badge>{task.onChainTaskId ?? "Draft"}</Badge>
        </div>
      </Card>
      <Card tone="requestor" className="p-5 sm:p-6">
        <h2 className="text-2xl font-black">Financial summary & requirements</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <SoftCard className="p-4"><p className="text-xs font-black uppercase">Bounty</p><p className="mt-1 text-2xl font-black">{formatCurrency(task.rewardAmount, task.token)}</p></SoftCard>
          <SoftCard className="p-4"><p className="text-xs font-black uppercase">Required worker stake</p><p className="mt-1 text-2xl font-black">{task.workerStakeAmount ?? 0} SOL</p></SoftCard>
          <SoftCard className="p-4"><p className="text-xs font-black uppercase">Submission deadline</p><p className="mt-1 font-bold">{formatDate(task.submissionDeadline ?? task.deadline)}</p></SoftCard>
          <SoftCard className="p-4"><p className="text-xs font-black uppercase">Voting deadline</p><p className="mt-1 font-bold">{formatDate(task.votingDeadline ?? task.deadline)}</p></SoftCard>
        </div>
        <div className="mt-4 border-t-2 border-slate-950 pt-4">
          <p className="text-xs font-black uppercase">Public task requirements</p>
          <p className="mt-1 font-bold">The public task document is available through the safe action below.</p>
          {metadataHref ? <Button asChild variant="secondary" size="sm" className="mt-3"><a href={metadataHref} target="_blank" rel="noopener noreferrer">Open public metadata</a></Button> : null}
        </div>
      </Card>
      <DataSourceWarning message={sourceWarning} />
      <Card tone="requestor" className="p-5 sm:p-6">
        <h2 className="text-2xl font-black">Contextual action</h2>
        {task.status === "Draft" ? <p className="mt-3 font-bold">This is a wallet-scoped draft. Publish it through the create workflow; local storage cannot promote it to an on-chain task.</p> : null}
        {canCancel ? <div className="mt-3 grid gap-3"><p className="font-bold">No worker has accepted this task.</p><Button tone="requestor" disabled={cancelling} onClick={() => setCancelConfirmationOpen(true)}>{cancelling ? "Cancelling on-chain..." : "Cancel open task"}</Button>{cancelConfirmationOpen ? <SoftCard className="grid gap-3 border-rose-700 p-4"><p className="font-black">Cancel Task #{shortTaskId(task.id)}?</p><p className="font-bold">The bounty will return from escrow to your requestor token account. This cannot be undone after confirmation.</p><div className="flex gap-2"><Button variant="secondary" disabled={cancelling} onClick={() => setCancelConfirmationOpen(false)}>Go back</Button><Button tone="requestor" disabled={cancelling} onClick={() => { setCancelConfirmationOpen(false); void cancelOpenTaskOnChain(); }}>Cancel task & refund</Button></div></SoftCard> : null}{cancelPhase !== "idle" ? <SoftCard className="p-3 font-bold"><p>Cancellation: {cancelPhase}</p>{cancelError ? <p className="mt-1 text-rose-700">{cancelError}</p> : null}{cancelIndexError ? <p className="mt-1 text-amber-700">Transaction is confirmed but indexing needs retry: {cancelIndexError}</p> : null}</SoftCard> : null}</div> : null}
        {task.status !== "Draft" && task.status !== "Open" ? <p className="mt-3 font-bold">This task is already in the protocol lifecycle. Its state, worker, submission, and settlement outcome are read from the indexed on-chain snapshot.</p> : null}
      </Card>
      {submissionVisible ? <Card tone="requestor" className="p-5 sm:p-6"><h2 className="text-2xl font-black">Submission</h2><p className="mt-2 font-bold">Worker: {task.worker ? shortTaskId(task.worker) : "Not assigned"}</p>{submissionHref ? <Button asChild variant="secondary" size="sm" className="mt-3"><a href={submissionHref} target="_blank" rel="noopener noreferrer">Open submission</a></Button> : task.encryptedSubmissionUri ? <p className="mt-3 font-bold">The submission has been encrypted and recorded on-chain.</p> : <p className="mt-3 font-bold">No submission has been recorded on-chain.</p>}</Card> : null}
      <details className="rounded-lg border-2 border-slate-950 bg-white p-5">
        <summary className="cursor-pointer font-black">On-chain details (Developer)</summary>
        <div className="mt-4">
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <ProofValue label="Task PDA" value={task.taskPda} href={task.taskPda ? explorerAccountUrl(task.taskPda) : undefined} />
          <ProofValue label="Escrow token vault" value={task.escrowTokenVault} href={task.escrowTokenVault ? explorerAccountUrl(task.escrowTokenVault) : undefined} />
          <ProofValue label="Transaction" value={task.signature} href={task.explorerTxUrl} />
          <ProofValue label="Indexed slot" value={task.indexedSlot ?? task.slot} />
          <ProofValue label="Encrypted submission URI" value={task.encryptedSubmissionUri} />
          <ProofValue label="Assigned judges" value={task.judges.map((judge) => judge.wallet).join(", ")} />
        </div>
        <IndexStatusNotice task={task} />
        </div>
      </details>
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
  return (
    <RequestorPageFrame>
      <Card tone="requestor" className="p-5">
        <SectionHeader
          eyebrow="Requestor"
          title="Theo dõi submission"
          description="Submissions được quản lý từng task. Vui lòng truy cập chi tiết task để xem submission."
        />
      </Card>
      <EmptyState
        title="Hãy vào chi tiết task để xem submission"
        action={
          <Button asChild tone="requestor">
            <Link href="/requestor/tasks">Quay lại danh sách task</Link>
          </Button>
        }
      />
    </RequestorPageFrame>
  );
}

