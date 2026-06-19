import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-12 items-center justify-center rounded-lg border-2 border-slate-950 px-4 text-sm font-extrabold text-slate-950 shadow-[3px_3px_0_#111827] transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FFD84D] focus-visible:ring-offset-2 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none",
  {
    variants: {
      variant: {
        default: "bg-[#FFD84D]",
        secondary: "bg-white",
        danger: "bg-[#FF6B8A]",
      },
      tone: {
        default: "",
        requestor:
          "border-[var(--role-requestor-strong)] bg-[var(--role-requestor)] shadow-[3px_3px_0_var(--role-requestor-shadow)] focus-visible:ring-[var(--role-requestor)]",
        worker: "shadow-[3px_3px_0_var(--role-worker)]",
      },
      size: {
        default: "h-12",
        sm: "h-11 px-3 text-xs",
      },
    },
    defaultVariants: {
      variant: "default",
      tone: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, tone, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, tone, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
