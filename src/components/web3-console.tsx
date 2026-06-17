"use client";

import "@/lib/polyfills";
import { PublicKey } from "@solana/web3.js";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useAnchorWallet, useWallet } from "@solana/wallet-adapter-react";
import useSWR from "swr";
import { useEffect, useMemo, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SoftCard } from "@/components/ui/card";
import { Field, FieldLabel, Input } from "@/components/ui/form";
import {
  DEMO_TOKEN_MINT,
  PROGRAM_ID,
  RPC_URL,
  accountLink,
  cancelOpenTask,
  createAssociatedTokenAccountForConnectedWallet,
  createProgram,
  fetchJudgeRegistry,
  fetchSystemConfig,
  fetchTask,
  fetchTasks,
  fetchWorkerTasks,
  getAssociatedTokenAddress,
  initializeTask,
  mapSolanaError,
  stakeToUnlock,
  submitAndAssign,
  type AnchorWalletLike,
  type Web3Result,
} from "@/lib/solana/client";
import type { IndexedTask } from "@/lib/types/quests";

type Role = "requestor" | "worker";
type WorkerTab = "open" | "active" | "submit" | "proof";
const LOG_PREFIX = "[task-web]";

function logInfo(message: string, details?: unknown) {
  console.info(`${LOG_PREFIX} ${message}`, details ?? "");
}

function logError(message: string, details?: unknown) {
  console.error(`${LOG_PREFIX} ${message}`, details ?? "");
}

