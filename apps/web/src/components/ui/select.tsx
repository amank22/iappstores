import * as React from "react";
import { cn } from "@/lib/utils";

const chevronIcon =
  "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23a1a1aa' stroke-width='2'%3e%3cpath stroke-linecap='round' stroke-linejoin='round' d='m6 9 6 6 6-6'/%3e%3c/svg%3e\")";

export function Select({ className, style, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "flex h-11 w-full appearance-none rounded-md border border-input bg-background py-2 pl-3 pr-12 text-sm ring-offset-background",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      style={{
        backgroundImage: chevronIcon,
        backgroundPosition: "right 1rem center",
        backgroundRepeat: "no-repeat",
        backgroundSize: "1rem",
        ...style
      }}
      {...props}
    />
  );
}
