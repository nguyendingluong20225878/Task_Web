import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <section
      className={cn("rounded-lg border-[3px] border-slate-950 bg-white shadow-[5px_5px_0_#111827]", className)}
      {...props}
    />
  );
}

export function SoftCard({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border-2 border-slate-950 bg-[#FFFDF3]", className)} {...props} />;
}
