import { useWallet } from "@solana/wallet-adapter-react";
import { ExternalLink, RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SoftCard } from "@/components/ui/card";
import {
  fetchActiveWorkerTasks,
  fetchOpenWorkerTasks,
} from "@/lib/api/worker-tasks";
import type { WorkerTask } from "@/lib/worker/types";

type WorkerTab = "open" | "active" | "proof";

const EXPLORER_CLUSTER = "devnet";

function shortAddress(address?: string) {
  if (!address) return "N/A";
  if (address.length <= 12) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function formatDate(value?: string) {
  if (!value) return "N/A";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getTaskId(task: WorkerTask) {
  return task.onChainTaskId || task.id;
}

function getExplorerUrl(taskPda: string) {
  return `https://explorer.solana.com/address/${taskPda}?cluster=${EXPLORER_CLUSTER}`;
}

function taskMatchesSearch(task: WorkerTask, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return [
    task.id,
    task.onChainTaskId,
    task.requestor,
    task.taskPda,
    task.status,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalizedQuery));
}

function workerStatusTone(status: string) {
  if (["Completed", "Accepted", "indexed"].includes(status)) return "bg-[var(--status-success)]";
  if (["Failed", "Rejected", "Cancelled", "Expired", "error"].includes(status)) return "bg-[var(--status-danger)]";
  if (["Pending", "Resolving", "Inconclusive"].includes(status)) return "bg-[#FFD84D]";
  return "bg-white";
}

export function WorkerDashboard() {
  const { publicKey } = useWallet();
  const walletAddress = publicKey?.toBase58() ?? "";
  const [activeTab, setActiveTab] = useState<WorkerTab>("open");
  const [openTasks, setOpenTasks] = useState<WorkerTask[]>([]);
  const [activeTasks, setActiveTasks] = useState<WorkerTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setWarning(null);

    const [openResult, activeResult] = await Promise.allSettled([
      fetchOpenWorkerTasks(),
      walletAddress
        ? fetchActiveWorkerTasks(walletAddress)
        : Promise.resolve<WorkerTask[]>([]),
    ]);

    if (openResult.status === "fulfilled") {
      setOpenTasks(openResult.value);
    }

    if (activeResult.status === "fulfilled") {
      setActiveTasks(activeResult.value);
    }

    if (openResult.status === "rejected" || activeResult.status === "rejected") {
      setWarning("Không tải được Mongo indexed tasks");
    }

    setLoading(false);
  }, [walletAddress]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  const filteredOpenTasks = useMemo(
    () => openTasks.filter((task) => taskMatchesSearch(task, searchQuery)),
    [openTasks, searchQuery]
  );
  const filteredActiveTasks = useMemo(
    () => activeTasks.filter((task) => taskMatchesSearch(task, searchQuery)),
    [activeTasks, searchQuery]
  );

  return (
    <main className="min-h-screen px-4 py-8">
      <section className="mx-auto grid w-full max-w-[1320px] gap-5 sm:gap-6">
        <Card tone="worker" className="p-5 sm:p-6 lg:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <Badge className="bg-[#FFD84D]">Solana Devnet</Badge>
              <h1 className="mt-4 text-3xl font-black leading-tight text-slate-950 sm:text-4xl">
                Worker Dashboard
              </h1>
              <p className="mt-3 max-w-3xl font-bold leading-7 text-slate-700">
                Theo dõi task từ Mongo index, xem việc đang mở và task active của ví worker.
              </p>
              <p className="mt-2 max-w-3xl text-sm font-bold leading-6 text-slate-600">
                Sau khi quay lại từ detail, bấm Refresh để lấy trạng thái Mongo mới nhất.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row lg:items-center">
              <SoftCard className="px-4 py-3 font-black">
                Wallet: {walletAddress ? shortAddress(walletAddress) : "Chưa kết nối"}
              </SoftCard>
              <Button tone="worker" type="button" onClick={loadTasks} disabled={loading}>
                <RefreshCw className={loading ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
                Refresh
              </Button>
            </div>
          </div>

          {warning ? (
            <SoftCard className="mt-5 border-[#FFD84D] bg-[#FFF7C7] p-4 font-bold">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span>{warning}</span>
                <Button asChild variant="secondary" size="sm">
                  <Link href="/console">Mở /console</Link>
                </Button>
              </div>
            </SoftCard>
          ) : null}
        </Card>

        <Card tone="worker" className="p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="grid grid-cols-3 gap-2 rounded-lg border-2 border-slate-950 bg-white p-1.5">
              <TabButton active={activeTab === "open"} onClick={() => setActiveTab("open")}>
                Open Tasks
              </TabButton>
              <TabButton active={activeTab === "active"} onClick={() => setActiveTab("active")}>
                My Active
              </TabButton>
              <TabButton active={activeTab === "proof"} onClick={() => setActiveTab("proof")}>
                Proof
              </TabButton>
            </div>

            <label className="relative block w-full lg:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search task id, requestor, PDA, status"
                className="h-12 w-full rounded-lg border-2 border-slate-950 bg-white pl-10 pr-3 text-sm font-bold outline-none focus:ring-4 focus:ring-[#FFD84D]"
              />
            </label>
          </div>

          <div className="mt-6">
            {activeTab === "open" ? (
              <TaskList
                emptyText={loading ? "Đang tải Open Tasks..." : "Không có Open Tasks."}
                tasks={filteredOpenTasks}
              />
            ) : null}

            {activeTab === "active" ? (
              <TaskList
                emptyText={
                  walletAddress
                    ? loading
                      ? "Đang tải My Active..."
                      : "Chưa có active tasks cho ví này."
                    : "Kết nối ví worker để xem active tasks."
                }
                tasks={filteredActiveTasks}
              />
            ) : null}

            {activeTab === "proof" ? (
              <SoftCard className="grid min-h-36 place-items-center p-6 text-center">
                <p className="max-w-lg font-black text-slate-800">
                  Worker proof sẽ hiển thị sau khi stake/submit.
                </p>
              </SoftCard>
            ) : null}
          </div>
        </Card>
      </section>
    </main>
  );
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "min-h-12 rounded-md bg-[#79F2C0] px-4 py-2.5 text-sm font-black text-slate-950"
          : "min-h-12 rounded-md px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-[#FFF7C7]"
      }
    >
      {children}
    </button>
  );
}

