<script lang="ts">
  import type { TaskStatus } from "$lib/types/quests";

  export let status: TaskStatus;

  const steps = [
    { key: "Open", label: "Open" },
    { key: "InProgress", label: "In Progress" },
    { key: "Resolving", label: "Resolving" },
    { key: "Completed", label: "Completed" },
  ] as const;

  const currentIndex =
    status === "Failed" || status === "Cancelled" || status === "Inconclusive"
      ? steps.length - 1
      : steps.findIndex((step) => step.key === status);
</script>

<div class="rounded-3xl border-[3px] border-black bg-white p-4 shadow-[5px_5px_0_#0B0B0F]">
  <div class="grid gap-3 sm:grid-cols-4">
    {#each steps as step, index}
      <div
        class={`rounded-2xl border-2 border-black p-3 text-center ${
          index <= currentIndex ? "bg-[#79F2C0]" : "bg-[#F1F1F1]"
        }`}
      >
        <div class="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full border-2 border-black bg-white text-sm font-black">
          {index + 1}
        </div>
        <p class="text-xs font-black uppercase text-[#0B0B0F]">{step.label}</p>
      </div>
    {/each}
  </div>
</div>
