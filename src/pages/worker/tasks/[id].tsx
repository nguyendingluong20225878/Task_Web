import { useAnchorWallet, useWallet } from "@solana/wallet-adapter-react";
import { ArrowLeft, ExternalLink, RefreshCw } from "lucide-react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { RoleGate } from "@/components/auth/role-gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SoftCard } from "@/components/ui/card";
import {
  fetchActiveWorkerTasks,
  fetchOpenWorkerTasks,
} from "@/lib/api/worker-tasks";
import { indexTaskAfterTransaction } from "@/lib/api/chain-index";
import {
  PROGRAM_ID,
  explorerAccountUrl,
  mapSolanaError,
  stakeToUnlock,
  submitAndAssign,
  type AccountLink,
  type AnchorWalletLike,
} from "@/lib/solana/client";
import { canStakeTask, type WorkerTask } from "@/lib/worker/types";

type StakePhase =
  | "idle"
  | "preparing"
  | "sending"
  | "confirming"
  | "indexing"
  | "success"
  | "error";

type StakeProof = {
  signature: string;
  slot?: number;
  explorerTxUrl: string;
  workerEscrow?: string;
  accounts?: AccountLink[];
  indexStatus?: "indexed" | "index_failed";
  indexedSlot?: number;
  indexError?: string;
};

type SubmitPhase =
  | "idle"
  | "preparing"
  | "sending"
  | "confirming"
  | "indexing"
  | "success"
  | "error";

type SubmitProof = {
  signature: string;
  slot?: number;
  explorerTxUrl: string;
  assignedJudges?: string[];
  encryptedSubmissionUri?: string;
  accounts?: AccountLink[];
  indexStatus?: "indexed" | "index_failed";
  indexedSlot?: number;
  indexError?: string;
};

const ALLOWED_SUBMISSION_URI_PREFIXES = [
  "enc://",
  "ipfs://",
  "ar://",
  "https://",
  "local://",
];

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

function normalizeWallet(value?: string) {
  return value?.trim().toLowerCase();
}

function walletMatches(left?: string, right?: string) {
  const normalizedLeft = normalizeWallet(left);
  const normalizedRight = normalizeWallet(right);
  return Boolean(
    normalizedLeft && normalizedRight && normalizedLeft === normalizedRight
  );
}

function getTaskRouteId(rawId?: string | string[]) {
  return Array.isArray(rawId) ? rawId[0] : rawId;
}

function getDisplayTaskId(task: WorkerTask) {
  return task.onChainTaskId || task.id;
}

function findTaskById(tasks: WorkerTask[], routeId: string) {
  return tasks.find(
    (task) => task.onChainTaskId === routeId || task.id === routeId
  );
}

function isNumericTaskId(value?: string) {
  return Boolean(value && /^\d+$/.test(value));
}

function validateEncryptedSubmissionUri(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "encryptedSubmissionUri không được rỗng.";
  if (trimmed.toLowerCase().startsWith("mock://")) {
    return "mock:// không được phép cho submission thật.";
  }
  if (
    !ALLOWED_SUBMISSION_URI_PREFIXES.some((prefix) =>
      trimmed.startsWith(prefix)
    )
  ) {
    return "URI phải bắt đầu bằng enc://, ipfs://, ar://, https:// hoặc local://.";
  }
  return "";
}

function readAssignedJudges(value: unknown) {
  return Array.isArray(value)
    ? value.filter((judge): judge is string => typeof judge === "string")
    : undefined;
}

function workerStatusTone(status: string) {
  if (["Completed", "Accepted", "indexed"].includes(status))
    return "bg-[var(--status-success)]";
  if (["Failed", "Rejected", "Cancelled", "Expired", "error"].includes(status))
    return "bg-[var(--status-danger)]";
  if (["Pending", "Resolving", "Inconclusive"].includes(status))
    return "bg-[#FFD84D]";
  return "bg-white";
}

