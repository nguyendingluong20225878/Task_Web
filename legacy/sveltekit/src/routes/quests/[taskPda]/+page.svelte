<script lang="ts">
  import { page } from "$app/stores";
  import QuestDetailPanel from "../../../components/quests/QuestDetailPanel.svelte";
  import { questsStore } from "$lib/stores/quests";
  import type { IndexedTask } from "$lib/types/quests";

  $: taskPda = $page.params.taskPda;
  $: quest = $questsStore.find((item: IndexedTask) => item.taskPda === taskPda);
</script>

{#if quest}
  <QuestDetailPanel {quest} />
{:else}
  <section class="mx-auto max-w-3xl px-4 py-12 text-[#0B0B0F]">
    <div class="rounded-[2rem] border-[4px] border-black bg-[#FFF9EC] p-8 text-center shadow-[8px_8px_0_#0B0B0F]">
      <h1 class="text-3xl font-black">Quest Not Indexed Yet</h1>
      <p class="mt-3 font-bold">
        The chain may be ahead of the Quest Board cache. Try again after the indexer catches up.
      </p>
    </div>
  </section>
{/if}