function toDatetimeLocal(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function shortAddress(value?: string | null) {
  if (!value) return "";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function sortTasks(tasks: IndexedTask[]) {
  return [...tasks].sort((a, b) => Number(b.id) - Number(a.id));
}

function proofFromAta(result: Awaited<ReturnType<typeof createAssociatedTokenAccountForConnectedWallet>>): Web3Result | null {
  if (!result.signature) return null;
  return {
    signature: result.signature,
    explorerTxUrl: result.explorerTxUrl,
    slot: result.slot,
    isSimulated: false,
    taskId: "",
    taskPda: "",
    accounts: [accountLink("associatedTokenAccount", result.associatedTokenAccount)],
  };
}

export function Web3Console() {
  const anchorWallet = useAnchorWallet();
  const { publicKey, connected } = useWallet();
  const wallet = anchorWallet as AnchorWalletLike | undefined;
  const walletAddress = publicKey?.toBase58() ?? "";

  useEffect(() => {
    logInfo("Web3Console mounted");
  }, []);

  const [role, setRole] = useState<Role>("requestor");
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [proof, setProof] = useState<Web3Result | null>(null);
  const [selectedTask, setSelectedTask] = useState<IndexedTask | null>(null);

  const now = Date.now();
  const [taskId, setTaskId] = useState(String(Date.now()));
  const [lookupTaskId, setLookupTaskId] = useState("1003");
  const [tokenMint, setTokenMint] = useState(DEMO_TOKEN_MINT);
  const [requestorTokenAccount, setRequestorTokenAccount] = useState("");
  const [cancelRequestorTokenAccount, setCancelRequestorTokenAccount] = useState("");
  const [bountyAmount, setBountyAmount] = useState("1");
  const [workerStakeAmount, setWorkerStakeAmount] = useState("1");
  const [requiredJudgesM, setRequiredJudgesM] = useState(1);
  const [approvalThresholdN, setApprovalThresholdN] = useState(1);
  const [submissionDeadline, setSubmissionDeadline] = useState(toDatetimeLocal(new Date(now + 2 * 86400_000)));
  const [votingDeadline, setVotingDeadline] = useState(toDatetimeLocal(new Date(now + 3 * 86400_000)));
  const [publicMetadataUri, setPublicMetadataUri] = useState(`ipfs://task-${Date.now()}`);
  const [encryptedTaskDetailUri, setEncryptedTaskDetailUri] = useState(`enc://task-detail-${Date.now()}`);

  const [workerTab, setWorkerTab] = useState<WorkerTab>("open");
  const [workerSearch, setWorkerSearch] = useState("");
  const [workerTaskId, setWorkerTaskId] = useState("1003");
  const [workerSubmissionUri, setWorkerSubmissionUri] = useState(`enc://submission-${Date.now()}`);
  const [workerSettlementMint, setWorkerSettlementMint] = useState(DEMO_TOKEN_MINT);
  const [workerTokenAccount, setWorkerTokenAccount] = useState("");

  const program = useMemo(() => (wallet ? createProgram(wallet) : null), [wallet, walletAddress]);

  useEffect(() => {
    logInfo("Wallet state changed", { connected, walletAddress });
  }, [connected, walletAddress]);

  useEffect(() => {
    logInfo("Role changed", { role });
  }, [role]);

  const tasksQuery = useSWR(
    program ? ["tasks", walletAddress] : null,
    async () => sortTasks(await fetchTasks(program!)),
    {
      revalidateOnFocus: false,
      onSuccess: (items) => logInfo("Fetched tasks", { count: items.length }),
      onError: (caught) => logError("Failed to fetch tasks", caught),
    }
  );

  const workerTasksQuery = useSWR(
    program && role === "worker" && walletAddress ? ["worker-tasks", walletAddress] : null,
    async () => sortTasks(await fetchWorkerTasks(program!, walletAddress)),
    {
      revalidateOnFocus: false,
      onSuccess: (items) => logInfo("Fetched worker tasks", { count: items.length, walletAddress }),
      onError: (caught) => logError("Failed to fetch worker tasks", caught),
    }
  );

  const protocolQuery = useSWR(
    program ? ["protocol", walletAddress] : null,
    async () => {
      const [system, registry] = await Promise.all([fetchSystemConfig(program!), fetchJudgeRegistry(program!)]);
      return { system, registry };
    },
    {
      revalidateOnFocus: false,
      onSuccess: (state) =>
        logInfo("Fetched protocol state", {
          systemConfig: state.system.address,
          judgeRegistry: state.registry.address,
          activeJudges: state.registry.activeCount,
        }),
      onError: (caught) => logError("Failed to fetch protocol state", caught),
    }
  );

  const tasks = tasksQuery.data ?? [];
  const requestorTasks = tasks.filter((task) => task.requestor === walletAddress);
  const workerOpenTasks = tasks.filter((task) => {
    const query = workerSearch.trim().toLowerCase();
    const matches =
      !query ||
      task.id.toLowerCase().includes(query) ||
      task.requestor.toLowerCase().includes(query) ||
      task.status.toLowerCase().includes(query) ||
      task.taskPda.toLowerCase().includes(query);
    return task.status === "Open" && matches;
  });
  const workerActiveTasks = workerTasksQuery.data ?? [];
  const selectedWorkerTask = tasks.find((task) => task.id === workerTaskId) ?? workerActiveTasks.find((task) => task.id === workerTaskId) ?? null;

  async function run(label: string, action: () => Promise<Web3Result | null | void>) {
    if (!wallet) {
      setError("Connect Phantom wallet first.");
      return;
    }
    setLoading(label);
    setError("");
    setProof(null);
    logInfo("Action started", { label, role, walletAddress });
    try {
      const result = await action();
      if (result) setProof(result);
      await Promise.all([tasksQuery.mutate(), workerTasksQuery.mutate(), protocolQuery.mutate()]);
      logInfo("Action completed", {
        label,
        signature: result?.signature,
        taskPda: result?.taskPda,
      });
    } catch (caught) {
      logError("Action failed", { label, caught });
      setError(mapSolanaError(caught));
    } finally {
      setLoading("");
    }
  }

  async function getWorkerTaskForAction() {
    const id = workerTaskId.trim();
    if (!id) throw new Error("taskId is required.");
    const cached = [...tasks, ...workerActiveTasks].find((task) => task.id === id);
    if (cached) return cached;
    if (!program) throw new Error("Connect Phantom wallet first.");
    return fetchTask(program, id);
  }

  function deriveRequestorAta() {
    if (!publicKey) return;
    setRequestorTokenAccount(getAssociatedTokenAddress(publicKey, new PublicKey(tokenMint)).toBase58());
  }

  function deriveCancelRequestorAta(mintValue?: string) {
    if (!publicKey) return;
    const mint = mintValue ?? selectedTask?.tokenMint ?? tokenMint;
    setCancelRequestorTokenAccount(getAssociatedTokenAddress(publicKey, new PublicKey(mint)).toBase58());
  }

  function deriveWorkerAta() {
    if (!publicKey) return;
    const mint = selectedWorkerTask?.tokenMint ?? workerSettlementMint;
    setWorkerSettlementMint(mint);
    setWorkerTokenAccount(getAssociatedTokenAddress(publicKey, new PublicKey(mint)).toBase58());
  }

  function selectWorkerTask(task: IndexedTask, tab: WorkerTab = "submit") {
    setWorkerTaskId(task.id);
    setWorkerSettlementMint(task.tokenMint);
    setWorkerTab(tab);
    if (publicKey) {
      setWorkerTokenAccount(getAssociatedTokenAddress(publicKey, new PublicKey(task.tokenMint)).toBase58());
    }
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto flex w-[min(1180px,calc(100%-32px))] flex-col gap-4 py-7">
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex flex-wrap justify-between gap-4">
            <div>
              <p className="mb-1 text-xs font-black uppercase">Solana Devnet</p>
              <h1 className="text-3xl font-black sm:text-5xl">Task Contract Web3 Console</h1>
              <p className="mt-2 break-all font-bold">
                Program {PROGRAM_ID.toBase58()} · RPC {RPC_URL}
              </p>
            </div>
            <div className="flex flex-wrap items-start gap-2">
              {connected ? <SoftCard className="px-3 py-2 font-black">{shortAddress(walletAddress)}</SoftCard> : null}
              <WalletMultiButton />
              <Button variant="secondary" disabled={!wallet || Boolean(loading)} onClick={() => tasksQuery.mutate()}>
                <RefreshCw data-icon="inline-start" />
                Refresh
              </Button>
            </div>
          </div>

          {connected ? (
            <div className="flex flex-wrap gap-2">
              {(["requestor", "worker"] as Role[]).map((item) => (
                <Button key={item} variant={role === item ? "default" : "secondary"} onClick={() => setRole(item)}>
                  {item === "requestor" ? "Requestor" : "Worker"}
                </Button>
              ))}
            </div>
          ) : null}
        </Card>

        {!connected ? (
          <Card className="p-5">
            <h2 className="mb-2 text-2xl font-black">Phase 1</h2>
            <p className="font-bold">Connect Phantom, switch to Devnet, then choose Requestor or Worker.</p>
          </Card>
        ) : (
          <>
            <Card className="grid gap-2 p-4">
              <h2 className="text-xl font-black">Protocol State</h2>
              <p className="break-all">
                <strong>systemConfig:</strong> {protocolQuery.data?.system.address ?? "Loading"}
              </p>
              <p className="break-all">
                <strong>judgeRegistry:</strong>{" "}
                {protocolQuery.data
                  ? `${protocolQuery.data.registry.activeCount} active judges: ${protocolQuery.data.registry.judges.join(", ") || "none"}`
                  : "Loading"}
              </p>
            </Card>

            {role === "requestor" ? (
              <>
                <Card className="p-5">
                  <h2 className="mb-4 text-2xl font-black">Phase 2 · Requestor Create Task</h2>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field><FieldLabel>taskId</FieldLabel><Input value={taskId} onChange={(event) => setTaskId(event.target.value)} /></Field>
                    <Field><FieldLabel>tokenMint</FieldLabel><Input value={tokenMint} onChange={(event) => setTokenMint(event.target.value)} /></Field>
                    <Field><FieldLabel>requestorTokenAccount</FieldLabel><Input value={requestorTokenAccount} onChange={(event) => setRequestorTokenAccount(event.target.value)} /></Field>
                    <div className="flex flex-wrap items-end gap-2">
                      <Button variant="secondary" onClick={deriveRequestorAta}>Find ATA</Button>
                      <Button
                        variant="secondary"
                        disabled={!wallet || Boolean(loading)}
                        onClick={() => run("Creating requestor ATA", async () => proofFromAta(await createAssociatedTokenAccountForConnectedWallet(wallet!, tokenMint)))}
                      >
                        Create ATA
                      </Button>
                    </div>
                    <Field><FieldLabel>bountyAmount base units</FieldLabel><Input value={bountyAmount} onChange={(event) => setBountyAmount(event.target.value)} /></Field>
                    <Field><FieldLabel>workerStakeAmount lamports</FieldLabel><Input value={workerStakeAmount} onChange={(event) => setWorkerStakeAmount(event.target.value)} /></Field>
                    <Field><FieldLabel>requiredJudgesM</FieldLabel><Input type="number" value={requiredJudgesM} onChange={(event) => setRequiredJudgesM(Number(event.target.value))} /></Field>
                    <Field><FieldLabel>approvalThresholdN</FieldLabel><Input type="number" value={approvalThresholdN} onChange={(event) => setApprovalThresholdN(Number(event.target.value))} /></Field>
                    <Field><FieldLabel>submissionDeadline</FieldLabel><Input type="datetime-local" value={submissionDeadline} onChange={(event) => setSubmissionDeadline(event.target.value)} /></Field>
                    <Field><FieldLabel>votingDeadline</FieldLabel><Input type="datetime-local" value={votingDeadline} onChange={(event) => setVotingDeadline(event.target.value)} /></Field>
                    <Field><FieldLabel>publicMetadataUri</FieldLabel><Input value={publicMetadataUri} onChange={(event) => setPublicMetadataUri(event.target.value)} /></Field>
                    <Field><FieldLabel>encryptedTaskDetailUri</FieldLabel><Input value={encryptedTaskDetailUri} onChange={(event) => setEncryptedTaskDetailUri(event.target.value)} /></Field>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      disabled={!wallet || Boolean(loading)}
                      onClick={() =>
                        run("Initializing task on Devnet", async () =>
                          initializeTask(wallet!, {
                            taskId,
                            tokenMint,
                            requestorTokenAccount,
                            bountyAmount,
                            workerStakeAmount,
                            requiredJudgesM,
                            approvalThresholdN,
                            submissionDeadline: new Date(submissionDeadline),
                            votingDeadline: new Date(votingDeadline),
                            publicMetadataUri,
                            encryptedTaskDetailUri,
                            encryptedSubmissionUri: "",
                          })
                        )
                      }
                    >
                      Initialize Task
                    </Button>
                  </div>
                </Card>

                <Card className="p-5">
                  <h2 className="mb-4 text-2xl font-black">Requestor Task Detail</h2>
                  <div className="flex flex-wrap gap-2">
                    <Input className="max-w-64" value={lookupTaskId} onChange={(event) => setLookupTaskId(event.target.value)} />
                    <Button
                      variant="secondary"
                      disabled={!program}
	                      onClick={async () => {
	                        if (!program) return;
	                        setError("");
	                        try {
	                          const task = await fetchTask(program, lookupTaskId);
	                          setSelectedTask(task);
	                          if (!cancelRequestorTokenAccount && publicKey) {
	                            setCancelRequestorTokenAccount(
	                              getAssociatedTokenAddress(publicKey, new PublicKey(task.tokenMint)).toBase58()
	                            );
	                          }
	                        } catch (caught) {
	                          setError(mapSolanaError(caught));
	                        }
	                      }}
	                    >
	                      Fetch Task
	                    </Button>
	                    <Button
	                      variant="danger"
	                      disabled={!wallet || Boolean(loading)}
	                      onClick={() =>
	                        run("Cancelling open task", async () =>
	                          cancelOpenTask(wallet!, lookupTaskId, cancelRequestorTokenAccount.trim() || undefined)
	                        )
	                      }
	                    >
	                      Cancel Open Task
	                    </Button>
	                  </div>
	                  <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
	                    <Field>
	                      <FieldLabel>refund requestorTokenAccount</FieldLabel>
	                      <Input value={cancelRequestorTokenAccount} onChange={(event) => setCancelRequestorTokenAccount(event.target.value)} />
	                    </Field>
	                    <div className="flex items-end">
	                      <Button variant="secondary" onClick={() => deriveCancelRequestorAta()}>Use ATA</Button>
	                    </div>
	                  </div>
	                  <TaskList tasks={selectedTask ? [selectedTask] : requestorTasks} />
	                </Card>
              </>
            ) : (
              <Card className="flex flex-col gap-4 p-5">
                <div className="flex flex-wrap justify-between gap-3">
                  <div>
                    <p className="mb-1 text-xs font-black uppercase">Phase 3</p>
                    <h2 className="text-2xl font-black">Worker Dashboard</h2>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(["open", "active", "submit", "proof"] as WorkerTab[]).map((tab) => (
                      <Button key={tab} variant={workerTab === tab ? "default" : "secondary"} onClick={() => setWorkerTab(tab)}>
                        {tab === "open" ? "Open Tasks" : tab === "active" ? "My Active" : tab === "submit" ? "Submit" : "Proof Log"}
                      </Button>
                    ))}
                  </div>
                </div>

                {workerTab === "open" ? (
                  <>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field>
                        <FieldLabel>Search taskId / requestor / status</FieldLabel>
                        <Input value={workerSearch} onChange={(event) => setWorkerSearch(event.target.value)} placeholder="1003, requestor, Open" />
                      </Field>
                    </div>
                    <WorkerTaskList tasks={workerOpenTasks} walletAddress={walletAddress} loading={Boolean(loading)} onSelect={selectWorkerTask} onStake={(task) => {
                      selectWorkerTask(task, "submit");
                      run("Worker staking", async () => {
                        const latest = await getWorkerTaskForAction();
                        if (latest.status !== "Open") throw new Error(`InvalidStatus: task ${latest.id} is ${latest.status}, expected Open.`);
                        return stakeToUnlock(wallet!, latest.id);
                      });
                    }} />
                  </>
                ) : workerTab === "active" ? (
                  <>
                    <SoftCard className="flex flex-wrap justify-between gap-2 p-3">
                      <strong>{workerActiveTasks.length} active worker task(s)</strong>
                      <Button variant="secondary" size="sm" onClick={() => workerTasksQuery.mutate()}>Refresh</Button>
                    </SoftCard>
                    <WorkerTaskList tasks={workerActiveTasks} walletAddress={walletAddress} loading={Boolean(loading)} onSelect={selectWorkerTask} />
                  </>
                ) : workerTab === "submit" ? (
                  <>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field><FieldLabel>taskId</FieldLabel><Input value={workerTaskId} onChange={(event) => setWorkerTaskId(event.target.value)} /></Field>
                      <Field><FieldLabel>encryptedSubmissionUri</FieldLabel><Input value={workerSubmissionUri} onChange={(event) => setWorkerSubmissionUri(event.target.value)} /></Field>
                      <Field><FieldLabel>worker token mint</FieldLabel><Input value={workerSettlementMint} onChange={(event) => setWorkerSettlementMint(event.target.value)} /></Field>
                      <Field><FieldLabel>workerTokenAccount for settlement</FieldLabel><Input value={workerTokenAccount} onChange={(event) => setWorkerTokenAccount(event.target.value)} /></Field>
                    </div>
                    {selectedWorkerTask ? <TaskSummary task={selectedWorkerTask} /> : null}
                    <div className="flex flex-wrap gap-2">
                      <Button disabled={!wallet || !workerTaskId.trim() || Boolean(loading)} onClick={() => run("Worker staking", async () => {
                        const task = await getWorkerTaskForAction();
                        if (task.status !== "Open") throw new Error(`InvalidStatus: task ${task.id} is ${task.status}, expected Open.`);
                        setWorkerSettlementMint(task.tokenMint);
                        return stakeToUnlock(wallet!, task.id);
                      })}>Stake To Unlock</Button>
                      <Button disabled={!wallet || !workerTaskId.trim() || !workerSubmissionUri.trim() || Boolean(loading)} onClick={() => run("Worker submitting and assigning judges", async () => {
                        const task = await getWorkerTaskForAction();
                        if (task.status !== "InProgress") throw new Error(`InvalidStatus: task ${task.id} is ${task.status}, expected InProgress.`);
                        if (task.worker !== walletAddress) throw new Error("InvalidStatus: connected wallet is not the worker assigned to this task.");
                        setWorkerSettlementMint(task.tokenMint);
                        return submitAndAssign(wallet!, task.id, workerSubmissionUri.trim());
                      })}>Submit And Assign</Button>
                      <Button variant="secondary" onClick={deriveWorkerAta}>Find Worker ATA</Button>
                      <Button variant="secondary" disabled={!wallet || Boolean(loading)} onClick={() => run("Creating worker ATA", async () => proofFromAta(await createAssociatedTokenAccountForConnectedWallet(wallet!, workerSettlementMint)))}>Create Worker ATA</Button>
                    </div>
                  </>
                ) : proof ? (
                  <ProofPanel proof={proof} />
                ) : (
                  <SoftCard className="p-4 font-bold">No worker transaction proof yet.</SoftCard>
                )}
              </Card>
            )}
          </>
        )}

        {loading ? <SoftCard className="p-3 font-black">{loading}...</SoftCard> : null}
        {error ? <SoftCard className="border-rose-700 p-3 font-bold">{error}</SoftCard> : null}
        {proof && !(role === "worker" && workerTab === "proof") ? <ProofPanel proof={proof} /> : null}
      </div>
    </main>
  );
}

function TaskList({ tasks }: { tasks: IndexedTask[] }) {
  if (!tasks.length) return <SoftCard className="mt-4 p-4 font-bold">No on-chain task loaded.</SoftCard>;
  return (
    <div className="mt-4 grid gap-3">
      {tasks.slice(0, 8).map((task) => (
        <TaskSummary key={task.taskPda} task={task} />
      ))}
    </div>
  );
}

function WorkerTaskList({
  tasks,
  walletAddress,
  loading,
  onSelect,
  onStake,
}: {
  tasks: IndexedTask[];
  walletAddress: string;
  loading: boolean;
  onSelect: (task: IndexedTask, tab?: WorkerTab) => void;
  onStake?: (task: IndexedTask) => void;
}) {
  if (!tasks.length) return <SoftCard className="p-4 font-bold">No on-chain task matched this view.</SoftCard>;
  return (
    <div className="grid gap-3">
      {tasks.slice(0, 12).map((task) => (
        <SoftCard key={task.taskPda} className="grid gap-3 p-4">
          <div className="flex flex-wrap justify-between gap-3">
            <div>
              <strong>Task #{task.id}</strong>
              <div><Badge>{task.status}</Badge></div>
            </div>
            <div className="flex flex-wrap gap-2">
              {task.status === "Open" && onStake ? <Button disabled={loading} onClick={() => onStake(task)}>Stake To Unlock</Button> : null}
              {task.worker === walletAddress && task.status === "InProgress" ? <Button onClick={() => onSelect(task, "submit")}>Submit</Button> : null}
              <Button variant="secondary" onClick={() => onSelect(task, task.status === "Open" ? "submit" : "active")}>Select</Button>
            </div>
          </div>
          <TaskSummary task={task} compact />
        </SoftCard>
      ))}
    </div>
  );
}

function TaskSummary({ task, compact = false }: { task: IndexedTask; compact?: boolean }) {
  return (
    <SoftCard className={compact ? "border-0 bg-transparent p-0" : "p-4"}>
      <div className="grid gap-2 md:grid-cols-2">
        <p className="break-all"><strong>PDA:</strong> <a href={`https://explorer.solana.com/address/${task.taskPda}?cluster=devnet`} target="_blank" rel="noreferrer">{task.taskPda}</a></p>
        <p className="break-all"><strong>Requestor:</strong> {task.requestor}</p>
        <p className="break-all"><strong>Worker:</strong> {task.worker ?? "none"}</p>
        <p className="break-all"><strong>Token mint:</strong> {task.tokenMint}</p>
        <p><strong>Bounty:</strong> {task.bountyAmount}</p>
        <p><strong>Stake:</strong> {task.workerStakeAmount}</p>
        <p><strong>Judges:</strong> {task.requiredJudgesM} / threshold {task.approvalThresholdN}</p>
        <p><strong>Deadline:</strong> {task.submissionDeadline.toLocaleString()}</p>
        <p className="break-all"><strong>Metadata:</strong> {task.publicMetadataUri}</p>
        <p><strong>Votes:</strong> {task.passVoteCount} pass / {task.failVoteCount} fail</p>
      </div>
      {task.assignedJudges.length ? <p className="mt-2 break-all"><strong>Assigned judges:</strong> {task.assignedJudges.join(", ")}</p> : null}
    </SoftCard>
  );
}

function ProofPanel({ proof }: { proof: Web3Result }) {
  return (
    <Card className="p-5">
      <h2 className="mb-3 text-2xl font-black">Explorer Proof</h2>
      <div className="grid gap-2">
        <p><strong>isSimulated:</strong> {String(proof.isSimulated)}</p>
        {proof.signature ? (
          <p className="break-all">
            <strong>signature:</strong>{" "}
            <a href={proof.explorerTxUrl} target="_blank" rel="noreferrer">
              {proof.signature} <ExternalLink className="inline size-4" />
            </a>
          </p>
        ) : null}
        {proof.slot ? <p><strong>slot:</strong> {proof.slot}</p> : null}
        {proof.taskPda ? <p className="break-all"><strong>taskPda:</strong> {proof.taskPda}</p> : null}
        {proof.accounts.map((account) => (
          <a key={`${account.label}-${account.address}`} href={account.url} target="_blank" rel="noreferrer" className="break-all">
            {account.label}: {account.address}
          </a>
        ))}
      </div>
    </Card>
  );
}
