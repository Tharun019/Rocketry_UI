import { useEffect, useMemo, useState } from "react";
import { Download, ListOrdered, Pause, Play } from "lucide-react";
import {
  GROUND_FIELDS,
  PACKET_FIELDS,
  buildFlightCsv,
  buildStateSummaryCsv,
  downloadText,
  fieldValue,
  flightFileName,
  groundCells,
  type IssueKind,
  type PacketRecord,
  type PacketStats,
} from "./packets";
import { Button, Panel, Segmented, Stat, StatusPill, TONE_COLOR, type Tone } from "./ui";
import { cn } from "@/lib/utils";

type Props = {
  log: PacketRecord[];
  stats: PacketStats;
  teamId: string;
  onTeamIdChange: (id: string) => void;
};

const SHOWN = 250;

const ISSUE_TONE: Record<IssueKind, Tone> = {
  MALFORMED: "danger",
  GAP: "warn",
  DUPLICATE: "warn",
  RESET: "warn",
  TEAM_ID: "warn",
  WARNING: "warn",
};

function rxTime(ms: number) {
  return new Date(ms).toISOString().slice(11, 22);
}

function recordTone(r: PacketRecord): Tone {
  return r.issues.some((i) => ISSUE_TONE[i.kind] === "danger")
    ? "danger"
    : r.issues.length
      ? "warn"
      : "ok";
}

