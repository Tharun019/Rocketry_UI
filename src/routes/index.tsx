import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Header, type MissionEvent, type SystemStatus } from "@/components/gcs/Header";
import { RocketDashboard } from "@/components/gcs/RocketDashboard";
import { PacketMonitor } from "@/components/gcs/PacketMonitor";
import { PacketsView } from "@/components/gcs/PacketsView";
import { GroundStationPanel, type DataSource } from "@/components/gcs/GroundStationPanel";
import { useLiveTelemetry } from "@/components/gcs/live";
import { useSerialLines } from "@/components/gcs/serial";
import {
  buildFlightCsv,
  flightCsvRow,
  flightFileName,
  simulateDownlink,
  usePacketLog,
  useTeamId,
  type GroundLink as RfFigures,
} from "@/components/gcs/packets";
import { GroundLink, type LinkMode } from "@/components/gcs/link";
import { CHANNELS, type ChannelId } from "@/components/gcs/protocol";
import {
  LiveCsvFile,
  PacketBackup,
  fileRecordingSupported,
  type SavedLine,
} from "@/components/gcs/persist";
import {
  alertKey,
  stepAlerts,
  type AlertCondition,
  type DebounceState,
} from "@/components/gcs/alerts";
import { TrajectoryPanel } from "@/components/gcs/TrajectoryPanel";
import {
  AlertsPanel,
  type ActiveAlert,
  type AlertHistoryEntry,
  type AlertType,
} from "@/components/gcs/AlertsPanel";
import { CommandConsole, type ConsoleEntry } from "@/components/gcs/CommandConsole";
import type { CmdStage } from "@/components/gcs/CommandButton";
import { ROCKET_STATES, ROCKET_STATE_ALIASES, useTelemetry } from "@/components/gcs/telemetry";
import { useLaunchSite } from "@/components/gcs/site";
import type { Marker3D } from "@/components/gcs/Trajectory3D";
import { StateTimeline } from "@/components/gcs/StateTimeline";
import { TabBar } from "@/components/gcs/ui";

