import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Shared building blocks so every panel, pill and button looks the same. */

export type Tone = "ok" | "warn" | "danger" | "neutral" | "accent";

export const TONE_COLOR: Record<Tone, string> = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  danger: "var(--destructive)",
  neutral: "var(--muted-foreground)",
  accent: "var(--rocket)",
};

export function Panel({
  title,
  meta,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("panel flex flex-col min-w-0", className)}>
      {title || meta || actions ? (
        <header className="flex items-center justify-between gap-3 px-4 min-h-11 py-2 border-b border-border shrink-0">
          <div className="flex items-baseline gap-2.5 min-w-0">
            {title ? (
              <h2 className="text-[13px] font-semibold tracking-tight text-foreground truncate">
                {title}
              </h2>
            ) : null}
            {meta ? <span className="text-xs text-subtle truncate">{meta}</span> : null}
          </div>
          {actions ? <div className="flex items-center gap-1.5 shrink-0">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cn("p-4 flex-1 min-h-0", bodyClassName)}>{children}</div>
    </section>
  );
}

export function StatusPill({
  tone,
  children,
  dot = true,
  className,
}: {
  tone: Tone;
  children: ReactNode;
  dot?: boolean;
  className?: string;
}) {
  const c = TONE_COLOR[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 h-6 px-2 rounded-full border text-[11px] font-semibold tracking-wide whitespace-nowrap",
        className,
      )}
      style={{
        color: c,
        background: `color-mix(in oklch, ${c} 12%, transparent)`,
        borderColor: `color-mix(in oklch, ${c} 35%, transparent)`,
      }}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} /> : null}
      {children}
    </span>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "ghost" | "danger" | "danger-solid" | "primary";
  size?: "sm" | "md";
  active?: boolean;
};

export function Button({
  variant = "default",
  size = "sm",
  active,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md border font-medium whitespace-nowrap transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
        "disabled:opacity-40 disabled:pointer-events-none",
        size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-3.5 text-[13px]",
        variant === "default" &&
          "border-border bg-panel-2 text-foreground hover:bg-hover hover:border-border-strong",
        variant === "ghost" &&
          "border-transparent text-muted-foreground hover:text-foreground hover:bg-hover",
        variant === "primary" && "border-foreground bg-foreground text-background hover:opacity-90",
        variant === "danger" &&
          "border-destructive/45 text-destructive bg-destructive/5 hover:bg-destructive/12",
        variant === "danger-solid" &&
          "border-destructive bg-destructive text-destructive-foreground hover:opacity-90",
        active && "border-border-strong bg-hover text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div
      className={cn("inline-flex rounded-md border border-border bg-well p-0.5", className)}
      role="radiogroup"
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "h-6 px-2.5 rounded-[5px] text-xs font-medium transition-colors",
            value === o.id
              ? "bg-hover text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Label-over-value statistic used inside panels. */
export function Stat({
  label,
  value,
  unit,
  color,
  size = "md",
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  color?: string;
  size?: "md" | "lg";
}) {
  return (
    <div className="well px-3 py-2.5 min-w-0">
      <div className="eyebrow truncate">{label}</div>
      <div
        className={cn("readout mt-1 truncate", size === "lg" ? "text-xl" : "text-sm")}
        style={{ color }}
      >
        {value}
        {unit ? <span className="ml-1 text-[11px] text-subtle font-sans">{unit}</span> : null}
      </div>
    </div>
  );
}
