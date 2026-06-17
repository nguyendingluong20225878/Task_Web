<script lang="ts">
  import GameButton from "../gamified/GameButton.svelte";
  import ProgressQuestLine from "../gamified/ProgressQuestLine.svelte";
  import QuestStatusBadge from "../gamified/QuestStatusBadge.svelte";
  import { cancelOpenTask } from "$lib/solana/transactions/cancelOpenTask";
  import { questsStore } from "$lib/stores/quests";
  import { txStore } from "$lib/stores/tx";
  import { walletStore } from "$lib/stores/wallet";
  import type { IndexedTask } from "$lib/types/quests";

  export let quest: IndexedTask;

  let error = "";

  $: isCreator =
    Boolean($walletStore.publicKey) && $walletStore.publicKey === quest.requestor;
  $: canCancel = isCreator && quest.status === "Open";

  async function handleCancelQuest() {
    if (!$walletStore.publicKey || !canCancel) return;

    try {
      error = "";
      txStore.setStatus("awaiting_signature", "Cancelling open quest...");
      const result = await cancelOpenTask($walletStore.publicKey, quest.taskPda);
      questsStore.updateQuest(quest.taskPda, { status: "Cancelled" });
      txStore.setSignature(result.signature, "Quest cancelled.");
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Unable to cancel quest.";
      error = message;
      txStore.setError(message);
    }
  }
</script>

<section class="mx-auto max-w-6xl px-4 py-8 text-[#0B0B0F]">
  <div class="mb-6 rounded-[2rem] border-[4px] border-black bg-[#FFF9EC] p-6 shadow-[8px_8px_0_#0B0B0F]">
    <div class="flex flex-col justify-between gap-4 md:flex-row md:items-start">
      <div>
        <QuestStatusBadge status={quest.status} />
        <h1 class="mt-4 text-4xl font-black">{quest.title ?? `Quest #${quest.id}`}</h1>
        <p class="mt-3 max-w-3xl text-base font-bold text-[#383838]">
          {quest.summary ?? "No public quest summary was indexed yet."}
        </p>
      </div>
      <div class="rounded-2xl border-[3px] border-black bg-[#FFD84D] px-5 py-4 text-right shadow-[4px_4px_0_#0B0B0F]">
        <p class="text-xs font-black uppercase">Prize Pool</p>
        <p class="text-2xl font-black">{quest.bountyAmount}</p>
      </div>
    </div>
  </div>

  <div class="grid gap-6 lg:grid-cols-[1fr_360px]">
    <div class="space-y-6">
      <ProgressQuestLine status={quest.status} />

      <div class="rounded-[2rem] border-[4px] border-black bg-white p-6 shadow-[8px_8px_0_#0B0B0F]">
        <h2 class="text-2xl font-black">Quest Info</h2>
        <div class="mt-5 grid gap-4 md:grid-cols-2">
          <InfoTile label="Quest PDA" value={quest.taskPda} />
          <InfoTile label="Quest ID" value={quest.id} />
          <InfoTile label="Requestor" value={quest.requestor} />
          <InfoTile label="Worker" value={quest.worker ?? "No runner yet"} />
          <InfoTile label="Worker Stake" value={quest.workerStakeAmount} />
          <InfoTile label="Judges Needed" value={`${quest.requiredJudgesM}`} />
          <InfoTile label="Approval Threshold" value={`${quest.approvalThresholdN}`} />
          <InfoTile label="Votes" value={`${quest.passVoteCount} pass / ${quest.failVoteCount} fail`} />
        </div>
      </div>
    </div>

    <aside class="h-fit rounded-[2rem] border-[4px] border-black bg-[#F1F1F1] p-6 shadow-[8px_8px_0_#0B0B0F]">
      <div class="mb-5 flex items-center gap-3">
        <div class="flex h-12 w-12 items-center justify-center rounded-2xl border-[3px] border-black bg-white text-2xl shadow-[3px_3px_0_#0B0B0F]">
          ⚑
        </div>
        <div>
          <p class="text-xs font-black uppercase text-[#8B5CF6]">Action Panel</p>
          <h2 class="text-xl font-black">Quest Master</h2>
        </div>
      </div>

      {#if !$walletStore.connected}
        <p class="rounded-2xl border-[3px] border-black bg-[#FFD84D] p-4 font-black">
          Connect wallet to manage this quest.
        </p>
      {:else if isCreator}
        <div class="space-y-4">
          <p class="rounded-2xl border-[3px] border-black bg-white p-4 text-sm font-bold">
            You are the Quest Master. Track unlocks, submissions, votes and settlement from here.
          </p>

          {#if canCancel}
            <GameButton variant="danger" on:click={handleCancelQuest}>
              Cancel Quest
            </GameButton>
          {:else}
            <p class="rounded-2xl border-[3px] border-black bg-white p-4 text-sm font-bold">
              Creator actions are locked for status: {quest.status}.
            </p>
          {/if}

          {#if $txStore.message}
            <p class="rounded-2xl border-2 border-black bg-[#79F2C0] p-3 text-sm font-black">
              {$txStore.message}
            </p>
          {/if}

          {#if error}
            <p class="rounded-2xl border-2 border-black bg-[#FF5CA8] p-3 text-sm font-black text-white">
              {error}
            </p>
          {/if}
        </div>
      {:else}
        <p class="rounded-2xl border-[3px] border-black bg-white p-4 text-sm font-bold">
          This wallet is not the Quest Master for this quest.
        </p>
      {/if}
    </aside>
  </div>
</section>

{#snippet InfoTile(label: string, value: string)}
  <div class="min-w-0 rounded-2xl border-[3px] border-black bg-[#FFF9EC] p-4">
    <p class="text-xs font-black uppercase text-[#8B5CF6]">{label}</p>
    <p class="mt-1 break-all text-sm font-black">{value}</p>
  </div>
{/snippet}