export function PacketsView({ log, stats, teamId, onTeamIdChange }: Props) {
  const [filter, setFilter] = useState<"all" | "issues">("all");
  const [frozenAt, setFrozenAt] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  // Re-render every second so "last packet" age and rate keep moving when packets stop.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const now = Date.now();
  const end = frozenAt ?? log.length;

  const rows = useMemo(() => {
    const out: PacketRecord[] = [];
    for (let i = end - 1; i >= 0 && out.length < SHOWN; i--) {
      const r = log[i];
      if (filter === "all" || r.issues.length) out.push(r);
    }
    return out;
    // stats.received changes on every packet; the log array itself is mutated in place.
  }, [log, end, filter, stats.received]); // eslint-disable-line react-hooks/exhaustive-deps

  let recent = 0;
  for (let i = log.length - 1; i >= 0 && log[i].rxAt > now - 5000; i--) recent++;
  const rateHz = recent / 5;

  const inspected = selected !== null ? log[selected - 1] : log[end - 1];
  const sent = stats.valid + stats.missed;
  const lossPct = sent > 0 ? (stats.missed / sent) * 100 : 0;
  const ageS = stats.lastRxAt ? (now - stats.lastRxAt) / 1000 : null;
  const placeholderId = teamId.endsWith("XXX") || !teamId;

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Downlink health"
        meta="Rocket → ground station · every packet this session"
        actions={
          <StatusPill tone={ageS === null ? "neutral" : ageS > 3 ? "danger" : "ok"}>
            {ageS === null ? "NO DATA" : ageS > 3 ? "NO PACKETS" : "RECEIVING"}
          </StatusPill>
        }
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2">
          <Stat label="Received" value={stats.received.toLocaleString()} size="lg" />
          <Stat
            label="Valid"
            value={stats.valid.toLocaleString()}
            size="lg"
            color={TONE_COLOR.ok}
          />
          <Stat
            label="Missed (gaps)"
            value={stats.missed.toLocaleString()}
            size="lg"
            color={stats.missed ? TONE_COLOR.warn : undefined}
          />
          <Stat
            label="Malformed"
            value={stats.malformed.toLocaleString()}
            size="lg"
            color={stats.malformed ? TONE_COLOR.danger : undefined}
          />
          <Stat
            label="Loss"
            value={lossPct.toFixed(2)}
            unit="%"
            size="lg"
            color={lossPct > 2 ? TONE_COLOR.warn : undefined}
          />
          <Stat label="Rate" value={rateHz.toFixed(1)} unit="Hz" size="lg" />
          <Stat
            label="Last packet"
            value={ageS === null ? "—" : ageS.toFixed(1)}
            unit={ageS === null ? undefined : "s ago"}
            size="lg"
            color={ageS !== null && ageS > 3 ? TONE_COLOR.danger : undefined}
          />
          <Stat
            label="Dup · reset · ID"
            value={`${stats.duplicates} · ${stats.resets} · ${stats.teamMismatch}`}
            size="lg"
            color={
              stats.duplicates || stats.resets || stats.teamMismatch ? TONE_COLOR.warn : undefined
            }
          />
        </div>
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px] gap-4">
        <Panel
          title="Packet stream"
          meta={
            frozenAt !== null
              ? `Paused at packet ${frozenAt.toLocaleString()} · ${(log.length - frozenAt).toLocaleString()} more received`
              : `Latest ${Math.min(rows.length, SHOWN)} shown · newest first`
          }
          actions={
            <>
              <Segmented
                options={[
                  { id: "all", label: "All" },
                  { id: "issues", label: "Issues" },
                ]}
                value={filter}
                onChange={setFilter}
              />
              <Button
                active={frozenAt !== null}
                onClick={() => setFrozenAt(frozenAt === null ? log.length : null)}
                aria-label={frozenAt === null ? "Pause stream" : "Resume stream"}
              >
                {frozenAt === null ? (
                  <Pause className="h-3.5 w-3.5" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                {frozenAt === null ? "Pause" : "Resume"}
              </Button>
            </>
          }
          bodyClassName="flex flex-col gap-1.5"
        >
          <div className="overflow-x-auto scroll-quiet">
            <div className="min-w-[720px]">
              <div className="grid grid-cols-[92px_60px_64px_150px_64px_minmax(0,1fr)] gap-3 px-3 pb-1.5 eyebrow">
                <span>RX (UTC)</span>
                <span className="text-right">Count</span>
                <span className="text-right">Alt m</span>
                <span>State</span>
                <span>Status</span>
                <span>Raw packet</span>
              </div>
              <div className="well h-[520px] overflow-auto scroll-quiet py-1 font-mono text-[11.5px]">
                {rows.length === 0 ? (
                  <div className="px-3 py-1.5 text-subtle font-sans text-xs">
                    {filter === "issues" ? "No issues so far." : "Waiting for packets…"}
                  </div>
                ) : (
                  rows.map((r) => {
                    const tone = recordTone(r);
                    const isSel = inspected?.seq === r.seq;
                    return (
                      <button
                        key={r.seq}
                        type="button"
                        onClick={() => setSelected(isSel && selected !== null ? null : r.seq)}
                        className={cn(
                          "w-full text-left grid grid-cols-[92px_60px_64px_150px_64px_minmax(0,1fr)] gap-3 items-center px-3 py-1 hover:bg-hover/50",
                          isSel && "bg-hover",
                        )}
                      >
                        <span className="text-subtle">{rxTime(r.rxAt)}</span>
                        <span className="text-right text-foreground">{r.count ?? "—"}</span>
                        <span className="text-right">{fieldValue(r, "ALTITUDE") ?? "—"}</span>
                        <span className="truncate text-muted-foreground">
                          {fieldValue(r, "FLIGHT_SOFTWARE_STATE") ?? "—"}
                        </span>
                        <span className="text-[10.5px]" style={{ color: TONE_COLOR[tone] }}>
                          {r.issues[0]?.kind.replace("_", " ") ?? "OK"}
                        </span>
                        <span className="truncate text-subtle">{r.raw}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </Panel>

        <div className="flex flex-col gap-4 min-w-0">
          <ExportPanel
            log={log}
            stats={stats}
            teamId={teamId}
            onTeamIdChange={onTeamIdChange}
            placeholderId={placeholderId}
          />
          <Inspector
            record={inspected}
            pinned={selected !== null}
            onFollow={() => setSelected(null)}
          />
        </div>
      </div>
    </div>
  );
}

function ExportPanel({
  log,
  stats,
  teamId,
  onTeamIdChange,
  placeholderId,
}: {
  log: PacketRecord[];
  stats: PacketStats;
  teamId: string;
  onTeamIdChange: (id: string) => void;
  placeholderId: boolean;
}) {
  const name = flightFileName(teamId);
  return (
    <Panel
      title="Flight data export"
      meta="IN-SPACe format · CSV"
      bodyClassName="flex flex-col gap-3"
    >
      <label className="flex flex-col gap-1.5">
        <span className="eyebrow">Team ID</span>
        <input
          value={teamId}
          onChange={(e) => onTeamIdChange(e.target.value)}
          spellCheck={false}
          className="h-9 rounded-md border border-border bg-well px-2.5 readout text-[13px] focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-ring/40"
        />
        {placeholderId ? (
          <span className="text-[11px]" style={{ color: TONE_COLOR.warn }}>
            Enter your team ID before flight.
          </span>
        ) : null}
      </label>
      <div className="well px-3 py-2.5 flex flex-col gap-1">
        <span className="eyebrow">File</span>
        <span className="readout text-[13px] break-all">{name}</span>
        <span className="text-[11px] text-subtle">
          {stats.valid.toLocaleString()} data rows · {PACKET_FIELDS.length + GROUND_FIELDS.length}{" "}
          columns · header row · CRLF
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button
          size="md"
          variant="primary"
          disabled={stats.valid === 0}
          onClick={() => downloadText(name, buildFlightCsv(log))}
        >
          <Download className="h-3.5 w-3.5" /> Export CSV
        </Button>
        <Button
          size="md"
          disabled={stats.valid === 0}
          onClick={() =>
            downloadText(flightFileName(teamId, "_state_summary"), buildStateSummaryCsv(log))
          }
        >
          <ListOrdered className="h-3.5 w-3.5" /> State summary
        </Button>
      </div>
      <p className="text-[11px] text-subtle leading-relaxed">
        Export CSV holds every valid packet in spec field order, followed by the ground-station
        RSSI, SNR and receive time. State summary holds only the first 5 and last 5 readings of each
        flight state, in the order the states were reached.
      </p>
    </Panel>
  );
}

function Inspector({
  record,
  pinned,
  onFollow,
}: {
  record: PacketRecord | undefined;
  pinned: boolean;
  onFollow: () => void;
}) {
  return (
    <Panel
      title="Packet inspector"
      meta={record ? `RX #${record.seq} · ${rxTime(record.rxAt)} UTC` : undefined}
      actions={
        pinned ? (
          <Button onClick={onFollow}>Follow latest</Button>
        ) : (
          <StatusPill tone="neutral" dot={false}>
            LATEST
          </StatusPill>
        )
      }
      bodyClassName="flex flex-col gap-3"
    >
      {!record ? (
        <span className="text-xs text-subtle">Waiting for packets…</span>
      ) : (
        <>
          <div className="well px-3 py-2 font-mono text-[11px] text-muted-foreground break-all leading-relaxed">
            {record.raw || <span className="text-subtle">(empty line)</span>}
          </div>
          {record.issues.length ? (
            <div className="flex flex-col gap-1.5">
              {record.issues.map((i, k) => (
                <div key={k} className="flex items-start gap-2 text-xs">
                  <StatusPill tone={ISSUE_TONE[i.kind]}>{i.kind.replace("_", " ")}</StatusPill>
                  <span className="text-muted-foreground pt-1">{i.detail}</span>
                </div>
              ))}
            </div>
          ) : null}
          {record.values ? (
            <div className="well py-1 text-xs max-h-[420px] overflow-auto scroll-quiet">
              {[...PACKET_FIELDS, ...GROUND_FIELDS].map((f, i) => {
                const v =
                  i < PACKET_FIELDS.length
                    ? record.values![i]
                    : [...groundCells(record).map((c) => c || "—"), rxTime(record.rxAt)][
                        i - PACKET_FIELDS.length
                      ];
                return (
                  <div
                    key={f.key}
                    className={cn(
                      "grid grid-cols-[28px_minmax(0,1fr)_auto] gap-2 px-3 py-1",
                      i === PACKET_FIELDS.length && "border-t border-border mt-1 pt-2",
                    )}
                  >
                    <span className="readout text-subtle">{f.spec ?? "+"}</span>
                    <span className="truncate text-muted-foreground" title={f.key}>
                      {f.label}
                    </span>
                    <span className="readout text-right text-foreground">
                      {v === "" ? <span className="text-subtle">—</span> : v}
                      {f.unit ? (
                        <span className="ml-1 text-[10.5px] text-subtle">{f.unit}</span>
                      ) : null}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : null}
        </>
      )}
    </Panel>
  );
}