export default function WorkerTaskDetailPage() {
  return (
    <>
      <Head>
        <title>Worker Task Detail | Task Web</title>
        <meta name="description" content="Worker task detail for Task Web." />
        <link rel="icon" href="/favicon.svg" />
      </Head>

      <RoleGate requiredRole="worker">
        <WorkerTaskDetail />
      </RoleGate>
    </>
  );
}

function WorkerTaskDetail() {
  const router = useRouter();
  const anchorWallet = useAnchorWallet();
  const { publicKey } = useWallet();
  const wallet = anchorWallet as AnchorWalletLike | undefined;
  const walletAddress = publicKey?.toBase58() ?? "";
  const taskId = getTaskRouteId(router.query.id);
  const [task, setTask] = useState<WorkerTask | null>(null);
  const [loading, setLoading] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [stakePhase, setStakePhase] = useState<StakePhase>("idle");
  const [stakeError, setStakeError] = useState("");
  const [stakeProof, setStakeProof] = useState<StakeProof | null>(null);
  const [encryptedSubmissionUri, setEncryptedSubmissionUri] = useState("");
  const [submitPhase, setSubmitPhase] = useState<SubmitPhase>("idle");
  const [submitError, setSubmitError] = useState("");
  const [submitProof, setSubmitProof] = useState<SubmitProof | null>(null);

  const loadTask = useCallback(async () => {
    if (!taskId) return;

    setLoading(true);
    setWarning(null);
    setHasLoaded(false);

    const [openResult, activeResult] = await Promise.allSettled([
      fetchOpenWorkerTasks(),
      walletAddress
        ? fetchActiveWorkerTasks(walletAddress)
        : Promise.resolve<WorkerTask[]>([]),
    ]);

    const openTasks = openResult.status === "fulfilled" ? openResult.value : [];
    const activeTasks =
      activeResult.status === "fulfilled" ? activeResult.value : [];
    const matchedTask =
      findTaskById(openTasks, taskId) ??
      findTaskById(activeTasks, taskId) ??
      null;

    setTask(matchedTask);
    setHasLoaded(true);

    if (
      openResult.status === "rejected" ||
      activeResult.status === "rejected"
    ) {
      setWarning("Không tải được Mongo indexed tasks");
    }

    setLoading(false);
  }, [taskId, walletAddress]);
  const refreshTaskData = loadTask;

  useEffect(() => {
    void loadTask();
  }, [loadTask]);

  const stakeHelpText = useMemo(() => {
    if (!task) return "Không có task để stake.";
    if (!canStakeTask(task))
      return `Task đang ở trạng thái ${task.status}, chỉ task Open mới stake được.`;
    if (!wallet || !walletAddress)
      return "Kết nối ví worker để stake task này.";
    if (!isNumericTaskId(task.onChainTaskId))
      return "onChainTaskId phải là numeric để gọi stakeToUnlock.";
    return "Stake worker escrow trên Devnet, sau đó index lại task vào Mongo.";
  }, [task, wallet, walletAddress]);
  const canRunStake = Boolean(
    task &&
      canStakeTask(task) &&
      wallet &&
      walletAddress &&
      isNumericTaskId(task.onChainTaskId)
  );
  const stakeIsRunning = [
    "preparing",
    "sending",
    "confirming",
    "indexing",
  ].includes(stakePhase);
  const submitUriError = useMemo(
    () => validateEncryptedSubmissionUri(encryptedSubmissionUri),
    [encryptedSubmissionUri]
  );
  const submitHelpText = useMemo(() => {
    if (!task) return "Không có task để submit.";
    if (task.status !== "InProgress") {
      return `Task đang ở trạng thái ${task.status}, chỉ task InProgress mới submit được.`;
    }
    if (task.worker && !walletMatches(task.worker, walletAddress)) {
      return "Connected wallet không khớp worker đã nhận task này.";
    }
    if (!wallet || !walletAddress)
      return "Kết nối ví worker để submit task này.";
    if (!isNumericTaskId(task.onChainTaskId))
      return "onChainTaskId phải là numeric để gọi submitAndAssign.";
    if (submitUriError) return submitUriError;
    return "URI phải trỏ tới payload đã mã hóa/private, sẽ được ghi on-chain.";
  }, [submitUriError, task, wallet, walletAddress]);
  const canRunSubmit = Boolean(
    task &&
      task.status === "InProgress" &&
      (!task.worker || walletMatches(task.worker, walletAddress)) &&
      wallet &&
      walletAddress &&
      isNumericTaskId(task.onChainTaskId) &&
      !submitUriError
  );
  const submitIsRunning = [
    "preparing",
    "sending",
    "confirming",
    "indexing",
  ].includes(submitPhase);

  const handleStakeToUnlock = useCallback(async () => {
    if (!task) {
      setStakePhase("error");
      setStakeError("Không có task để stake.");
      return;
    }
    if (!wallet || !walletAddress) {
      setStakePhase("error");
      setStakeError("Kết nối ví worker trước khi stake.");
      return;
    }
    if (!canStakeTask(task)) {
      setStakePhase("error");
      setStakeError(
        `InvalidStatus: task ${getDisplayTaskId(task)} is ${
          task.status
        }, expected Open.`
      );
      return;
    }
    if (!isNumericTaskId(task.onChainTaskId)) {
      setStakePhase("error");
      setStakeError("onChainTaskId phải là numeric để gọi stakeToUnlock.");
      return;
    }

    setStakePhase("preparing");
    setStakeError("");
    setStakeProof(null);

    try {
      setStakePhase("sending");
      const result = await stakeToUnlock(wallet, task.onChainTaskId);
      const nextProof: StakeProof = {
        signature: result.signature,
        slot: result.slot,
        explorerTxUrl: result.explorerTxUrl,
        workerEscrow:
          typeof result.workerEscrow === "string"
            ? result.workerEscrow
            : undefined,
        accounts: result.accounts,
      };

      setStakePhase("confirming");
      setStakeProof(nextProof);
      setStakePhase("indexing");

      try {
        const indexed = await indexTaskAfterTransaction({
          taskId: task.onChainTaskId,
          signature: result.signature,
          instruction: "stake_to_unlock",
          actor: walletAddress,
          slot: result.slot,
        });

        setStakeProof({
          ...nextProof,
          indexStatus: "indexed",
          indexedSlot: indexed.indexedSlot,
        });
        setStakePhase("success");
      } catch (caught) {
        const message =
          caught instanceof Error ? caught.message : String(caught);
        setStakeProof({
          ...nextProof,
          indexStatus: "index_failed",
          indexError: message,
        });
        setStakePhase("success");
      }
      await refreshTaskData();
    } catch (caught) {
      setStakeProof(null);
      setStakePhase("error");
      setStakeError(mapSolanaError(caught));
    }
  }, [refreshTaskData, task, wallet, walletAddress]);

  const handleSubmitAndAssign = useCallback(async () => {
    if (!task) {
      setSubmitPhase("error");
      setSubmitError("Không có task để submit.");
      return;
    }
    if (!wallet || !walletAddress) {
      setSubmitPhase("error");
      setSubmitError("Kết nối ví worker trước khi submit.");
      return;
    }
    if (task.status !== "InProgress") {
      setSubmitPhase("error");
      setSubmitError(
        `InvalidStatus: task ${getDisplayTaskId(task)} is ${
          task.status
        }, expected InProgress.`
      );
      return;
    }
    if (task.worker && !walletMatches(task.worker, walletAddress)) {
      setSubmitPhase("error");
      setSubmitError("Connected wallet không khớp worker đã nhận task này.");
      return;
    }
    if (!isNumericTaskId(task.onChainTaskId)) {
      setSubmitPhase("error");
      setSubmitError("onChainTaskId phải là numeric để gọi submitAndAssign.");
      return;
    }

    const trimmedSubmissionUri = encryptedSubmissionUri.trim();
    const uriError = validateEncryptedSubmissionUri(trimmedSubmissionUri);
    if (uriError) {
      setSubmitPhase("error");
      setSubmitError(uriError);
      return;
    }

    setSubmitPhase("preparing");
    setSubmitError("");
    setSubmitProof(null);

    try {
      setSubmitPhase("sending");
      const result = await submitAndAssign(
        wallet,
        task.onChainTaskId,
        trimmedSubmissionUri
      );
      const nextProof: SubmitProof = {
        signature: result.signature,
        slot: result.slot,
        explorerTxUrl: result.explorerTxUrl,
        assignedJudges: readAssignedJudges(result.assignedJudges),
        encryptedSubmissionUri: trimmedSubmissionUri,
        accounts: result.accounts,
      };

      setSubmitPhase("confirming");
      setSubmitProof(nextProof);
      setSubmitPhase("indexing");

      try {
        const indexed = await indexTaskAfterTransaction({
          taskId: task.onChainTaskId,
          signature: result.signature,
          instruction: "submit_and_assign",
          actor: walletAddress,
          slot: result.slot,
        });

        setSubmitProof({
          ...nextProof,
          indexStatus: "indexed",
          indexedSlot: indexed.indexedSlot,
        });
        setSubmitPhase("success");
      } catch (caught) {
        const message =
          caught instanceof Error ? caught.message : String(caught);
        setSubmitProof({
          ...nextProof,
          indexStatus: "index_failed",
          indexError: message,
        });
        setSubmitPhase("success");
      }
      await refreshTaskData();
    } catch (caught) {
      setSubmitProof(null);
      setSubmitPhase("error");
      setSubmitError(mapSolanaError(caught));
    }
  }, [encryptedSubmissionUri, refreshTaskData, task, wallet, walletAddress]);

  return (
    <main className="min-h-screen px-4 py-8">
      <section className="mx-auto grid w-full max-w-[1320px] gap-5 sm:gap-6">
        <Card className="p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Button asChild variant="secondary" size="sm">
              <Link href="/worker">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Worker
              </Link>
            </Button>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <SoftCard className="px-4 py-3 font-black">
                Wallet:{" "}
                {walletAddress ? shortAddress(walletAddress) : "Chưa kết nối"}
              </SoftCard>
              <Button
                type="button"
                onClick={refreshTaskData}
                disabled={loading || !taskId}
              >
                <RefreshCw
                  className={
                    loading ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"
                  }
                />
                Refresh task
              </Button>
            </div>
          </div>
          {warning ? (
            <SoftCard className="mt-5 border-[#FFD84D] bg-[#FFF7C7] p-4 font-bold">
              {warning}
            </SoftCard>
          ) : null}
        </Card>

        {!hasLoaded || loading ? (
          <SoftCard className="p-5 text-center font-black text-slate-700">
            Đang tải task...
          </SoftCard>
        ) : null}

        {hasLoaded && !loading && !task ? (
          <SoftCard className="grid min-h-44 place-items-center p-6 text-center">
            <div>
              <p className="text-xl font-black text-slate-950">
                Không tìm thấy task
              </p>
              <p className="mt-2 font-bold text-slate-600">
                Task này chưa có trong Open Tasks hoặc My Active từ Mongo index.
              </p>
            </div>
          </SoftCard>
        ) : null}

        {task ? (
          <>
            <Card className="p-5 sm:p-6 lg:p-7">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <Badge
                    className={
                      task.status === "Open"
                        ? "bg-white text-[#1D4ED8]"
                        : workerStatusTone(task.status)
                    }
                  >
                    {task.status}
                  </Badge>
                  <h1 className="mt-3 break-all text-3xl font-black leading-tight text-slate-950 sm:text-4xl">
                    #{getDisplayTaskId(task)}
                  </h1>
                </div>
                <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[560px]">
                  <FinancialItem
                    label="Thưởng"
                    value={task.bountyAmount ?? "Chưa có dữ liệu"}
                  />
                  <FinancialItem
                    label="Worker stake"
                    value={task.workerStakeAmount ?? "Chưa có dữ liệu"}
                  />
                  <FinancialItem
                    label="Hạn nộp bài"
                    value={formatDate(task.submissionDeadline)}
                    valueClassName={deadlineTextTone(task.submissionDeadline)}
                  />
                </div>
              </div>
              <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
                <WorkRequirements task={task} />
                {canStakeTask(task) ? (
                  <StakeAction
                    canRunStake={canRunStake}
                    helpText={stakeHelpText}
                    phase={stakePhase}
                    error={stakeError}
                    running={stakeIsRunning}
                    stakeAmount={task.workerStakeAmount}
                    onStake={handleStakeToUnlock}
                  />
                ) : task.status === "InProgress" ? (
                  <SubmitAction
                    canRunSubmit={canRunSubmit}
                    error={submitError}
                    helpText={submitHelpText}
                    onSubmit={handleSubmitAndAssign}
                    phase={submitPhase}
                    running={submitIsRunning}
                    submissionUri={encryptedSubmissionUri}
                    uriError={submitUriError}
                    onSubmissionUriChange={setEncryptedSubmissionUri}
                  />
                ) : (
                  <SoftCard className="p-5 font-bold text-slate-700">
                    Chưa có action khả dụng cho trạng thái hiện tại.
                  </SoftCard>
                )}
              </div>
            </Card>
            <TechnicalDetails
              task={task}
              stakeProof={stakeProof}
              submitProof={submitProof}
            />
          </>
        ) : null}
      </section>
    </main>
  );
}

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <SoftCard className="min-w-0 p-4">
      <p className="text-sm font-black uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <div className="mt-1 break-all font-black leading-6 text-slate-950">
        {value}
      </div>
    </SoftCard>
  );
}

