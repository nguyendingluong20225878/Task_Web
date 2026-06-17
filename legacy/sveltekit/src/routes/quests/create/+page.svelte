<script lang="ts">
  import { goto } from "$app/navigation";
  import QuestCreateWizard from "../../../components/quests/QuestCreateWizard.svelte";

  function handleLaunched(event: CustomEvent<{ taskPda: string }>) {
    setTimeout(() => {
      goto(`/quests/${event.detail.taskPda}`);
    }, 1400);
  }
</script>

<QuestCreateWizard on:launched={handleLaunched} />