function TaskList({ tasks, emptyText }: { tasks: WorkerTask[]; emptyText: string }) {
  if (!tasks.length) {
    return <SoftCard className="p-5 text-center font-black text-slate-700">{emptyText}</SoftCard>;
  }

  return (
    <div className="grid gap-5">
      {tasks.map((task) => (
        <TaskCard key={`${task.taskPda ?? task.id}-${getTaskId(task)}`} task={task} />
      ))}
    </div>
  );
}

function TaskCard({ task }: { task: WorkerTask }) {
  const taskId = getTaskId(task);

  return (
    <Card tone="worker" className="p-5 sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="break-all text-xl font-black text-slate-950">Task #{taskId}</h2>
            <Badge className={workerStatusTone(task.status)}>{task.status}</Badge>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <TaskMeta label="Bounty" value={task.bountyAmount ?? "N/A"} />
            <TaskMeta label="Worker stake" value={task.workerStakeAmount ?? "N/A"} />
            <TaskMeta label="Requestor" value={shortAddress(task.requestor)} />
            <TaskMeta label="Deadline" value={formatDate(task.submissionDeadline)} />
            <TaskMeta
              label="Task PDA"
              value={
                task.taskPda ? (
                  <a
                    href={getExplorerUrl(task.taskPda)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 underline decoration-2 underline-offset-2"
                  >
                    {shortAddress(task.taskPda)}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : (
                  "N/A"
                )
              }
            />
          </div>
        </div>

        <Button asChild variant="secondary" className="w-full shrink-0 lg:w-auto">
          <Link href={`/worker/tasks/${encodeURIComponent(taskId)}`}>View</Link>
        </Button>
      </div>
    </Card>
  );
}

function TaskMeta({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-sm font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 break-all font-black leading-6 text-slate-900">{value}</p>
    </div>
  );
}
