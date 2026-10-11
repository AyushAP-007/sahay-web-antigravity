import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[15px] text-[15px] font-semibold transition-[opacity,transform,background-color,border-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:size-[17px] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-fg shadow-[0_0_0_1px_var(--color-primary)] hover:opacity-90",
        secondary:
          "bg-secondary text-secondary-fg shadow-[0_0_0_1px_var(--color-secondary)] hover:opacity-90",
        outline:
          "bg-transparent text-fg shadow-[0_0_0_1px_var(--color-border)] hover:bg-muted",
        danger:
          "bg-danger text-danger-fg shadow-[0_0_0_1px_var(--color-danger)] hover:opacity-90",
        ghost: "bg-transparent text-primary hover:bg-secondary",
      },
      size: {
        default: "min-h-[52px] px-[18px]",
        compact: "min-h-[42px] rounded-[13px] px-[13px] text-[13px]",
        icon: "size-10 rounded-[13px]",
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
