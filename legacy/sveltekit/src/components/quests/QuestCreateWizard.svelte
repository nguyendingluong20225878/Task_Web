<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import GameButton from "../gamified/GameButton.svelte";
  import { mockUploadToStorage } from "$lib/api/storage";
  import { initializeTask } from "$lib/solana/transactions/initializeTask";
  import { txStore } from "$lib/stores/tx";
  import { walletStore } from "$lib/stores/wallet";
  import { questsStore } from "$lib/stores/quests";

  const dispatch = createEventDispatcher<{ launched: { taskPda: string } }>();

  let step = 1;
  let title = "";
  let summary = "";
  let bountyAmount = "100";
  let workerStakeAmount = "1";
  let submissionDeadline = "";
  let votingDeadline = "";
  let requiredJudgesM = 3;
  let approvalThresholdN = 2;
  let encryptedPayload = "{\n  \"goal\": \"\",\n  \"inputs\": []\n}";
  let error = "";
  let success = false;
  let launchedTaskPda = "";

  $: canLaunch =
    Boolean($walletStore.connected) &&
    title.trim().length > 2 &&
    summary.trim().length > 5 &&
    encryptedPayload.trim().length > 2 &&
    Boolean(submissionDeadline) &&
    Boolean(votingDeadline);

  function nextStep() {
    error = "";
    step = Math.min(step + 1, 3);
  }

  function previousStep() {
    error = "";
    step = Math.max(step - 1, 1);
  }

  async function launchQuest() {
    if (!$walletStore.connected || !$walletStore.publicKey) {
      error = "Connect your Treasure Wallet before launching a quest.";
      return;
    }

    if (!canLaunch) {
      error = "Finish every quest card before launch.";
      return;
    }

    try {
      error = "";
      txStore.setStatus("uploading", "Packing quest scrolls into storage...");

      const metadataObject = await mockUploadToStorage(
        { title, summary },
        "public-metadata"
      );
      const payloadObject = await mockUploadToStorage(
        { encryptedPayload },
        "encrypted-payload"
      );

      txStore.setStatus("awaiting_signature", "Awaiting wallet signature...");

      const result = await initializeTask($walletStore.publicKey, {
        title,
        summary,
        publicMetadataUri: metadataObject.uri,
        encryptedTaskDetailUri: payloadObject.uri,
        bountyAmount,
        workerStakeAmount,
        submissionDeadline: new Date(submissionDeadline),
        votingDeadline: new Date(votingDeadline),
        requiredJudgesM,
        approvalThresholdN,
      });

      questsStore.addQuest({
        taskPda: result.taskPda,
        id: result.id,
        requestor: $walletStore.publicKey,
        tokenMint: "MockUSDCMint111111111111111111111111111",
        escrowTokenVault: `MockVault${result.id}`,
        nftAsset: `MockAsset${result.id}`,
        bountyAmount,
        judgeFeeBps: 500,
        workerStakeAmount,
        requiredJudgesM,
        approvalThresholdN,
        passVoteCount: 0,
        failVoteCount: 0,
        assignedJudges: [],
        publicMetadataUri: metadataObject.uri,
        encryptedTaskDetailUri: payloadObject.uri,
        status: "Open",
        createdAt: new Date(),
        submissionDeadline: new Date(submissionDeadline),
        votingDeadline: new Date(votingDeadline),
        title,
        summary,
      });

      txStore.setSignature(result.signature, "Quest launched on-chain.");
      success = true;
      launchedTaskPda = result.taskPda;
      dispatch("launched", { taskPda: result.taskPda });
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Unable to launch quest.";
      error = message;
      txStore.setError(message);
    }
  }
</script>

