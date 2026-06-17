<script lang="ts">
  import QuestStatusBadge from "../gamified/QuestStatusBadge.svelte";
  import { questsStore } from "$lib/stores/quests";
  import { walletStore } from "$lib/stores/wallet";

  $: createdQuests = $questsStore.filter(
    (quest) => $walletStore.publicKey && quest.requestor === $walletStore.publicKey
  );
</script>

<section class="rounded-[2rem] border-[4px] border-black bg-white p-5 shadow-[8px_8px_0_#0B0B0F]">
  <div class="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
    <div>
      <p class="text-sm font-black uppercase text-[#8B5CF6]">Quest Master Ledger</p>
      <h2 class="text-2xl font-black text-[#0B0B0F]">Created Quests</h2>
    </div>
    <div class="w-fit rounded-2xl border-[3px] border-black bg-[#FFD84D] px-4 py-2 text-sm font-black shadow-[3px_3px_0_#0B0B0F]">
      {createdQuests.length} launched
    </div>
  </div>

  {#if !$walletStore.connected}
    <div class="rounded-3xl border-[3px] border-black bg-[#FFF9EC] p-6 text-center font-black">
      Connect your Treasure Wallet to see your launched quests.
    </div>
  {:else if createdQuests.length === 0}
    <div class="rounded-3xl border-[3px] border-black bg-[#FFF9EC] p-6 text-center">
      <div class="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-black bg-[#79F2C0] text-3xl shadow-[3px_3px_0_#0B0B0F]">
        ★
      </div>
      <p class="font-black">No quests launched yet.</p>
      <p class="mt-1 text-sm font-bold text-[#383838]">
        Your Quest Master table will light up after your first launch.
      </p>
    </div>
  {:else}
    <div class="hidden overflow-hidden rounded-3xl border-[3px] border-black md:block">
      <table class="w-full border-collapse text-left">
        <thead class="bg-[#0B0B0F] text-white">
          <tr>
            <th class="px-4 py-3 text-xs font-black uppercase">Quest</th>
            <th class="px-4 py-3 text-xs font-black uppercase">Status</th>
            <th class="px-4 py-3 text-xs font-black uppercase">Reward</th>
            <th class="px-4 py-3 text-xs font-black uppercase">Judges</th>
            <th class="px-4 py-3 text-xs font-black uppercase">Deadline</th>
          </tr>
        </thead>
        <tbody>
          {#each createdQuests as quest}
            <tr class="border-t-[3px] border-black bg-[#FFF9EC]">
              <td class="px-4 py-4">
                <a
                  href={`/quests/${quest.taskPda}`}
                  class="font-black text-[#0B0B0F] underline decoration-[#2F80ED] decoration-4 underline-offset-4"
                >
                  {quest.title ?? `Quest #${quest.id}`}
                </a>
                <p class="mt-1 max-w-md truncate text-xs font-bold text-[#383838]">
                  {quest.summary}
                </p>
              </td>
              <td class="px-4 py-4"><QuestStatusBadge status={quest.status} /></td>
              <td class="px-4 py-4 font-black">{quest.bountyAmount}</td>
              <td class="px-4 py-4 font-black">
                {quest.passVoteCount}/{quest.requiredJudgesM}
              </td>
              <td class="px-4 py-4 text-sm font-bold">
                {quest.submissionDeadline.toLocaleDateString()}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <div class="grid gap-4 md:hidden">
      {#each createdQuests as quest}
        <a
          href={`/quests/${quest.taskPda}`}
          class="rounded-3xl border-[3px] border-black bg-[#FFF9EC] p-4 shadow-[5px_5px_0_#0B0B0F]"
        >
          <div class="mb-3 flex items-start justify-between gap-3">
            <h3 class="font-black text-[#0B0B0F]">{quest.title ?? `Quest #${quest.id}`}</h3>
            <QuestStatusBadge status={quest.status} />
          </div>
          <p class="text-sm font-bold text-[#383838]">{quest.summary}</p>
          <div class="mt-4 flex justify-between gap-3 text-sm font-black">
            <span>{quest.bountyAmount} reward</span>
            <span>{quest.requiredJudgesM} judges</span>
          </div>
        </a>
      {/each}
    </div>
  {/if}
</section>