export const Route = createFileRoute("/")({
  component: GroundStation,
  head: () => ({
    meta: [
      { title: "Rocket Ground Station · Telemetry" },
      {
        name: "description",
        content:
          "Live rocket ground control station: telemetry, flight state timeline, trajectory map, alerts and command console.",
      },
      { property: "og:title", content: "Rocket Ground Station · Telemetry" },
      {
        property: "og:description",
        content:
          "Real-time rocket telemetry, trajectory tracking, mission alerts and command uplink.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function stamp() {
  return new Date().toISOString().slice(11, 19);
}

function GroundStation() {
  const { site, setSite, resetSite } = useLaunchSite();
  const [source, setSource] = useState<DataSource>("sim");
  // Updated at the moment of switching, so effects or serial lines still in flight
  // from the old source cannot land in the freshly cleared log.
  const sourceRef = useRef<DataSource>("sim");
  const sim = useTelemetry(site, source === "sim");
  const live = useLiveTelemetry(site);
  const rocket = source === "sim" ? sim.rocket : live.rocket;
  const [entries, setEntries] = useState<ConsoleEntry[]>([]);
  const nextId = useRef(1);

  const [tab, setTab] = useState<"flight" | "packets">("flight");

  // ---- Downlink packets --------------------------------------------------
  // Every telemetry frame arrives as one ASCII packet line; it is parsed and
  // logged like a real receiver would, independent of which tab is open.
  const { teamId, setTeamId } = useTeamId();
  const { log: packetLog, stats: packetStats, ingest, reset: resetPackets } = usePacketLog();
  useEffect(() => {
    if (sourceRef.current !== "sim" || sim.rocket.packetCount === 0) return;
    const f = sim.rocket;
    ingest(simulateDownlink(f, teamId), { rssi: f.rssi, snr: f.snr }, teamId);
  }, [sim.rocket.packetCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Live downlink over USB --------------------------------------------
  // Every line from the ground-station Teensy goes through the radio link layer:
  // in RAK mode it configures the RAK3272S and unwraps +EVT:RXP2P packets; in
  // plain mode the Teensy prints packets itself. Each packet is logged, saved to
  // the browser backup (and the live CSV file, if recording) and drives every panel.
  const [baud, setBaud] = useState(115200);
  const [lastLine, setLastLine] = useState<string | null>(null);
  const [linkMode, setLinkMode] = useState<LinkMode>("rak");
  const [channel, setChannel] = useState<ChannelId>("main");
  const linkRef = useRef<GroundLink | null>(null);
  linkRef.current ??= new GroundLink();
  const link = linkRef.current;
  const [, setLinkVersion] = useState(0);

  const backupRef = useRef<PacketBackup | null>(null);
  backupRef.current ??= new PacketBackup();
  const backup = backupRef.current;
  const [savedCount, setSavedCount] = useState(0);
  const [restoreOffer, setRestoreOffer] = useState(0);
  // While a restore is replaying, new packets wait here so nothing is lost or reordered.
  const restoring = useRef<Promise<void> | null>(null);
  const fileRef = useRef<LiveCsvFile | null>(null);
  const [, setFileVersion] = useState(0);

  const recordLive = (raw: string, rf: RfFigures | null, at?: number, save = true) => {
    const rec = ingest(raw, rf, teamId, at);
    live.apply(rec);
    if (save) {
      backup.add({ rxAt: rec.rxAt, raw, rssi: rec.rssi, snr: rec.snr, viaLink: rf !== null });
      setSavedCount((n) => n + 1);
    }
    const row = flightCsvRow(rec);
    if (row && fileRef.current) {
      fileRef.current.append(row);
      setFileVersion((n) => n + 1);
    }
  };

  const restoreBackup = (): Promise<void> => {
    if (restoring.current) return restoring.current;
    const run = (async () => {
      const lines: SavedLine[] = await backup.loadAll().catch(() => []);
      sourceRef.current = "live";
      setSource("live");
      resetPackets();
      live.reset();
      for (const l of lines)
        recordLive(l.raw, l.viaLink ? { rssi: l.rssi, snr: l.snr } : null, l.rxAt, false);
      setSavedCount(lines.length);
      setRestoreOffer(0);
    })();
    restoring.current = run;
    void run.finally(() => {
      restoring.current = null;
    });
    return run;
  };

  link.onChange = () => setLinkVersion((n) => n + 1);
  link.onPacket = (line, rf) => {
    if (sourceRef.current !== "live") return;
    // A saved session not yet restored: put it back first, then add this packet after it.
    if (restoreOffer > 0 || restoring.current) {
      const pending = restoreOffer > 0 ? restoreBackup() : restoring.current!;
      const at = Date.now();
      void pending.then(() => recordLive(line, rf, at));
      return;
    }
    recordLive(line, rf);
  };

  const serial = useSerialLines(
    (line) => {
      if (sourceRef.current !== "live") return;
      setLastLine(line);
      link.feedLine(line);
    },
    {
      onOpen: (write) => void link.attach(write),
      onClose: () => link.detach(),
    },
  );

  // Offer the previous live session after a reload; flush the backup when the tab goes away.
  useEffect(() => {
    void backup.count().then((n) => n > 0 && setRestoreOffer(n));
    const flush = () => void backup.flush();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
    };
  }, [backup]);

  const changeLinkMode = (m: LinkMode) => {
    link.mode = m;
    setLinkMode(m);
  };
  const changeChannel = (c: ChannelId) => {
    setChannel(c);
    link.radio = { ...link.radio, hz: CHANNELS.find((x) => x.id === c)!.hz };
    if (link.connected) void link.configure();
  };

  const startNewSession = () => {
    if (
      packetStats.received > 0 &&
      !window.confirm(
        `Clear the ${packetStats.received.toLocaleString()} packets received so far and start a new session? Export the CSV first if you need them.`,
      )
    )
      return;
    resetPackets();
    live.reset();
    void backup.clear();
    setSavedCount(0);
    setRestoreOffer(0);
    setEvents([]);
  };

  const startFile = async () => {
    try {
      const valid = packetLog.filter((r) => r.values).length;
      const f = await LiveCsvFile.create(flightFileName(teamId), buildFlightCsv(packetLog), valid);
      if (f) {
        fileRef.current = f;
        setFileVersion((n) => n + 1);
      }
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    }
  };
  const stopFile = async () => {
    const f = fileRef.current;
    fileRef.current = null;
    await f?.stop();
    setFileVersion((n) => n + 1);
  };

  const changeSource = (next: DataSource) => {
    if (next === source) return;
    if (
      source === "live" &&
      packetStats.received > 0 &&
      !window.confirm(
        `Switch to simulation? This clears the ${packetStats.received.toLocaleString()} live packets received so far. Export the CSV first if you need them.`,
      )
    )
      return;
    sourceRef.current = next;
    if (source === "live") {
      void serial.disconnect();
      void stopFile();
      void backup.clear();
      setSavedCount(0);
    }
    resetPackets();
    live.reset();
    setLastLine(null);
    setEvents([]);
    debounce.current.clear();
    setSource(next);
  };

  // Packets drive re-renders in simulation; in live mode tick once a second so a
  // silent link still raises the timeout alert.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (source !== "live") return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [source]);

  // ---- Mission event log -------------------------------------------------
  const [events, setEvents] = useState<MissionEvent[]>([]);
  const prevRocketState = useRef(rocket.state);
  useEffect(() => {
    const add = (label: string) => setEvents((e) => [...e, { label, time: stamp() }].slice(-30));

    if (prevRocketState.current !== rocket.state) {
      if (rocket.state === "IMU_CALIBRATE") add("IMU CALIBRATION");
      else if (rocket.state === "LIFTOFF") {
        add("IGNITION");
        add("LIFT-OFF");
      } else if (rocket.state === "APOGEE") add("APOGEE");
      else if (rocket.state === "PAYLOAD_SEPARATION") {
        add("DROGUE DEPLOY");
        add("PAYLOAD SEPARATION");
      } else if (rocket.state === "IMPACT") add("TOUCHDOWN");
      prevRocketState.current = rocket.state;
    }
  }, [rocket.state]);

  // ---- Command lifecycle -------------------------------------------------
  const pushCommand = (
    channel: ConsoleEntry["channel"],
    cmd: string,
    onStage?: (stage: CmdStage) => void,
  ) => {
    const id = nextId.current++;
    setEntries((e) =>
      [
        ...e,
        { id, t: stamp(), channel, cmd, ack: "PENDING" as const, exec: "PENDING" as const },
      ].slice(-80),
    );
    const update = (patch: Partial<ConsoleEntry>) =>
      setEntries((e) => e.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    if (source === "live") {
      // Not connected: log the command but do not pretend it was sent.
      if (!link.connected) {
        update({ ack: "UNSENT", note: "USB not connected" });
        onStage?.("UNSENT");
        return;
      }
      link.sendCommand(cmd, (stage, detail) => {
        if (stage === "SENT") update({ note: "on air, waiting for ACK" });
        if (stage === "ACK") update({ ack: "ACK", note: "waiting for execution report" });
        if (stage === "NAK") update({ ack: "NAK", exec: "FAIL", note: detail });
        if (stage === "PASS") update({ exec: "PASS", note: detail });
        if (stage === "FAIL") update({ exec: "FAIL", note: detail });
        onStage?.(stage);
        if ((stage === "NAK" || stage === "FAIL") && cmd.startsWith("DEPLOY"))
          raiseParachuteFailure();
      });
      return;
    }
    onStage?.("SENT");

    const acked = Math.random() > 0.06;
    setTimeout(
      () => {
        setEntries((e) => e.map((x) => (x.id === id ? { ...x, ack: acked ? "ACK" : "NAK" } : x)));
        onStage?.(acked ? "ACK" : "NAK");
        if (!acked) {
          setEntries((e) => e.map((x) => (x.id === id ? { ...x, exec: "FAIL" } : x)));
          if (cmd.startsWith("DEPLOY")) raiseParachuteFailure();
          return;
        }
        const passed = Math.random() > 0.08;
        setTimeout(
          () => {
            setEntries((e) =>
              e.map((x) => (x.id === id ? { ...x, exec: passed ? "PASS" : "FAIL" } : x)),
            );
            onStage?.(passed ? "PASS" : "FAIL");
            if (!passed && cmd.startsWith("DEPLOY")) raiseParachuteFailure();
          },
          500 + Math.random() * 500,
        );
      },
      400 + Math.random() * 400,
    );
  };

  // ---- Alerts ------------------------------------------------------------
  const [parachuteFail, setParachuteFail] = useState(false);
  const raiseParachuteFailure = () => {
    setParachuteFail(true);
    setTimeout(() => setParachuteFail(false), 12000);
  };

  const now = Date.now();
  const conditions = useMemo(() => {
    const list: (AlertCondition<AlertType> & { source: ActiveAlert["source"] })[] = [];
    // Shown at once: a failed deploy is never noise.
    if (parachuteFail)
      list.push({ type: "PARACHUTE COMMAND FAILED", level: "danger", source: "SYS", raiseMs: 0 });
    // Nothing to judge until the first packet arrives.
    if (rocket.lastPacketAt === 0) return list;
    const rocketStale = now - rocket.lastPacketAt > 3000;
    if (rocket.linkQuality < 62 || (rocket.rssi !== null && rocket.rssi < -100))
      list.push({ type: "COMMUNICATION LOST", level: "danger", source: "ROCKET" });
    // Already means 3 s of silence, so no extra hold before raising it.
    if (rocketStale)
      list.push({ type: "TELEMETRY TIMEOUT", level: "danger", source: "ROCKET", raiseMs: 0 });
    if (rocket.battery < 11.2)
      list.push({
        type: "LOW BATTERY",
        level: "warn",
        source: "ROCKET",
        detail: `${rocket.battery.toFixed(2)} V`,
      });
    if (rocket.temperature > 45)
      list.push({
        type: "HIGH TEMPERATURE",
        level: "warn",
        source: "ROCKET",
        detail: `${rocket.temperature.toFixed(1)} °C`,
      });
    if (!rocket.gpsValid) list.push({ type: "GPS INVALID", level: "warn", source: "ROCKET" });
    return list;
  }, [
    rocket.linkQuality,
    rocket.rssi,
    rocket.battery,
    rocket.temperature,
    rocket.gpsValid,
    rocket.lastPacketAt,
    parachuteFail,
    now,
  ]);

  const [activeAlerts, setActiveAlerts] = useState<ActiveAlert[]>([]);
  const [alertHistory, setAlertHistory] = useState<AlertHistoryEntry[]>([]);
  const alertId = useRef(1);
  // Debounced: a condition must hold ~2 s to raise and be gone ~3 s to clear.
  const debounce = useRef<DebounceState>(new Map());
  useEffect(() => {
    const { raised, cleared, active } = stepAlerts(debounce.current, conditions, Date.now());
    const byKey = new Map(conditions.map((c) => [alertKey(c), c]));
    setActiveAlerts((prev) => {
      const prevMap = new Map(prev.map((a) => [alertKey(a), a]));
      const next: ActiveAlert[] = [];
      for (const k of active) {
        const c = byKey.get(k);
        const existing = prevMap.get(k);
        if (existing) next.push(c ? { ...existing, detail: c.detail } : existing);
        else if (c)
          next.push({
            type: c.type,
            level: c.level,
            source: c.source,
            detail: c.detail,
            since: stamp(),
          });
      }
      const same =
        next.length === prev.length &&
        next.every(
          (a, i) =>
            a === prev[i] ||
            (prev[i] && a.detail === prev[i].detail && alertKey(a) === alertKey(prev[i])),
        );
      return same ? prev : next;
    });
    if (raised.length || cleared.length) {
      const entry = (k: string, action: "RAISED" | "CLEARED") => {
        const [type, src] = k.split("|");
        return {
          id: alertId.current++,
          type: type as AlertType,
          source: src,
          time: stamp(),
          action,
        };
      };
      setAlertHistory((h) =>
        [
          ...h,
          ...raised.map((k) => entry(k, "RAISED")),
          ...cleared.map((k) => entry(k, "CLEARED")),
        ].slice(-60),
      );
    }
  }, [conditions]);

  // ---- Derived mission phase / status ------------------------------------
  const missionPhase = useMemo(() => {
    if (rocket.state === "IMPACT") return "ROCKET LANDED";
    if (rocket.state === "DESCENT") return "ROCKET DESCENT";
    if (rocket.state === "PAYLOAD_SEPARATION") return "PAYLOAD SEPARATION";
    if (rocket.state === "APOGEE") return "APOGEE";
    if (rocket.state === "ASCENT" || rocket.state === "LIFTOFF") return "ASCENT";
    return "PRE-LAUNCH";
  }, [rocket.state]);

  const systemStatus: SystemStatus = activeAlerts.some((a) => a.level === "danger")
    ? "CRITICAL"
    : activeAlerts.length > 0
      ? "DEGRADED"
      : "NOMINAL";

  const linkStatus = (quality: number, lastPacketAt: number) => {
    if (lastPacketAt > 0 && now - lastPacketAt > 3000) return "LOST" as const;
    if (quality < 70) return "DEGRADED" as const;
    return "CONNECTED" as const;
  };

  const alert = useMemo(() => {
    const danger = activeAlerts.find((a) => a.level === "danger");
    if (danger) return { level: "danger" as const, message: `${danger.type} · ${danger.source}` };
    const warn = activeAlerts[0];
    if (warn) return { level: "warn" as const, message: `${warn.type} · ${warn.source}` };
    if (rocket.state === "IMPACT")
      return { level: "info" as const, message: "ROCKET LANDED · RECOVERY" };
    if (source === "sim")
      return { level: "info" as const, message: "SIMULATION MODE · TELEMETRY NOMINAL" };
    if (serial.status !== "open")
      return { level: "info" as const, message: "LIVE MODE · GROUND STATION NOT CONNECTED" };
    if (rocket.lastPacketAt === 0)
      return { level: "info" as const, message: "LIVE MODE · WAITING FOR PACKETS" };
    return { level: "info" as const, message: "LIVE MODE · TELEMETRY NOMINAL" };
  }, [activeAlerts, rocket.state, rocket.lastPacketAt, source, serial.status]);

  // Apogee = highest recorded fix (firmware APOGEE state can lag the true peak).
  const apogeePoint = useMemo(
    () =>
      rocket.track.reduce<(typeof rocket.track)[number] | null>(
        (best, p) => (!best || p.alt > best.alt ? p : best),
        null,
      ),
    [rocket.track],
  );
  // Flight-state callouts on the 3D path: each state at the fix where it began.
  // Up to apogee they sit in the left column, the descent states in the right one.
  const flightMarkers = useMemo(() => {
    const apogeeIdx = ROCKET_STATES.indexOf("APOGEE");
    return ROCKET_STATES.flatMap((s, i): Marker3D[] => {
      const fix = rocket.stateFixes[s];
      if (!fix) return [];
      const point = s === "APOGEE" && apogeePoint ? apogeePoint : fix;
      const alias = ROCKET_STATE_ALIASES[s];
      return [
        {
          key: s,
          label: s.replace(/_/g, " "),
          sub: `${alias ? `[${alias}] · ` : ""}${point.alt.toFixed(0)} m`,
          point,
          side: i <= apogeeIdx ? "left" : "right",
        },
      ];
    });
  }, [rocket.stateFixes, apogeePoint]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        rocketRf={{ rssi: rocket.rssi, snr: rocket.snr, quality: rocket.linkQuality }}
        alert={alert}
        events={events}
        missionPhase={missionPhase}
        systemStatus={systemStatus}
      />

      <main className="flex-1 w-full mx-auto max-w-[1920px] px-6 py-5 flex flex-col gap-4">
        <TabBar
          tabs={[
            { id: "flight", label: "Flight" },
            {
              id: "packets",
              label: "Packets",
              badge: packetStats.received.toLocaleString(),
            },
          ]}
          value={tab}
          onChange={setTab}
        />

        {tab === "packets" ? (
          <PacketsView
            log={packetLog}
            stats={packetStats}
            teamId={teamId}
            onTeamIdChange={setTeamId}
          />
        ) : null}

        {/* Kept mounted while hidden so the 3D view and charts keep their state. */}
        <div className={tab === "flight" ? "flex flex-col gap-4" : "hidden"}>
          <RocketDashboard
            data={rocket}
            onCommand={(c, onStage) => pushCommand("ROCKET", c, onStage)}
          />

          <TrajectoryPanel
            label="Flight path"
            accent="var(--rocket)"
            track={rocket.track}
            markers={flightMarkers}
            site={site}
            onSiteChange={setSite}
            onSiteReset={resetSite}
            velocityNow={rocket.velocity}
            altitude={rocket.charts.altitude}
            velocity={rocket.charts.velocity}
            altitudeColor="var(--rocket)"
            velocityColor="oklch(0.9 0 0)"
            timeline={
              <StateTimeline
                states={ROCKET_STATES}
                current={rocket.state}
                accent="var(--rocket)"
                aliases={ROCKET_STATE_ALIASES}
              />
            }
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PacketMonitor
              tx={entries.length}
              rx={packetStats.valid}
              loss={packetStats.missed}
              snr={rocket.snr}
              lastPacket={
                packetStats.lastRxAt
                  ? new Date(packetStats.lastRxAt).toISOString().slice(11, 19)
                  : "—"
              }
              rateHz={rocket.updateRate}
              status={linkStatus(rocket.linkQuality, rocket.lastPacketAt)}
            />
            <GroundStationPanel
              source={source}
              onSourceChange={changeSource}
              status={serial.status}
              error={serial.error}
              baud={baud}
              onBaudChange={setBaud}
              onConnect={() => void serial.connect(baud)}
              onDisconnect={() => void serial.disconnect()}
              lastLine={lastLine}
              linkMode={linkMode}
              onLinkModeChange={changeLinkMode}
              channel={channel}
              onChannelChange={changeChannel}
              radioState={link.state}
              radioDetail={link.stateDetail}
              radioLog={link.log}
              onReconfigure={() => void link.configure()}
              backup={{
                saved: savedCount,
                error: backup.error,
                offer:
                  restoreOffer > 0
                    ? {
                        count: restoreOffer,
                        onRestore: () => void restoreBackup(),
                        onDiscard: () => {
                          if (
                            !window.confirm(
                              `Delete the ${restoreOffer.toLocaleString()} saved packets? This cannot be undone.`,
                            )
                          )
                            return;
                          void backup.clear();
                          setRestoreOffer(0);
                        },
                      }
                    : null,
                onNewSession: startNewSession,
              }}
              fileRec={{
                supported: fileRecordingSupported(),
                active: fileRef.current
                  ? {
                      name: fileRef.current.name,
                      rows: fileRef.current.rows,
                      error: fileRef.current.error,
                    }
                  : null,
                onStart: () => void startFile(),
                onStop: () => void stopFile(),
              }}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <AlertsPanel active={activeAlerts} history={alertHistory} />
            <CommandConsole entries={entries} />
          </div>
        </div>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-[1920px] px-6 h-10 flex items-center justify-between text-[11px] text-subtle">
          <span>
            Rocket Ground Station v1.0 ·{" "}
            {source === "sim" ? "Simulated telemetry" : "Live telemetry · USB"}
          </span>
          <span>© Team ROCKETRY-020 · 2026</span>
        </div>
      </footer>
    </div>
  );
}