<section class="mx-auto max-w-5xl px-4 py-8 text-[#0B0B0F]">
  {#if success}
    <div class="rounded-[2rem] border-[4px] border-black bg-[#79F2C0] p-8 text-center shadow-[8px_8px_0_#0B0B0F]">
      <div class="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full border-[3px] border-black bg-white text-4xl shadow-[4px_4px_0_#0B0B0F]">
        ★
      </div>
      <h1 class="text-3xl font-black">Quest Launched!</h1>
      <p class="mt-2 text-xl font-black text-[#8B5CF6]">+50 XP</p>
      <p class="mt-3 font-bold">
        Your quest is live on the Quest Board. Redirecting to the quest room...
      </p>
      <p class="mt-4 break-all rounded-2xl border-2 border-black bg-white px-4 py-3 text-xs font-bold">
        {launchedTaskPda}
      </p>
    </div>
  {:else}
    <div class="mb-6 flex flex-col justify-between gap-4 rounded-[2rem] border-[4px] border-black bg-[#FFF9EC] p-6 shadow-[8px_8px_0_#0B0B0F] md:flex-row md:items-center">
      <div>
        <p class="text-sm font-black uppercase text-[#8B5CF6]">Quest Master Mode</p>
        <h1 class="mt-1 text-4xl font-black">Launch Quest</h1>
      </div>
      <div class="rounded-2xl border-[3px] border-black bg-white px-4 py-3 font-black shadow-[4px_4px_0_#0B0B0F]">
        Step {step} / 3
      </div>
    </div>

    {#if !$walletStore.connected}
      <div class="mb-6 rounded-3xl border-[3px] border-black bg-[#FFD84D] p-4 font-black shadow-[5px_5px_0_#0B0B0F]">
        Connect your Treasure Wallet before launching a quest.
      </div>
    {/if}

    {#if error}
      <div class="mb-6 rounded-3xl border-[3px] border-black bg-[#FF5CA8] p-4 font-black text-white shadow-[5px_5px_0_#0B0B0F]">
        {error}
      </div>
    {/if}

    <form
      class="rounded-[2rem] border-[4px] border-black bg-white p-6 shadow-[8px_8px_0_#0B0B0F]"
      on:submit|preventDefault={launchQuest}
    >
      {#if step === 1}
        <div class="space-y-5">
          <h2 class="text-2xl font-black">Step 1: Quest Info</h2>
          <label class="block">
            <span class="text-sm font-black uppercase">Quest Title</span>
            <input
              bind:value={title}
              class="mt-2 w-full rounded-2xl border-[3px] border-black bg-[#FFF9EC] px-4 py-3 font-bold outline-none focus:bg-white"
              placeholder="Build an AI scouting agent"
            />
          </label>
          <label class="block">
            <span class="text-sm font-black uppercase">Quest Summary</span>
            <textarea
              bind:value={summary}
              rows="5"
              class="mt-2 w-full rounded-2xl border-[3px] border-black bg-[#FFF9EC] px-4 py-3 font-bold outline-none focus:bg-white"
              placeholder="Describe the public mission brief workers can read before unlocking."
            ></textarea>
          </label>
        </div>
      {:else if step === 2}
        <div class="space-y-5">
          <h2 class="text-2xl font-black">Step 2: Reward & Deadline</h2>
          <div class="grid gap-4 md:grid-cols-2">
            <label class="block">
              <span class="text-sm font-black uppercase">Reward / Loot</span>
              <input
                bind:value={bountyAmount}
                class="mt-2 w-full rounded-2xl border-[3px] border-black bg-[#FFF9EC] px-4 py-3 font-bold outline-none focus:bg-white"
              />
            </label>
            <label class="block">
              <span class="text-sm font-black uppercase">Worker Stake</span>
              <input
                bind:value={workerStakeAmount}
                class="mt-2 w-full rounded-2xl border-[3px] border-black bg-[#FFF9EC] px-4 py-3 font-bold outline-none focus:bg-white"
              />
            </label>
            <label class="block">
              <span class="text-sm font-black uppercase">Submission Deadline</span>
              <input
                bind:value={submissionDeadline}
                type="datetime-local"
                class="mt-2 w-full rounded-2xl border-[3px] border-black bg-[#FFF9EC] px-4 py-3 font-bold outline-none focus:bg-white"
              />
            </label>
            <label class="block">
              <span class="text-sm font-black uppercase">Voting Deadline</span>
              <input
                bind:value={votingDeadline}
                type="datetime-local"
                class="mt-2 w-full rounded-2xl border-[3px] border-black bg-[#FFF9EC] px-4 py-3 font-bold outline-none focus:bg-white"
              />
            </label>
          </div>
        </div>
      {:else}
        <div class="space-y-5">
          <h2 class="text-2xl font-black">Step 3: Judges & Secret Payload</h2>
          <div class="grid gap-4 md:grid-cols-2">
            <label class="block">
              <span class="text-sm font-black uppercase">Required Judges</span>
              <input
                bind:value={requiredJudgesM}
                type="number"
                min="1"
                max="5"
                class="mt-2 w-full rounded-2xl border-[3px] border-black bg-[#FFF9EC] px-4 py-3 font-bold outline-none focus:bg-white"
              />
            </label>
            <label class="block">
              <span class="text-sm font-black uppercase">Approval Threshold</span>
              <input
                bind:value={approvalThresholdN}
                type="number"
                min="1"
                max={requiredJudgesM}
                class="mt-2 w-full rounded-2xl border-[3px] border-black bg-[#FFF9EC] px-4 py-3 font-bold outline-none focus:bg-white"
              />
            </label>
          </div>
          <label class="block">
            <span class="text-sm font-black uppercase">Secret Payload</span>
            <textarea
              bind:value={encryptedPayload}
              rows="8"
              class="mt-2 w-full rounded-2xl border-[3px] border-black bg-[#0B0B0F] px-4 py-3 font-mono text-sm font-bold text-[#79F2C0] outline-none"
            ></textarea>
          </label>
        </div>
      {/if}

      <div class="mt-8 flex flex-col justify-between gap-3 sm:flex-row">
        <GameButton
          type="button"
          variant="secondary"
          disabled={step === 1}
          on:click={previousStep}
        >
          Back
        </GameButton>

        {#if step < 3}
          <GameButton type="button" on:click={nextStep}>Next Step</GameButton>
        {:else}
          <GameButton type="submit" disabled={!canLaunch || $txStore.status === "awaiting_signature"}>
            Launch Quest
          </GameButton>
        {/if}
      </div>
    </form>
  {/if}
</section>
