import { useRef, useState } from "react";

export type CmdStage = "IDLE" | "SENT" | "ACK" | "NAK" | "PASS" | "FAIL";

export type CommandSender = (cmd: string, onStage: (stage: CmdStage) => void) => void;

export type CommandSpec = {
  name: string;
  danger?: boolean;
  confirm?: boolean;
  note?: string;
};

const STAGE_LABEL: Record<CmdStage, string> = {
  IDLE: "",
  SENT: "COMMAND SENT",
  ACK: "ACK",
  NAK: "NAK",
  PASS: "EXEC PASS",
  FAIL: "EXEC FAIL",
};

function stageColor(stage: CmdStage) {
  if (stage === "SENT") return "var(--warn)";
  if (stage === "ACK" || stage === "PASS") return "var(--ok)";
  if (stage === "NAK" || stage === "FAIL") return "var(--destructive)";
  return undefined;
}

export function CommandButton({
  label,
  accent,
  onClick,
  variant = "default",
  stage = "IDLE",
  note,
}: {
  label: string;
  accent: string;
  onClick?: () => void;
  variant?: "default" | "danger" | "solid";
  stage?: CmdStage;
  note?: string;
}) {
  const isDanger = variant === "danger";
  const isSolid = variant === "solid";
  const sc = stageColor(stage);
  return (
    <button
      onClick={onClick}
      title={note}
      className="group panel px-2.5 py-2 text-left transition-colors hover:bg-[oklch(0.21_0_0)] active:scale-[0.99]"
      style={{
        borderColor: sc ?? (isDanger ? "oklch(0.55 0.2 25)" : undefined),
        background: isSolid ? accent : undefined,
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="h-1.5 w-1.5 rounded-full shrink-0"
          style={{
            background:
              sc ?? (isDanger ? "oklch(0.68 0.22 25)" : isSolid ? "oklch(0.145 0 0)" : accent),
          }}
        />
        <span
          className="label-mono text-[10px] truncate"
          style={{ color: isSolid ? "oklch(0.145 0 0)" : undefined }}
        >
          {label}
        </span>
      </div>
      <div
        className="label-mono text-[8.5px] mt-0.5 h-[10px] truncate"
        style={{ color: sc, opacity: stage === "IDLE" ? 0.45 : 1 }}
      >
        {stage === "IDLE" ? (note ?? "") : STAGE_LABEL[stage]}
      </div>
    </button>
  );
}

export function CommandGrid({
  commands,
  accent,
  onSend,
}: {
  commands: (string | CommandSpec)[];
  accent: string;
  onSend: CommandSender;
}) {
  const specs: CommandSpec[] = commands.map((c) => (typeof c === "string" ? { name: c } : c));
  const [stages, setStages] = useState<Record<string, CmdStage>>({});
  const [confirming, setConfirming] = useState<CommandSpec | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const fire = (spec: CommandSpec) => {
    onSend(spec.name, (stage) => {
      setStages((s) => ({ ...s, [spec.name]: stage }));
      if (stage === "PASS" || stage === "FAIL" || stage === "NAK") {
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
      <div className="grid grid-cols-2 gap-1.5">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="panel p-4 max-w-sm w-full flex flex-col gap-3 bg-[oklch(0.17_0_0)]">
            <span className="label-mono" style={{ color: "var(--warn)" }}>
              Confirm Command
            </span>
            <div className="readout text-sm">{confirming.name}</div>
            {confirming.note ? (
              <div className="label-mono text-[10px] opacity-70">{confirming.note}</div>
            ) : null}
            <p className="text-sm text-muted-foreground">
              Are you sure? This command actuates flight hardware and cannot be undone.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setConfirming(null)}
                className="panel px-2 py-2 label-mono text-[10px] hover:bg-[oklch(0.21_0_0)]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  fire(confirming);
                  setConfirming(null);
                }}
                className="panel px-2 py-2 label-mono text-[10px]"
                style={{ borderColor: "var(--destructive)", color: "var(--destructive)" }}
              >
                Confirm & Send
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
