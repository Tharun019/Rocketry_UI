import { useEffect, useRef, useState } from "react";
import { ChevronRight, ShieldAlert } from "lucide-react";
import { Button, StatusPill, type Tone } from "./ui";

export type CmdStage = "IDLE" | "SENT" | "ACK" | "NAK" | "PASS" | "FAIL" | "UNSENT";

export type CommandSender = (cmd: string, onStage: (stage: CmdStage) => void) => void;

export type CommandSpec = {
  name: string;
  danger?: boolean;
  confirm?: boolean;
  note?: string;
};

const STAGE: Record<Exclude<CmdStage, "IDLE">, { label: string; tone: Tone }> = {
  SENT: { label: "Sent", tone: "warn" },
  ACK: { label: "ACK", tone: "ok" },
  NAK: { label: "NAK", tone: "danger" },
  PASS: { label: "Pass", tone: "ok" },
  FAIL: { label: "Fail", tone: "danger" },
  UNSENT: { label: "No uplink", tone: "neutral" },
};

export function CommandButton({
  label,
  onClick,
  variant = "default",
  stage = "IDLE",
  note,
}: {
  label: string;
  accent?: string;
  onClick?: () => void;
  variant?: "default" | "danger";
  stage?: CmdStage;
  note?: string;
}) {
  const danger = variant === "danger";
  return (
    <button
      type="button"
      onClick={onClick}
      title={note}
      className={[
        "group w-full rounded-md border px-3 py-2 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
        danger
          ? "border-destructive/40 bg-destructive/5 hover:bg-destructive/10"
          : "border-border bg-well hover:bg-hover hover:border-border-strong",
      ].join(" ")}
    >
      <div className="flex items-center gap-2 min-h-6">
        {danger ? <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-destructive" /> : null}
        <span
          className={[
            "font-mono text-[11.5px] font-medium truncate flex-1",
            danger ? "text-destructive" : "text-foreground",
          ].join(" ")}
        >
          {label}
        </span>
        {stage !== "IDLE" ? (
          <StatusPill tone={STAGE[stage].tone} className="h-5 px-1.5 text-[10px]">
            {STAGE[stage].label}
          </StatusPill>
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-subtle opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </div>
      {note ? <div className="mt-0.5 text-[11px] text-subtle truncate">{note}</div> : null}
    </button>
  );
}

export function CommandGrid({
  commands,
  accent,
  onSend,
  columns = "grid-cols-2",
}: {
  commands: (string | CommandSpec)[];
  accent: string;
  onSend: CommandSender;
  columns?: string;
}) {
  const specs: CommandSpec[] = commands.map((c) => (typeof c === "string" ? { name: c } : c));
  const [stages, setStages] = useState<Record<string, CmdStage>>({});
  const [confirming, setConfirming] = useState<CommandSpec | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (!confirming) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setConfirming(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirming]);

  const fire = (spec: CommandSpec) => {
    onSend(spec.name, (stage) => {
      setStages((s) => ({ ...s, [spec.name]: stage }));
      if (stage === "PASS" || stage === "FAIL" || stage === "NAK" || stage === "UNSENT") {
        clearTimeout(timers.current[spec.name]);
        timers.current[spec.name] = setTimeout(
          () => setStages((s) => ({ ...s, [spec.name]: "IDLE" })),
          2500,
        );
      }
    });
  };

  return (
    <>
      <div className={`grid ${columns} gap-1.5`}>
        {specs.map((spec) => (
          <CommandButton
            key={spec.name}
            label={spec.name}
            accent={accent}
            note={spec.note}
            stage={stages[spec.name] ?? "IDLE"}
            onClick={() => (spec.confirm ? setConfirming(spec) : fire(spec))}
            variant={spec.danger ? "danger" : "default"}
          />
        ))}
      </div>

      {confirming ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setConfirming(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="panel w-full max-w-md bg-popover"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 px-5 pt-5">
              <div className="h-8 w-8 rounded-full bg-destructive/12 flex items-center justify-center">
                <ShieldAlert className="h-4 w-4 text-destructive" />
              </div>
              <h3 className="text-[15px] font-semibold">Confirm command</h3>
            </div>
            <div className="px-5 py-4 flex flex-col gap-3">
              <div className="well px-3 py-2.5">
                <div className="font-mono text-[13px]">{confirming.name}</div>
                {confirming.note ? (
                  <div className="mt-0.5 text-xs text-subtle">{confirming.note}</div>
                ) : null}
              </div>
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                This command actuates flight hardware and cannot be undone. Make sure the vehicle is
                within the valid window before sending.
              </p>
            </div>
            <div className="flex justify-end gap-2 px-5 pb-5">
              <Button size="md" autoFocus onClick={() => setConfirming(null)}>
                Cancel
              </Button>
              <Button
                size="md"
                variant="danger-solid"
                onClick={() => {
                  fire(confirming);
                  setConfirming(null);
                }}
              >
                Send command
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
