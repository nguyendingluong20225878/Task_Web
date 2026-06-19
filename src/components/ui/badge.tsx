import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn("inline-flex w-fit rounded-full border-2 border-slate-950 bg-white px-3 py-1.5 text-xs font-black", className)}
      {...props}
    />
  );
}
