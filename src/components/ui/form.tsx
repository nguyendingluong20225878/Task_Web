import * as React from "react";
import { cn } from "@/lib/utils";

export function Field({
  className,
  ...props
}: React.HTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("grid gap-2", className)} {...props} />;
}

export function FieldLabel({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn("text-sm font-black uppercase tracking-wide", className)}
      {...props}
    />
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "min-h-12 w-full rounded-lg border-2 border-slate-950 bg-[#FFFDF3] px-3.5 py-2.5 outline-none focus:bg-white",
        "focus-visible:ring-4 focus-visible:ring-[#FFD84D] focus-visible:ring-offset-2",
        props.className
      )}
    />
  );
}
