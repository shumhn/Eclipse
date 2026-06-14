import * as React from "react";

// Utility to merge classNames
function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(' ');
}

const buttonVariants = {
  variant: {
    default: "bg-dark text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] border-2 border-dark hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0",
    wallet: "bg-dark text-white border-2 border-dark rounded-3xl shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0",
    hero: "bg-[#4ADE80] text-dark border-2 border-dark rounded-3xl shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] text-lg font-bold hover:-translate-y-1 hover:shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] active:translate-y-0",
    heroSecondary: "bg-white text-dark border-2 border-dark rounded-3xl shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] text-lg font-bold hover:-translate-y-1 hover:shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] active:translate-y-0",
  },
  size: {
    default: "h-10 px-4 py-2",
    sm: "h-9 rounded-xl px-3",
    lg: "h-12 px-6",
    xl: "h-14 px-8 text-base",
    icon: "h-10 w-10",
  },
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof buttonVariants.variant;
  size?: keyof typeof buttonVariants.size;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    const variantClass = buttonVariants.variant[variant];
    const sizeClass = buttonVariants.size[size];
    
    return (
      <button
        className={cn(
          "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
          variantClass,
          sizeClass,
          className
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button };
