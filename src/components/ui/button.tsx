import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-10 items-center justify-center rounded-lg border-2 border-slate-950 px-3.5 text-sm font-extrabold text-slate-950 shadow-[3px_3px_0_#111827] transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FFD84D] focus-visible:ring-offset-2 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none",
  {
    variants: {
      variant: {
        default: "bg-[#FFD84D]",
        secondary: "bg-white",
        danger: "bg-[#FF6B8A]",
      },
      size: {
        default: "h-10",
        sm: "h-9 px-3 text-xs",
      },
    },
    defaultVariants: {
      variant: "default",
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
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
