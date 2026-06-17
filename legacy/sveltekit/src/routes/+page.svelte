<script lang="ts">
  import { onMount } from "svelte";
  import { PublicKey } from "@solana/web3.js";
  import {
    DEMO_TOKEN_MINT,
    PROGRAM_ID,
    RPC_URL,
    accountLink,
    cancelOpenTask,
    claimJudgeFee,
    createAssociatedTokenAccountForConnectedWallet,
    createProgram,
    deriveTaskPda,
    fetchJudgeAssignment,
    fetchJudgeRecord,
    fetchJudgeRegistry,
    fetchSystemConfig,
    fetchTask,
    fetchTasks,
    fetchWorkerTasks,
    getAssociatedTokenAddress,
    initJudgeAssignment,
    initializeTask,
    judgeRegister,
    judgeVote,
    mapSolanaError,
    settlePayment,
    stakeToUnlock,
    submitAndAssign,
    type Web3Result,
  } from "$lib/solana/client";
  import { walletStore, type UserRole } from "$lib/stores/wallet";
  import type { IndexedTask } from "$lib/types/quests";

  type ProofLog = Web3Result | (Web3Result & { multi?: Web3Result[] });

  const roles: { id: UserRole; label: string }[] = [
    { id: "requestor", label: "Requestor" },
    { id: "worker", label: "Worker" },
    { id: "judge", label: "Judge" },
    { id: "payer", label: "Payer" },
  ];

  function toDatetimeLocal(date: Date) {
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  }

  const now = Date.now();
  let loading = "";
  let error = "";
  let proof: ProofLog | null = null;
  let tasks: IndexedTask[] = [];
  let workerFetchedTasks: IndexedTask[] = [];
  let selectedTask: IndexedTask | null = null;
  let systemInfo = "";
  let judgeInfo = "";

  let taskId = String(Date.now());
  let lookupTaskId = "1003";
  let tokenMint = DEMO_TOKEN_MINT;
  let requestorTokenAccount = "";
  let bountyAmount = "1";
  let workerStakeAmount = "1";
  let requiredJudgesM = 1;
  let approvalThresholdN = 1;
  let submissionDeadline = toDatetimeLocal(new Date(now + 2 * 86400_000));
  let votingDeadline = toDatetimeLocal(new Date(now + 3 * 86400_000));
  let publicMetadataUri = `ipfs://task-${Date.now()}`;
  let encryptedTaskDetailUri = `enc://task-detail-${Date.now()}`;
  let encryptedSubmissionUri = "";

  let workerTaskId = "1003";
  let workerSubmissionUri = `enc://submission-${Date.now()}`;
  let workerTab: "open" | "active" | "submit" | "proof" = "open";
  let workerSearch = "";
  let workerSettlementMint = DEMO_TOKEN_MINT;
  let workerAutoRefreshKey = "";
  let judgeTaskId = "1003";
  let judgeStakeLamports = "10000000";
  let judgeTokenAccount = "";
  let payerTaskId = "1003";
  let payerJudge = "";
  let workerTokenAccount = "";
  let payerRequestorTokenAccount = "";

  $: connectedProvider = $walletStore.provider;
  $: connectedPublicKey = $walletStore.publicKey;

  onMount(() => {
    walletStore.detect();
  });

  function requireWallet() {
    if (!connectedProvider || !connectedProvider.publicKey) {
      throw new Error("Connect Phantom on Devnet first.");
    }
    return connectedProvider;
  }

  async function run(label: string, action: () => Promise<Web3Result | Web3Result[] | void>) {
    loading = label;
    error = "";
    proof = null;
    try {
      const result = await action();
      if (Array.isArray(result)) {
        proof = result[0] ? { ...result[0], multi: result } : null;
      } else if (result) {
        proof = result;
      }
      await refreshTasks(false);
    } catch (caught) {
      error = mapSolanaError(caught);
    } finally {
      loading = "";
    }
  }

  async function refreshTasks(showLoading = true) {
    if (!connectedProvider?.publicKey) return;
    if (showLoading) loading = "Fetching on-chain tasks";
    error = "";
    try {
      const program = createProgram(connectedProvider);
      tasks = await fetchTasks(program);
      tasks = tasks.sort((a, b) => Number(b.id) - Number(a.id));
      workerFetchedTasks =
        $walletStore.role === "worker" && connectedPublicKey
          ? await fetchWorkerTasks(program, connectedPublicKey)
          : [];
      await loadProtocolState(program);
    } catch (caught) {
      error = mapSolanaError(caught);
    } finally {
      if (showLoading) loading = "";
    }
  }

  async function loadProtocolState(program = connectedProvider ? createProgram(connectedProvider) : null) {
    if (!program) return;
    const [system, registry] = await Promise.all([
      fetchSystemConfig(program).catch((caught) => ({ error: mapSolanaError(caught) })),
      fetchJudgeRegistry(program).catch((caught) => ({ error: mapSolanaError(caught) })),
    ]);
    systemInfo = "error" in system ? system.error : `${system.address}`;
    judgeInfo =
      "error" in registry
        ? registry.error
        : `${registry.activeCount} active judges: ${registry.judges.join(", ") || "none"}`;
  }

  async function loadTaskById() {
    await run("Fetching task", async () => {
      const wallet = requireWallet();
      const program = createProgram(wallet);
      selectedTask = await fetchTask(program, lookupTaskId);
    });
  }

  async function deriveRequestorAta() {
    if (!connectedProvider?.publicKey) return;
    const mint = new PublicKey(tokenMint);
    requestorTokenAccount = getAssociatedTokenAddress(connectedProvider.publicKey, mint).toBase58();
  }

  async function createMyAtaForMint(target: "requestor" | "worker" | "judge") {
    await run("Creating associated token account", async () => {
      const mintForTarget = target === "worker" ? workerSettlementMint : tokenMint;
      const result = await createAssociatedTokenAccountForConnectedWallet(requireWallet(), mintForTarget);
      if (target === "requestor") requestorTokenAccount = result.associatedTokenAccount;
      if (target === "worker") workerTokenAccount = result.associatedTokenAccount;
      if (target === "judge") judgeTokenAccount = result.associatedTokenAccount;
      if (!result.signature) return;
      return {
        signature: result.signature,
        explorerTxUrl: result.explorerTxUrl,
        slot: result.slot,
        isSimulated: false,
        taskId: "",
        taskPda: "",
        accounts: [accountLink("associatedTokenAccount", result.associatedTokenAccount)],
      };
    });
  }

  async function handleInitializeTask() {
    await run("Initializing task on Devnet", async () =>
      initializeTask(requireWallet(), {
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
    );
  }

  async function handleCancelTask() {
    await run("Cancelling open task", async () => cancelOpenTask(requireWallet(), lookupTaskId));
  }

  async function handleWorkerStake() {
    await run("Worker staking", async () => {
      const task = await getWorkerTaskForAction();
      if (task.status !== "Open") {
        throw new Error(`InvalidStatus: task ${workerTaskId} is ${task.status}, expected Open.`);
      }
      workerSettlementMint = task.tokenMint;
      return stakeToUnlock(requireWallet(), workerTaskId.trim());
    });
  }

  async function handleWorkerSubmit() {
    await run("Worker submitting and assigning judges", async () => {
      const task = await getWorkerTaskForAction();
      if (task.status !== "InProgress") {
        throw new Error(`InvalidStatus: task ${workerTaskId} is ${task.status}, expected InProgress.`);
      }
      if (task.worker !== connectedPublicKey) {
        throw new Error("InvalidStatus: connected wallet is not the worker assigned to this task.");
      }
      if (!workerSubmissionUri.trim()) {
        throw new Error("encryptedSubmissionUri is required.");
      }
      workerSettlementMint = task.tokenMint;
      return submitAndAssign(requireWallet(), workerTaskId.trim(), workerSubmissionUri.trim());
    });
  }

  async function getWorkerTaskForAction() {
    const id = workerTaskId.trim();
    if (!id) throw new Error("taskId is required.");
    const cached = tasks.find((item) => item.id === id);
    if (cached) return cached;

    const program = createProgram(requireWallet());
    const fetched = await fetchTask(program, id);
    tasks = [fetched, ...tasks.filter((item) => item.id !== fetched.id)].sort(
      (a, b) => Number(b.id) - Number(a.id)
    );
    return fetched;
  }

  function selectWorkerTask(task: IndexedTask, tab: "open" | "active" | "submit" = "submit") {
    workerTaskId = task.id;
    workerSettlementMint = task.tokenMint;
    workerTab = tab;
    if (connectedProvider?.publicKey) {
      workerTokenAccount = getAssociatedTokenAddress(
        connectedProvider.publicKey,
        new PublicKey(task.tokenMint)
      ).toBase58();
    }
  }

  function deriveWorkerAta() {
    if (!connectedProvider?.publicKey) return;
    const task = tasks.find((item) => item.id === workerTaskId);
    workerSettlementMint = task?.tokenMint ?? workerSettlementMint;
    workerTokenAccount = getAssociatedTokenAddress(
      connectedProvider.publicKey,
      new PublicKey(workerSettlementMint)
    ).toBase58();
  }

  async function handleJudgeRegister() {
    await run("Registering judge", async () => judgeRegister(requireWallet(), judgeStakeLamports));
  }

  async function handleJudgeVote(isPass: boolean) {
    await run("Casting judge vote", async () => judgeVote(requireWallet(), judgeTaskId, isPass));
  }

  async function handleClaimJudgeFee() {
    await run("Claiming judge fee", async () =>
      claimJudgeFee(requireWallet(), judgeTaskId, judgeTokenAccount)
    );
  }

  async function handleInitAssignments() {
    await run("Initializing judge assignment", async () =>
      initJudgeAssignment(requireWallet(), payerTaskId, payerJudge.trim() || undefined)
    );
  }

  async function handleSettle() {
    await run("Settling payment", async () =>
      settlePayment(requireWallet(), payerTaskId, workerTokenAccount, payerRequestorTokenAccount)
    );
  }

  async function inspectJudgeState() {
    await run("Fetching judge state", async () => {
      const wallet = requireWallet();
      const program = createProgram(wallet);
      const record = await fetchJudgeRecord(program, wallet.publicKey!.toBase58());
      const assignment = await fetchJudgeAssignment(program, judgeTaskId, wallet.publicKey!.toBase58());
      const taskPda = deriveTaskPda(judgeTaskId).toBase58();
      proof = {
        signature: "",
        explorerTxUrl: "",
        isSimulated: false,
        taskId: judgeTaskId,
        taskPda,
        judgeRecord: record.address,
        judgeAssignment: assignment.address,
        accounts: [
          accountLink("taskPda", taskPda),
          accountLink("judgeRecord", record.address),
          accountLink("judgeAssignment", assignment.address),
        ],
      };
    });
  }

  $: roleTasks =
    $walletStore.role === "requestor"
      ? tasks.filter((task) => task.requestor === connectedPublicKey)
      : $walletStore.role === "worker"
        ? tasks.filter((task) => task.status === "Open" || task.worker === connectedPublicKey)
        : $walletStore.role === "judge"
          ? tasks.filter((task) => connectedPublicKey && task.assignedJudges.includes(connectedPublicKey))
          : tasks;

  $: workerOpenTasks = tasks.filter((task) => {
    const query = workerSearch.trim().toLowerCase();
    const matchesQuery =
      !query ||
      task.id.toLowerCase().includes(query) ||
      task.taskPda.toLowerCase().includes(query) ||
      task.requestor.toLowerCase().includes(query) ||
      task.status.toLowerCase().includes(query);
    return task.status === "Open" && matchesQuery;
  });
  $: workerActiveTasks = workerFetchedTasks.filter(
    (task) =>
      task.worker === connectedPublicKey &&
      ["InProgress", "Resolving", "Completed", "Failed", "Inconclusive"].includes(task.status)
  );
  $: selectedWorkerTask = tasks.find((task) => task.id === workerTaskId) ?? null;
  $: if ($walletStore.role !== "worker") {
    workerAutoRefreshKey = "";
  }
  $: if (
    $walletStore.connected &&
    $walletStore.role === "worker" &&
    connectedProvider?.publicKey &&
    connectedPublicKey &&
    workerAutoRefreshKey !== connectedPublicKey
  ) {
    workerAutoRefreshKey = connectedPublicKey;
    refreshTasks(false);
  }
</script>

<main class="page-shell">
  <div class="container" style="padding: 28px 0 56px;">
    <header class="panel" style="padding: 20px; display: grid; gap: 16px;">
      <div style="display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap;">
        <div>
          <p style="margin: 0 0 6px; font-size: 12px; font-weight: 900; text-transform: uppercase;">Solana Devnet</p>
          <h1 style="margin: 0; font-size: clamp(28px, 5vw, 48px);">Task Contract Web3 Console</h1>
          <p style="margin: 8px 0 0; font-weight: 700;">Program {PROGRAM_ID.toBase58()} · RPC {RPC_URL}</p>
        </div>
        <div style="display: flex; gap: 10px; align-items: start; flex-wrap: wrap;">
          {#if $walletStore.connected}
            <span class="panel-soft" style="padding: 10px 12px; font-weight: 900;">{$walletStore.shortAddress}</span>
            <button class="btn secondary" type="button" on:click={() => refreshTasks()}>Refresh</button>
            <button class="btn danger" type="button" on:click={() => walletStore.disconnect()}>Disconnect</button>
          {:else}
            <a class="btn secondary" href="https://phantom.app/" target="_blank" rel="noreferrer">Install Phantom</a>
            <button class="btn" type="button" disabled={$walletStore.connecting} on:click={() => walletStore.connect()}>
              {$walletStore.connecting ? "Connecting" : "Connect Phantom"}
            </button>
          {/if}
        </div>
      </div>

      {#if $walletStore.connected}
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          {#each roles as role}
            <button
              class:secondary={$walletStore.role !== role.id}
              class="btn"
              type="button"
              on:click={() => walletStore.setRole(role.id)}
            >
              {role.label}
            </button>
          {/each}
        </div>
      {/if}

      {#if $walletStore.error}
        <p class="panel-soft" style="margin: 0; padding: 12px; border-color: #c2410c; font-weight: 800;">{$walletStore.error}</p>
      {/if}
    </header>

    {#if !$walletStore.connected}
      <section class="panel" style="margin-top: 18px; padding: 22px;">
        <h2 style="margin: 0 0 8px;">Phase 1</h2>
        <p style="margin: 0; font-weight: 700;">Connect Phantom, switch wallet network to Devnet, then choose a role. No demo wallet is used.</p>
      </section>
    {:else}
      <section class="panel" style="margin-top: 18px; padding: 16px; display: grid; gap: 10px;">
        <h2 style="margin: 0;">Protocol State</h2>
        <p style="margin: 0; word-break: break-all;"><strong>systemConfig:</strong> {systemInfo || "Click Refresh"}</p>
        <p style="margin: 0; word-break: break-all;"><strong>judgeRegistry:</strong> {judgeInfo || "Click Refresh"}</p>
      </section>

      {#if $walletStore.role === "requestor"}
        <section class="panel" style="margin-top: 18px; padding: 20px;">
          <h2 style="margin-top: 0;">Phase 2 · Requestor Create Task</h2>
          <div class="grid-2">
            <label class="field"><span>taskId</span><input class="input" bind:value={taskId} /></label>
            <label class="field"><span>tokenMint</span><input class="input" bind:value={tokenMint} /></label>
            <label class="field"><span>requestorTokenAccount</span><input class="input" bind:value={requestorTokenAccount} /></label>
            <div style="display: flex; gap: 10px; align-items: end; flex-wrap: wrap;">
              <button class="btn secondary" type="button" on:click={deriveRequestorAta}>Find ATA</button>
              <button class="btn secondary" type="button" on:click={() => createMyAtaForMint("requestor")}>Create ATA</button>
            </div>
            <label class="field"><span>bountyAmount base units</span><input class="input" bind:value={bountyAmount} /></label>
            <label class="field"><span>workerStakeAmount lamports</span><input class="input" bind:value={workerStakeAmount} /></label>
            <label class="field"><span>requiredJudgesM</span><input class="input" type="number" min="1" bind:value={requiredJudgesM} /></label>
            <label class="field"><span>approvalThresholdN</span><input class="input" type="number" min="1" bind:value={approvalThresholdN} /></label>
            <label class="field"><span>submissionDeadline</span><input class="input" type="datetime-local" bind:value={submissionDeadline} /></label>
            <label class="field"><span>votingDeadline</span><input class="input" type="datetime-local" bind:value={votingDeadline} /></label>
            <label class="field"><span>publicMetadataUri</span><input class="input" bind:value={publicMetadataUri} /></label>
            <label class="field"><span>encryptedTaskDetailUri</span><input class="input" bind:value={encryptedTaskDetailUri} /></label>
          </div>
          <div style="margin-top: 16px; display: flex; gap: 10px; flex-wrap: wrap;">
            <button class="btn" type="button" disabled={Boolean(loading)} on:click={handleInitializeTask}>Initialize Task</button>
          </div>
        </section>

        <section class="panel" style="margin-top: 18px; padding: 20px;">
          <h2 style="margin-top: 0;">Requestor Task Detail</h2>
          <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            <input class="input" style="max-width: 260px;" bind:value={lookupTaskId} />
            <button class="btn secondary" type="button" on:click={loadTaskById}>Fetch Task</button>
            <button class="btn danger" type="button" on:click={handleCancelTask}>Cancel Open Task</button>
          </div>
          {#if selectedTask}
            {@render taskCards([selectedTask])}
          {:else}
            {@render taskCards(roleTasks)}
          {/if}
        </section>
      {:else if $walletStore.role === "worker"}
        <section class="panel" style="margin-top: 18px; padding: 20px; display: grid; gap: 16px;">
          <div style="display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
            <div>
              <p style="margin: 0 0 6px; font-size: 12px; font-weight: 900; text-transform: uppercase;">Phase 3</p>
              <h2 style="margin: 0;">Worker Dashboard</h2>
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              {#each [
                { id: "open", label: "Open Tasks" },
                { id: "active", label: "My Active" },
                { id: "submit", label: "Submit" },
                { id: "proof", label: "Proof Log" },
              ] as tab}
                <button
                  class:secondary={workerTab !== tab.id}
                  class="btn"
                  type="button"
                  on:click={() => (workerTab = tab.id as typeof workerTab)}
                >
                  {tab.label}
                </button>
              {/each}
            </div>
          </div>

          {#if workerTab === "open"}
            <div class="grid-2">
              <label class="field">
                <span>Search taskId / requestor / status</span>
                <input class="input" bind:value={workerSearch} placeholder="1003, requestor, Open" />
              </label>
              <div style="display: flex; gap: 10px; align-items: end; flex-wrap: wrap;">
                <button class="btn secondary" type="button" disabled={Boolean(loading)} on:click={() => refreshTasks()}>
                  Refresh On-chain Tasks
                </button>
              </div>
            </div>
            {@render workerTaskCards(workerOpenTasks, "open")}
          {:else if workerTab === "active"}
            <div class="panel-soft" style="padding: 14px; display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
              <strong>{workerActiveTasks.length} active worker task(s)</strong>
              <button class="btn secondary" type="button" disabled={Boolean(loading)} on:click={() => refreshTasks()}>
                Refresh
              </button>
            </div>
            {@render workerTaskCards(workerActiveTasks, "active")}
          {:else if workerTab === "submit"}
            <div class="grid-2">
              <label class="field"><span>taskId</span><input class="input" bind:value={workerTaskId} /></label>
              <label class="field"><span>encryptedSubmissionUri</span><input class="input" bind:value={workerSubmissionUri} /></label>
              <label class="field"><span>worker token mint</span><input class="input" bind:value={workerSettlementMint} /></label>
              <label class="field"><span>workerTokenAccount for settlement</span><input class="input" bind:value={workerTokenAccount} /></label>
            </div>

            {#if selectedWorkerTask}
              <div class="panel-soft" style="padding: 14px; display: grid; gap: 6px;">
                <strong>Selected Task #{selectedWorkerTask.id} · {selectedWorkerTask.status}</strong>
                <span style="word-break: break-all;">worker: {selectedWorkerTask.worker ?? "none"}</span>
                <span>votes: {selectedWorkerTask.passVoteCount} pass / {selectedWorkerTask.failVoteCount} fail</span>
                <span style="word-break: break-all;">assigned judges: {selectedWorkerTask.assignedJudges.join(", ") || "none"}</span>
              </div>
            {/if}

            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
              <button class="btn" type="button" disabled={Boolean(loading) || !workerTaskId.trim()} on:click={handleWorkerStake}>
                Stake To Unlock
              </button>
              <button class="btn" type="button" disabled={Boolean(loading) || !workerTaskId.trim() || !workerSubmissionUri.trim()} on:click={handleWorkerSubmit}>
                Submit And Assign
              </button>
              <button class="btn secondary" type="button" on:click={deriveWorkerAta}>Find Worker ATA</button>
              <button class="btn secondary" type="button" on:click={() => createMyAtaForMint("worker")}>Create Worker ATA</button>
            </div>
          {:else}
            {#if proof}
              {@render proofPanel(proof)}
            {:else}
              <div class="panel-soft" style="padding: 14px; font-weight: 800;">No worker transaction proof yet.</div>
            {/if}
          {/if}
        </section>
      {:else if $walletStore.role === "judge"}
        <section class="panel" style="margin-top: 18px; padding: 20px;">
          <h2 style="margin-top: 0;">Phase 4 · Judge Vote / Claim</h2>
          <div class="grid-2">
            <label class="field"><span>register stake lamports</span><input class="input" bind:value={judgeStakeLamports} /></label>
            <label class="field"><span>taskId</span><input class="input" bind:value={judgeTaskId} /></label>
            <label class="field"><span>judgeTokenAccount for fee</span><input class="input" bind:value={judgeTokenAccount} /></label>
            <div style="display: flex; gap: 10px; align-items: end; flex-wrap: wrap;">
              <button class="btn secondary" type="button" on:click={() => createMyAtaForMint("judge")}>Create/Find My ATA</button>
              <button class="btn secondary" type="button" on:click={inspectJudgeState}>Inspect Assignment</button>
            </div>
          </div>
          <div style="margin-top: 16px; display: flex; gap: 10px; flex-wrap: wrap;">
            <button class="btn" type="button" disabled={Boolean(loading)} on:click={handleJudgeRegister}>Register Judge</button>
            <button class="btn" type="button" disabled={Boolean(loading)} on:click={() => handleJudgeVote(true)}>Vote Pass</button>
            <button class="btn danger" type="button" disabled={Boolean(loading)} on:click={() => handleJudgeVote(false)}>Vote Fail</button>
            <button class="btn secondary" type="button" disabled={Boolean(loading)} on:click={handleClaimJudgeFee}>Claim Judge Fee</button>
          </div>
        </section>
        {@render taskCards(roleTasks)}
      {:else}
        <section class="panel" style="margin-top: 18px; padding: 20px;">
          <h2 style="margin-top: 0;">Phase 5 · Payer / Relayer</h2>
          <div class="grid-2">
            <label class="field"><span>taskId</span><input class="input" bind:value={payerTaskId} /></label>
            <label class="field"><span>judge optional</span><input class="input" bind:value={payerJudge} placeholder="blank = all assigned judges" /></label>
            <label class="field"><span>workerTokenAccount</span><input class="input" bind:value={workerTokenAccount} /></label>
            <label class="field"><span>requestorTokenAccount</span><input class="input" bind:value={payerRequestorTokenAccount} /></label>
          </div>
          <div style="margin-top: 16px; display: flex; gap: 10px; flex-wrap: wrap;">
            <button class="btn" type="button" disabled={Boolean(loading)} on:click={handleInitAssignments}>Init Judge Assignment</button>
            <button class="btn" type="button" disabled={Boolean(loading)} on:click={handleSettle}>Settle Payment</button>
          </div>
        </section>
        {@render taskCards(roleTasks)}
      {/if}
    {/if}

    {#if loading}
      <section class="panel-soft" style="margin-top: 18px; padding: 14px; font-weight: 900;">{loading}...</section>
    {/if}

    {#if error}
      <section class="panel-soft" style="margin-top: 18px; padding: 14px; border-color: #be123c; font-weight: 800;">{error}</section>
    {/if}

    {#if proof && !($walletStore.role === "worker" && workerTab === "proof")}
      {@render proofPanel(proof)}
    {/if}
  </div>
</main>

{#snippet workerTaskCards(tasks: IndexedTask[], mode: "open" | "active")}
  <section style="display: grid; gap: 12px;">
    {#if tasks.length === 0}
      <div class="panel-soft" style="padding: 14px; font-weight: 800;">
        {mode === "open" ? "No open task matched the filter." : "No active worker task for this wallet."}
      </div>
    {:else}
      {#each tasks.slice(0, 12) as task}
        <article class="panel-soft" style="padding: 14px; display: grid; gap: 10px;">
          <div style="display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
            <div>
              <strong>Task #{task.id}</strong>
              <p style="margin: 4px 0 0;">{task.status}</p>
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              {#if task.status === "Open"}
                <button class="btn" type="button" disabled={Boolean(loading)} on:click={() => { selectWorkerTask(task, "submit"); handleWorkerStake(); }}>
                  Stake To Unlock
                </button>
              {/if}
              {#if task.worker === connectedPublicKey && task.status === "InProgress"}
                <button class="btn" type="button" disabled={Boolean(loading)} on:click={() => selectWorkerTask(task, "submit")}>
                  Submit
                </button>
              {/if}
              <button class="btn secondary" type="button" on:click={() => selectWorkerTask(task, mode === "open" ? "submit" : "active")}>
                Select
              </button>
            </div>
          </div>

          <div class="grid-2">
            <p style="margin: 0; word-break: break-all;"><strong>PDA:</strong> <a href={`https://explorer.solana.com/address/${task.taskPda}?cluster=devnet`} target="_blank" rel="noreferrer">{task.taskPda}</a></p>
            <p style="margin: 0; word-break: break-all;"><strong>Requestor:</strong> {task.requestor}</p>
            <p style="margin: 0; word-break: break-all;"><strong>Worker:</strong> {task.worker ?? "none"}</p>
            <p style="margin: 0; word-break: break-all;"><strong>Token mint:</strong> {task.tokenMint}</p>
            <p style="margin: 0;"><strong>Bounty:</strong> {task.bountyAmount}</p>
            <p style="margin: 0;"><strong>Stake:</strong> {task.workerStakeAmount}</p>
            <p style="margin: 0;"><strong>Judges:</strong> {task.requiredJudgesM} / threshold {task.approvalThresholdN}</p>
            <p style="margin: 0;"><strong>Submission deadline:</strong> {task.submissionDeadline.toLocaleString()}</p>
            <p style="margin: 0; word-break: break-all;"><strong>Metadata:</strong> {task.publicMetadataUri}</p>
            <p style="margin: 0;"><strong>Votes:</strong> {task.passVoteCount} pass / {task.failVoteCount} fail</p>
          </div>

          {#if task.status === "Resolving" || task.assignedJudges.length}
            <p style="margin: 0; word-break: break-all;"><strong>Assigned judges:</strong> {task.assignedJudges.join(", ") || "none"}</p>
          {/if}
        </article>
      {/each}
    {/if}
  </section>
{/snippet}

{#snippet taskCards(tasks: IndexedTask[])}
  <section style="margin-top: 18px; display: grid; gap: 12px;">
    {#if tasks.length === 0}
      <div class="panel-soft" style="padding: 14px; font-weight: 800;">No on-chain task loaded for this role yet.</div>
    {:else}
      {#each tasks.slice(0, 8) as task}
        <article class="panel-soft" style="padding: 14px; display: grid; gap: 8px;">
          <div style="display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
            <strong>Task #{task.id}</strong>
            <span>{task.status}</span>
          </div>
          <p style="margin: 0; word-break: break-all;"><strong>PDA:</strong> <a href={`https://explorer.solana.com/address/${task.taskPda}?cluster=devnet`} target="_blank" rel="noreferrer">{task.taskPda}</a></p>
          <p style="margin: 0; word-break: break-all;"><strong>Requestor:</strong> {task.requestor}</p>
          <p style="margin: 0; word-break: break-all;"><strong>Worker:</strong> {task.worker ?? "none"}</p>
          <p style="margin: 0;"><strong>Bounty:</strong> {task.bountyAmount} · <strong>Stake:</strong> {task.workerStakeAmount} · <strong>Votes:</strong> {task.passVoteCount} pass / {task.failVoteCount} fail</p>
          <p style="margin: 0; word-break: break-all;"><strong>Assigned judges:</strong> {task.assignedJudges.join(", ") || "none"}</p>
        </article>
      {/each}
    {/if}
  </section>
{/snippet}

{#snippet proofPanel(proof: ProofLog)}
  <section class="panel" style="margin-top: 18px; padding: 20px;">
    <h2 style="margin-top: 0;">Explorer Proof</h2>
    <p style="margin: 0 0 8px;"><strong>isSimulated:</strong> {String(proof.isSimulated)}</p>
    {#if proof.signature}
      <p style="margin: 0 0 8px; word-break: break-all;"><strong>signature:</strong> <a href={proof.explorerTxUrl} target="_blank" rel="noreferrer">{proof.signature}</a></p>
      <p style="margin: 0 0 8px;"><strong>slot:</strong> {proof.slot ?? "confirmed"}</p>
    {/if}
    {#if proof.taskPda}
      <p style="margin: 0 0 8px; word-break: break-all;"><strong>taskPda:</strong> {proof.taskPda}</p>
    {/if}
    {#if proof.accounts?.length}
      <div style="display: grid; gap: 6px;">
        {#each proof.accounts as account}
          <a href={account.url} target="_blank" rel="noreferrer" style="word-break: break-all;">
            {account.label}: {account.address}
          </a>
        {/each}
      </div>
    {/if}
    {#if proof.multi?.length}
      <div style="margin-top: 12px; display: grid; gap: 8px;">
        {#each proof.multi as item}
          <a class="panel-soft" style="padding: 10px; word-break: break-all;" href={item.explorerTxUrl} target="_blank" rel="noreferrer">
            {item.signature}
          </a>
        {/each}
      </div>
    {/if}
  </section>
{/snippet}
