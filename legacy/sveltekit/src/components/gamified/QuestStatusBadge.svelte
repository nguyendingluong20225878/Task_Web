<script lang="ts">
  import type { TaskStatus } from "$lib/types/quests";

  export let status: TaskStatus;

  const statusLabel: Record<TaskStatus, string> = {
    Open: "New",
    InProgress: "In Progress",
    Resolving: "Resolving",
    Completed: "Completed",
    Failed: "Failed",
    Cancelled: "Cancelled",
    Inconclusive: "Inconclusive",
  };

  const statusClass: Record<TaskStatus, string> = {
    Open: "bg-[#2F80ED] text-white",
    InProgress: "bg-[#FFD84D] text-black",
    Resolving: "bg-[#8B5CF6] text-white",
    Completed: "bg-[#46D16D] text-black",
    Failed: "bg-[#FF4D4D] text-white",
    Cancelled: "bg-[#F1F1F1] text-black",
    Inconclusive: "bg-[#79F2C0] text-black",
  };
</script>

<span
  class={`inline-flex w-fit items-center rounded-full border-2 border-black px-3 py-1 text-xs font-black uppercase tracking-normal shadow-[2px_2px_0_#0B0B0F] ${statusClass[status]}`}
>
  {statusLabel[status]}
</span>
