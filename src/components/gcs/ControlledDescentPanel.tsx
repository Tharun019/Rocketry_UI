import { CONTROLLED_DESCENT_TRIGGER_ALT, type CansatFrame } from "./telemetry";

type Props = {
  data: CansatFrame;
  accent: string;
};

export function ControlledDescentPanel({ data, accent }: Props) {
  const active = data.state === "CONTROLLED_DESCENT";
  const armed = data.altitude > CONTROLLED_DESCENT_TRIGGER_ALT || data.state === "PRIMARY_DESCENT";
  const status = active ? "ACTIVE" : armed ? "ARMED" : "STANDBY";
  const deployed = data.propellers === "DEPLOYED";

  return (
    <div
      className="panel p-3 flex flex-col gap-2 transition-colors"
      style={{
        borderColor: active ? accent : undefined,
        background: active ? "oklch(0.2 0.03 210 / 0.5)" : undefined,
      }}
    >
      <div className="flex items-center justify-between">
        <span className="label-mono" style={{ color: active ? accent : undefined }}>
          Controlled Descent
        </span>
        {active ? (
          <span className="h-1.5 w-1.5 rounded-full dot-pulse" style={{ background: accent }} />
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Cell label="Trigger Altitude" value={`${CONTROLLED_DESCENT_TRIGGER_ALT}`} unit="m" />
        <Cell
          label="Current Altitude"
          value={deployed ? data.altitude.toFixed(0) : "—"}
          unit={deployed ? "m" : undefined}
          color={deployed ? accent : undefined}
        />
        <Cell
          label="Status"
          value={status}
          color={
            status === "ACTIVE" ? "var(--ok)" : status === "ARMED" ? "var(--warn)" : undefined
          }
          small
        />
        <Cell
          label="Propellers"
          value={data.propellers === "FAILED" ? "FAILED" : deployed ? "DEPLOYED" : "STOWED"}
          color={
            data.propellers === "FAILED"
              ? "var(--destructive)"
              : deployed
                ? "var(--ok)"
                : undefined
          }
          small
        />
      </div>
    </div>
  );
}

function Cell({
  label,
  value,
  unit,
  color,
  small,
}: {
  label: string;
  value: string;
  unit?: string;
  color?: string;
  small?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-[oklch(0.16_0_0)] p-2">
      <div className="label-mono text-[9px]">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className={small ? "readout text-sm" : "readout text-xl"} style={{ color }}>
          {value}
        </span>
        {unit ? <span className="label-mono text-[9px]">{unit}</span> : null}
      </div>
    </div>
  );
}
