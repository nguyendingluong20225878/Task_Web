import * as React from "react";
import { cn } from "@/lib/utils";

export function Field({
  className,
  ...props
}: React.HTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("grid gap-1.5", className)} {...props} />;
}

export function FieldLabel({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn("text-xs font-black uppercase", className)}
      {...props}
    />
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "min-h-10 w-full rounded-lg border-2 border-slate-950 bg-[#FFFDF3] px-3 py-2 outline-none focus:bg-white",
        "focus-visible:ring-4 focus-visible:ring-[#FFD84D] focus-visible:ring-offset-2",
        props.className
      )}
    />
  );
}
