import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[14px] text-[14px] font-medium transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-40 active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:size-[16px] [&_svg]:shrink-0 cursor-pointer border",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-fg border-primary font-semibold shadow-glow hover:brightness-110",
        secondary:
          "bg-secondary text-secondary-fg border-primary/20 hover:bg-secondary/80",
        outline:
          "bg-transparent text-fg border-border hover:bg-muted/80 hover:border-border/80",
        danger:
          "bg-danger text-danger-fg border-danger/80 shadow-glow-rose hover:brightness-110",
        ghost:
          "bg-transparent text-primary border-transparent hover:bg-secondary/70",
      },
      size: {
        default: "min-h-[48px] px-[16px]",
        compact: "min-h-[38px] rounded-[11px] px-[12px] text-[12px]",
        icon: "size-9 rounded-[11px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };