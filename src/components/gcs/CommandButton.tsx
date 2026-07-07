type CommandButtonProps = {
  label: string;
  accent: string;
  onClick?: () => void;
  variant?: "default" | "danger" | "solid";
};

export function CommandButton({ label, accent, onClick, variant = "default" }: CommandButtonProps) {
  const isDanger = variant === "danger";
  const isSolid = variant === "solid";
  return (
    <button
      onClick={onClick}
      className="group panel px-2.5 py-2 text-left transition-colors hover:bg-[oklch(0.21_0_0)] active:scale-[0.99]"
      style={{
        borderColor: isDanger ? "oklch(0.55 0.2 25)" : undefined,
        background: isSolid ? accent : undefined,
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="h-1.5 w-1.5 rounded-full shrink-0"
          style={{
            background: isDanger ? "oklch(0.68 0.22 25)" : isSolid ? "oklch(0.145 0 0)" : accent,
          }}
        />
        <span
          className="label-mono text-[10px] truncate"
          style={{ color: isSolid ? "oklch(0.145 0 0)" : undefined }}
        >
          {label}
        </span>
      </div>
    </button>
  );
}

export function CommandGrid({
  commands,
  accent,
  onSend,
}: {
  commands: string[];
  accent: string;
  onSend: (cmd: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {commands.map((c) => (
        <CommandButton
          key={c}
          label={c}
          accent={accent}
          onClick={() => onSend(c)}
          variant={c.startsWith("DISABLE") || c === "STOP_MOTORS" ? "danger" : "default"}
        />
      ))}
    </div>
  );
}
