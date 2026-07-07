import { useState } from "react";
import { Power, Play, Square, PlaneLanding } from "lucide-react";

type Props = {
  onCommand: (cmd: string) => void;
};

export function MotorPanel({ onCommand }: Props) {
  const [armed, setArmed] = useState(false);
  const [running, setRunning] = useState(false);
  const [throttle, setThrottle] = useState(0);
  const [autoLand, setAutoLand] = useState(false);

  return (
    <div className="panel p-3 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="label-mono">Motor Control</span>
        <span
          className="label-mono text-[10px] px-1.5 py-0.5 rounded border"
          style={{
            color: armed ? "var(--warn)" : "var(--muted-foreground)",
            borderColor: armed ? "var(--warn)" : "var(--border)",
          }}
        >
          {armed ? "ARMED" : "SAFE"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <button
          onClick={() => {
            const next = !armed;
            setArmed(next);
            onCommand(next ? "ARM_PROPELLERS" : "DISARM");
          }}
          className="panel px-2.5 py-2 flex items-center gap-2 hover:bg-[oklch(0.21_0_0)]"
          style={{ borderColor: armed ? "var(--warn)" : undefined }}
        >
          <Power className="h-3.5 w-3.5" style={{ color: armed ? "var(--warn)" : "var(--cansat)" }} />
          <span className="label-mono text-[10px]">{armed ? "Disarm" : "Arm"}</span>
        </button>
        <button
          disabled={!armed}
          onClick={() => {
            const next = !running;
            setRunning(next);
            onCommand(next ? "START_MOTORS" : "STOP_MOTORS");
          }}
          className="panel px-2.5 py-2 flex items-center gap-2 hover:bg-[oklch(0.21_0_0)] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {running ? (
            <Square className="h-3.5 w-3.5" style={{ color: "var(--destructive)" }} />
          ) : (
            <Play className="h-3.5 w-3.5" style={{ color: "var(--cansat)" }} />
          )}
          <span className="label-mono text-[10px]">{running ? "Stop" : "Start"}</span>
        </button>
        <button
          onClick={() => {
            setAutoLand(!autoLand);
            onCommand("AUTO_LANDING");
          }}
          className="panel col-span-2 px-2.5 py-2 flex items-center gap-2 hover:bg-[oklch(0.21_0_0)]"
          style={{ borderColor: autoLand ? "var(--cansat-dim)" : undefined }}
        >
          <PlaneLanding className="h-3.5 w-3.5" style={{ color: "var(--cansat)" }} />
          <span className="label-mono text-[10px]">Auto Landing {autoLand ? "· ON" : ""}</span>
        </button>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="label-mono text-[10px]">Throttle</span>
          <span className="readout text-xs">{throttle}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={throttle}
          onChange={(e) => setThrottle(Number(e.target.value))}
          disabled={!armed}
          className="w-full accent-[color:var(--cansat)] disabled:opacity-40"
        />
      </div>

      <button
        onClick={() => {
          setArmed(false);
          setRunning(false);
          setThrottle(0);
          onCommand("DISABLE_ACTIVE_SYSTEMS");
        }}
        className="w-full py-3 rounded-lg border font-semibold tracking-widest text-sm"
        style={{
          background: "oklch(0.32 0.18 25)",
          borderColor: "oklch(0.55 0.22 25)",
          color: "oklch(0.98 0 0)",
        }}
      >
        EMERGENCY STOP
      </button>
    </div>
  );
}
