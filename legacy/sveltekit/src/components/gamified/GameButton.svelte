<script lang="ts">
  export let type: "button" | "submit" = "button";
  export let disabled = false;
  export let variant: "primary" | "danger" | "secondary" = "primary";
</script>

<button
  {type}
  {disabled}
  class={`inline-flex items-center justify-center rounded-2xl border-[3px] border-black px-5 py-3 text-sm font-black uppercase tracking-normal text-black shadow-[5px_5px_0_#0B0B0F] transition hover:-translate-y-0.5 hover:shadow-[7px_7px_0_#0B0B0F] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-[3px_3px_0_#0B0B0F] ${
    variant === "primary"
      ? "bg-[#FFD84D]"
      : variant === "danger"
        ? "bg-[#FF5CA8]"
        : "bg-white"
  }`}
>
  <slot />
</button>