function AddressValue({
  address,
  link = false,
  showFull = false,
}: {
  address?: string;
  link?: boolean;
  showFull?: boolean;
}) {
  if (!address) return <>N/A</>;

  const label = showFull ? address : shortAddress(address);

  if (!link) {
    return (
      <span>
        {label}
        {showFull ? null : <span className="sr-only"> {address}</span>}
      </span>
    );
  }

  return (
    <a
      href={explorerAccountUrl(address)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 underline decoration-2 underline-offset-2"
    >
      {label}
      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
    </a>
  );
}

function UriValue({ value }: { value?: string }) {
  if (!value) return <>N/A</>;

  if (!/^https?:\/\//i.test(value)) {
    return <span>{value}</span>;
  }

  return (
    <a
      href={value}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 underline decoration-2 underline-offset-2"
    >
      {value}
      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
    </a>
  );
}

function StakeAction({
  canRunStake,
  error,
  helpText,
  onStake,
  stakeAmount,
  phase,
  running,
}: {
  canRunStake: boolean;
  error: string;
  helpText: string;
  onStake: () => void;
  stakeAmount?: string;
  phase: StakePhase;
  running: boolean;
}) {
  const phaseText =
    phase === "preparing"
      ? "Đang chuẩn bị..."
      : phase === "sending"
      ? "Đang gửi transaction..."
      : phase === "confirming"
      ? "Đang confirm..."
      : phase === "indexing"
      ? "Đang index Mongo..."
      : phase === "success"
      ? "Stake completed"
      : phase === "error"
      ? "Stake failed"
      : "Ready";

  return (
    <Card tone="worker" className="p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-950">
            Stake to Unlock
          </h2>
          <p className="mt-2 font-bold leading-7 text-slate-700">
            Bạn cần đặt cọc {stakeAmount ?? "mức stake được yêu cầu"} để nhận
            task này. Tiền cọc sẽ được hoàn lại sau khi hoàn thành.
          </p>
          {!canRunStake ? (
            <p className="mt-2 text-sm font-bold text-slate-600">{helpText}</p>
          ) : null}
        </div>
        <Badge
          className={
            phase === "success"
              ? "bg-[var(--status-success)]"
              : phase === "error"
              ? "bg-[var(--status-danger)]"
              : undefined
          }
        >
          {phaseText}
        </Badge>
      </div>

      <Button
        type="button"
        className="mt-5 w-full bg-[#1D4ED8] text-white shadow-[4px_4px_0_#111827]"
        disabled={!canRunStake || running}
        onClick={onStake}
      >
        {running ? "Đang xử lý..." : "Stake to unlock"}
      </Button>

      {error ? (
        <SoftCard className="mt-4 border-rose-700 bg-rose-50 p-3 font-bold text-rose-700">
          {error}
        </SoftCard>
      ) : null}
    </Card>
  );
}

function deadlineTextTone(value?: string) {
  if (!value) return "text-slate-950";
  const deadline = new Date(value).getTime();
  if (Number.isNaN(deadline)) return "text-slate-950";
  const remaining = deadline - Date.now();
  if (remaining < 0) return "text-rose-700";
  if (remaining < 24 * 60 * 60 * 1000) return "text-amber-700";
  return "text-slate-950";
}

function FinancialItem({
  label,
  value,
  valueClassName = "text-slate-950",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <SoftCard className="border-slate-950 bg-[#EFF6FF] p-4">
      <p className="text-xs font-black uppercase tracking-wide text-slate-600">
        {label}
      </p>
      <p className={"mt-2 break-words text-lg font-black " + valueClassName}>
        {value}
      </p>
    </SoftCard>
  );
}

function WorkRequirements({ task }: { task: WorkerTask }) {
  const documentUri = task.publicMetadataUri ?? task.encryptedTaskDetailUri;
  return (
    <div className="rounded-lg border-2 border-slate-950 bg-[#FFFDF3] p-5">
      <h2 className="text-2xl font-black text-slate-950">Yêu cầu công việc</h2>
      <p className="mt-2 max-w-2xl font-bold leading-7 text-slate-700">
        Mở tài liệu để đọc yêu cầu và tiêu chí bàn giao trước khi quyết định
        nhận task.
      </p>
      {documentUri ? (
        <a
          href={documentUri}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg border-2 border-slate-950 bg-white px-4 font-extrabold shadow-[3px_3px_0_#111827] transition hover:-translate-y-0.5"
        >
          Xem tài liệu hướng dẫn <ExternalLink className="size-4" />
        </a>
      ) : (
        <p className="mt-4 font-bold text-slate-600">
          Chưa có tài liệu hướng dẫn cho task này.
        </p>
      )}
    </div>
  );
}

function TechnicalDetails({
  task,
  stakeProof,
  submitProof,
}: {
  task: WorkerTask;
  stakeProof: StakeProof | null;
  submitProof: SubmitProof | null;
}) {
  return (
    <details className="group rounded-lg border-2 border-slate-950 bg-white p-5 sm:p-6">
      <summary className="cursor-pointer list-none text-lg font-black text-slate-950">
        Thông tin On-chain (Solana Devnet){" "}
        <span className="text-sm font-bold text-slate-600">
          — Bấm để xem chi tiết
        </span>
      </summary>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <TechnicalAddress label="Task PDA" address={task.taskPda} />
        <TechnicalAddress
          label="Escrow Vault"
          address={task.escrowTokenVault}
        />
        <TechnicalAddress label="Token Mint" address={task.tokenMint} />
        <TechnicalAddress label="Program ID" address={PROGRAM_ID.toBase58()} />
      </div>
      {stakeProof || submitProof ? (
        <div className="mt-5 grid gap-5">
          {stakeProof ? <StakeProofBlock proof={stakeProof} /> : null}
          {submitProof ? <SubmitProofBlock proof={submitProof} /> : null}
        </div>
      ) : null}
    </details>
  );
}

function TechnicalAddress({
  label,
  address,
}: {
  label: string;
  address?: string;
}) {
  if (!address) return null;
  return (
    <SoftCard className="min-w-0 p-4">
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <a
        href={explorerAccountUrl(address)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex min-w-0 items-center gap-2 break-all font-black underline decoration-2 underline-offset-2"
      >
        {shortAddress(address)} <ExternalLink className="size-4 shrink-0" />
      </a>
    </SoftCard>
  );
}

function StakeProofBlock({ proof }: { proof: StakeProof | null }) {
  return (
    <Card tone="worker" className="p-5 sm:p-6">
      <h2 className="text-2xl font-black text-slate-950">Stake Proof</h2>
      {!proof ? (
        <EmptyProofState message="Chưa có stake proof local trong phiên này." />
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {proof.indexStatus === "index_failed" ? (
            <SoftCard className="border-[#FFD84D] bg-[#FFF7C7] p-3 font-bold md:col-span-2">
              Stake on-chain thành công nhưng Mongo indexing failed/stale.
              {proof.indexError ? (
                <span className="mt-1 block break-all">{proof.indexError}</span>
              ) : null}
            </SoftCard>
          ) : null}

          <DetailItem
            label="Stake tx"
            value={
              <a
                href={proof.explorerTxUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 underline decoration-2 underline-offset-2"
              >
                {proof.signature}
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              </a>
            }
          />
          <DetailItem label="Tx slot" value={String(proof.slot ?? "N/A")} />
          <DetailItem
            label="Index status"
            value={proof.indexStatus ?? "pending"}
          />
          <DetailItem
            label="Indexed slot"
            value={String(proof.indexedSlot ?? "N/A")}
          />
          <DetailItem
            label="Worker escrow"
            value={<AddressValue address={proof.workerEscrow} link showFull />}
          />
          <DetailItem label="Index error" value={proof.indexError ?? "N/A"} />
          {proof.accounts?.length ? (
            <DetailItem
              label="Accounts"
              value={
                <div className="grid gap-2">
                  {proof.accounts.map((account) => (
                    <AccountLinkValue
                      key={`${account.label}-${account.address}`}
                      label={account.label}
                      address={account.address}
                      url={account.url}
                    />
                  ))}
                </div>
              }
            />
          ) : null}
        </div>
      )}
    </Card>
  );
}

function SubmitAction({
  canRunSubmit,
  error,
  helpText,
  onSubmit,
  onSubmissionUriChange,
  phase,
  running,
  submissionUri,
  uriError,
}: {
  canRunSubmit: boolean;
  error: string;
  helpText: string;
  onSubmit: () => void;
  onSubmissionUriChange: (value: string) => void;
  phase: SubmitPhase;
  running: boolean;
  submissionUri: string;
  uriError: string;
}) {
  const phaseText =
    phase === "preparing"
      ? "Đang chuẩn bị..."
      : phase === "sending"
      ? "Đang gửi transaction..."
      : phase === "confirming"
      ? "Đang confirm..."
      : phase === "indexing"
      ? "Đang index Mongo..."
      : phase === "success"
      ? "Submit completed"
      : phase === "error"
      ? "Submit failed"
      : "Ready";

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-black text-slate-950">Submit work</h3>
          <p className="mt-1 font-bold text-slate-700">{helpText}</p>
        </div>
        <Badge className={phase === "success" ? "bg-[#79F2C0]" : undefined}>
          {phaseText}
        </Badge>
      </div>

      <label className="mt-4 block">
        <span className="text-xs font-black uppercase text-slate-500">
          encryptedSubmissionUri
        </span>
        <input
          value={submissionUri}
          onChange={(event) => onSubmissionUriChange(event.target.value)}
          placeholder="enc://..., ipfs://..., ar://..., https://..., local://..."
          disabled={running}
          className="mt-1 h-11 w-full rounded-lg border-2 border-slate-950 bg-white px-3 text-sm font-bold outline-none focus:ring-4 focus:ring-[#FFD84D] disabled:cursor-not-allowed disabled:opacity-60"
        />
      </label>

      <p className="mt-2 text-sm font-bold text-slate-600">
        URI phải trỏ tới payload đã mã hóa/private, sẽ được ghi on-chain.
      </p>

      {uriError && submissionUri.trim() ? (
        <p className="mt-2 text-sm font-black text-rose-700">{uriError}</p>
      ) : null}

      <Button
        tone="worker"
        type="button"
        className="mt-4 w-full"
        disabled={!canRunSubmit || running}
        onClick={onSubmit}
      >
        {running ? "Đang xử lý..." : "Submit and assign"}
      </Button>

      {error ? (
        <SoftCard className="mt-4 border-rose-700 bg-rose-50 p-3 font-bold text-rose-700">
          {error}
        </SoftCard>
      ) : null}
    </Card>
  );
}

function SubmitProofBlock({ proof }: { proof: SubmitProof | null }) {
  return (
    <Card tone="worker" className="p-5 sm:p-6">
      <h2 className="text-2xl font-black text-slate-950">Submit Proof</h2>
      {!proof ? (
        <EmptyProofState message="Chưa có submit proof local trong phiên này." />
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {proof.indexStatus === "index_failed" ? (
            <SoftCard className="border-[#FFD84D] bg-[#FFF7C7] p-3 font-bold md:col-span-2">
              Submit on-chain thành công nhưng Mongo indexing failed/stale.
              {proof.indexError ? (
                <span className="mt-1 block break-all">{proof.indexError}</span>
              ) : null}
            </SoftCard>
          ) : null}

          <DetailItem
            label="Submit tx"
            value={
              <a
                href={proof.explorerTxUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 underline decoration-2 underline-offset-2"
              >
                {proof.signature}
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              </a>
            }
          />
          <DetailItem label="Tx slot" value={String(proof.slot ?? "N/A")} />
          <DetailItem
            label="Index status"
            value={proof.indexStatus ?? "pending"}
          />
          <DetailItem
            label="Indexed slot"
            value={String(proof.indexedSlot ?? "N/A")}
          />
          <DetailItem
            label="encryptedSubmissionUri"
            value={<UriValue value={proof.encryptedSubmissionUri} />}
          />
          <DetailItem label="Index error" value={proof.indexError ?? "N/A"} />
          <DetailItem
            label="Assigned judges"
            value={
              proof.assignedJudges?.length ? (
                <div className="grid gap-2">
                  {proof.assignedJudges.map((judge) => (
                    <AddressValue key={judge} address={judge} link showFull />
                  ))}
                </div>
              ) : (
                "N/A"
              )
            }
          />
          {proof.accounts?.length ? (
            <DetailItem
              label="Accounts"
              value={
                <div className="grid gap-2">
                  {proof.accounts.map((account) => (
                    <AccountLinkValue
                      key={`${account.label}-${account.address}`}
                      label={account.label}
                      address={account.address}
                      url={account.url}
                    />
                  ))}
                </div>
              }
            />
          ) : null}
        </div>
      )}
    </Card>
  );
}

function EmptyProofState({ message }: { message: string }) {
  return (
    <SoftCard className="mt-4 p-4 text-sm font-bold text-slate-600">
      {message}
    </SoftCard>
  );
}

function AccountLinkValue({
  address,
  label,
  url,
}: {
  address: string;
  label: string;
  url?: string;
}) {
  return (
    <div className="min-w-0">
      <span className="text-xs uppercase text-slate-500">{label}: </span>
      <a
        href={url ?? explorerAccountUrl(address)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-w-0 items-center gap-1 break-all underline decoration-2 underline-offset-2"
      >
        {address}
        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
      </a>
    </div>
  );
}
