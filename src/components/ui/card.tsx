import * as React from "react";
import { cn } from "@/lib/utils";

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  tone?: "default" | "requestor" | "worker";
};

export function Card({ className, tone = "default", ...props }: CardProps) {
  return (
    <section
      className={cn(
        "rounded-lg border-[3px] border-slate-950 bg-white shadow-[5px_5px_0_#111827]",
        tone === "requestor" &&
          "border-[var(--role-requestor-strong)] shadow-[5px_5px_0_var(--role-requestor-shadow)]",
        tone === "worker" && "shadow-[5px_5px_0_var(--role-worker)]",
        className
      )}
      {...props}
    />
  );
}

export function SoftCard({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg border-2 border-slate-950 bg-[#FFFDF3]",
        className
      )}
      {...props}
    />
  );
}
