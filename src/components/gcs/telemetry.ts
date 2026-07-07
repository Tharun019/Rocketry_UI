import { useEffect, useRef, useState } from "react";

export type FlightState =
  | "BOOT"
  | "TEST_MODE"
  | "LAUNCH_PAD"
  | "ASCENT"
  | "PAYLOAD_SEPARATION"
  | "DESCENT"
  | "AEROBRAKE_RELEASE"
  | "IMPACT";

export const ROCKET_STATES: FlightState[] = [
  "BOOT",
  "TEST_MODE",
  "LAUNCH_PAD",
  "ASCENT",
  "PAYLOAD_SEPARATION",
  "DESCENT",
  "AEROBRAKE_RELEASE",
  "IMPACT",
];

export type CansatState =
  | "BOOT"
  | "STANDBY"
  | "DEPLOYED"
  | "DESCENT"
  | "POWERED_DESCENT"
  | "LANDED";

export const CANSAT_STATES: CansatState[] = [
  "BOOT",
  "STANDBY",
  "DEPLOYED",
  "DESCENT",
  "POWERED_DESCENT",
  "LANDED",
];

export type Sample = { t: number; v: number };

export type RocketFrame = {
  state: FlightState;
  t: number;
  altitude: number;
  velocity: number;
  pressure: number;
  temperature: number;
  accel: [number, number, number];
  gyro: [number, number, number];
  battery: number;
  rssi: number;
  linkQuality: number;
  lat: number;
  lon: number;
  path: [number, number][];
  charts: {
    altitude: Sample[];
    velocity: Sample[];
    acceleration: Sample[];
    gyro: Sample[];
    pressure: Sample[];
    temperature: Sample[];
    battery: Sample[];
  };
};

export type CansatFrame = {
  state: CansatState;
  t: number;
  altitude: number;
  velocity: number;
  pressure: number;
  humidity: number;
  iaq: number;
  gasResistance: number;
  radiationCpm: number;
  doseRate: number;
  irTemp: number;
  battery: number;
  current: number;
  motorRpm: number;
  motorCurrent: number;
  rssi: number;
  linkQuality: number;
  lat: number;
  lon: number;
  path: [number, number][];
  charts: {
    altitude: Sample[];
    humidity: Sample[];
    iaq: Sample[];
    radiation: Sample[];
    batteryCurrent: Sample[];
    motorRpm: Sample[];
    motorCurrent: Sample[];
    irTemp: Sample[];
  };
};

const MAX = 60;

function push(arr: Sample[], t: number, v: number): Sample[] {
  const next = arr.length >= MAX ? arr.slice(1) : arr.slice();
  next.push({ t, v });
  return next;
}

export function useTelemetry() {
  const t0 = useRef(Date.now());
  const [rocket, setRocket] = useState<RocketFrame>(() => ({
    state: "LAUNCH_PAD",
    t: 0,
    altitude: 0,
    velocity: 0,
    pressure: 1013,
    temperature: 24,
    accel: [0, 0, 9.81],
    gyro: [0, 0, 0],
    battery: 12.4,
    rssi: -62,
    linkQuality: 98,
    lat: 13.0827,
    lon: 80.2707,
    path: [[13.0827, 80.2707]],
    charts: {
      altitude: [],
      velocity: [],
      acceleration: [],
      gyro: [],
      pressure: [],
      temperature: [],
      battery: [],
    },
  }));

  const [cansat, setCansat] = useState<CansatFrame>(() => ({
    state: "STANDBY",
    t: 0,
    altitude: 0,
    velocity: 0,
    pressure: 1013,
    humidity: 58,
    iaq: 42,
    gasResistance: 120,
    radiationCpm: 18,
    doseRate: 0.12,
    irTemp: 22,
    battery: 7.8,
    current: 0.42,
    motorRpm: 0,
    motorCurrent: 0,
    rssi: -71,
    linkQuality: 92,
    lat: 13.0829,
    lon: 80.2705,
    path: [[13.0829, 80.2705]],
    charts: {
      altitude: [],
      humidity: [],
      iaq: [],
      radiation: [],
      batteryCurrent: [],
      motorRpm: [],
      motorCurrent: [],
      irTemp: [],
    },
  }));

  useEffect(() => {
    const id = setInterval(() => {
      const t = (Date.now() - t0.current) / 1000;

      setRocket((r) => {
        // scripted mission arc
        let state = r.state;
        if (t > 5 && state === "LAUNCH_PAD") state = "ASCENT";
        if (t > 25 && state === "ASCENT") state = "PAYLOAD_SEPARATION";
        if (t > 30 && state === "PAYLOAD_SEPARATION") state = "DESCENT";
        if (t > 55 && state === "DESCENT") state = "AEROBRAKE_RELEASE";
        if (t > 90 && state === "AEROBRAKE_RELEASE") state = "IMPACT";

        let alt = r.altitude;
        let vel = r.velocity;
        if (state === "ASCENT") {
          vel = Math.min(180, vel + 6 + Math.random() * 2);
          alt += vel * 0.2;
        } else if (state === "PAYLOAD_SEPARATION") {
          vel += (0 - vel) * 0.1;
          alt += vel * 0.2;
        } else if (state === "DESCENT" || state === "AEROBRAKE_RELEASE") {
          vel = Math.max(-40, vel - 2 - Math.random());
          alt = Math.max(0, alt + vel * 0.2);
        } else if (state === "IMPACT") {
          vel = 0;
          alt = 0;
        }

        const accel: [number, number, number] = [
          (Math.random() - 0.5) * 1.5,
          (Math.random() - 0.5) * 1.5,
          state === "ASCENT" ? 30 + Math.random() * 8 : 9.81 + (Math.random() - 0.5) * 2,
        ];
        const gyro: [number, number, number] = [
          (Math.random() - 0.5) * 40,
          (Math.random() - 0.5) * 40,
          (Math.random() - 0.5) * 15,
        ];

        const dLat = (Math.random() - 0.5) * 0.00008;
        const dLon = (Math.random() - 0.5) * 0.00008;
        const lat = r.lat + dLat;
        const lon = r.lon + dLon;
        const path = r.path.length > 120 ? [...r.path.slice(1), [lat, lon] as [number, number]] : [...r.path, [lat, lon] as [number, number]];

        return {
          ...r,
          state,
          t,
          altitude: alt,
          velocity: vel,
          pressure: Math.max(200, 1013 - alt * 0.11 + (Math.random() - 0.5)),
          temperature: 24 - alt * 0.006 + (Math.random() - 0.5) * 0.4,
          accel,
          gyro,
          battery: Math.max(10.8, r.battery - 0.0008),
          rssi: -55 - Math.round(Math.random() * 20),
          linkQuality: Math.max(60, Math.min(100, r.linkQuality + (Math.random() - 0.5) * 4)),
          lat,
          lon,
          path,
          charts: {
            altitude: push(r.charts.altitude, t, alt),
            velocity: push(r.charts.velocity, t, vel),
            acceleration: push(r.charts.acceleration, t, accel[2]),
            gyro: push(r.charts.gyro, t, gyro[0]),
            pressure: push(r.charts.pressure, t, 1013 - alt * 0.11),
            temperature: push(r.charts.temperature, t, 24 - alt * 0.006),
            battery: push(r.charts.battery, t, Math.max(10.8, r.battery - 0.0008)),
          },
        };
      });

      setCansat((c) => {
        let state = c.state;
        if (t > 25 && state === "STANDBY") state = "DEPLOYED";
        if (t > 32 && state === "DEPLOYED") state = "DESCENT";
        if (t > 60 && state === "DESCENT") state = "POWERED_DESCENT";
        if (t > 95 && state === "POWERED_DESCENT") state = "LANDED";

        let alt = c.altitude;
        let vel = c.velocity;
        if (state === "STANDBY") {
          alt = 0;
        } else if (state === "DEPLOYED") {
          alt = 500 + Math.random() * 30;
          vel = -18;
        } else if (state === "DESCENT") {
          vel = -12 + Math.random() * 2;
          alt = Math.max(0, alt + vel * 0.2);
        } else if (state === "POWERED_DESCENT") {
          vel = -4 + Math.random();
          alt = Math.max(0, alt + vel * 0.2);
        } else {
          vel = 0;
          alt = 0;
        }

        const motorRpm =
          state === "POWERED_DESCENT" ? 3200 + Math.random() * 400 : state === "LANDED" ? 0 : 0;
        const motorCurrent = motorRpm > 0 ? 2.2 + Math.random() * 0.4 : 0;

        const dLat = (Math.random() - 0.5) * 0.00006;
        const dLon = (Math.random() - 0.5) * 0.00006;
        const lat = c.lat + dLat;
        const lon = c.lon + dLon;
        const path = c.path.length > 120 ? [...c.path.slice(1), [lat, lon] as [number, number]] : [...c.path, [lat, lon] as [number, number]];

        const radiationCpm = 15 + Math.random() * 10;
        const humidity = Math.min(95, Math.max(20, c.humidity + (Math.random() - 0.5) * 2));
        const iaq = Math.min(200, Math.max(20, c.iaq + (Math.random() - 0.5) * 4));

        return {
          ...c,
          state,
          t,
          altitude: alt,
          velocity: vel,
          pressure: Math.max(200, 1013 - alt * 0.11 + (Math.random() - 0.5)),
          humidity,
          iaq,
          gasResistance: 100 + Math.random() * 60,
          radiationCpm,
          doseRate: radiationCpm * 0.0057,
          irTemp: 22 - alt * 0.005 + (Math.random() - 0.5) * 0.5,
          battery: Math.max(6.6, c.battery - 0.0005),
          current: 0.4 + Math.random() * 0.2 + motorCurrent * 0.3,
          motorRpm,
          motorCurrent,
          rssi: -65 - Math.round(Math.random() * 18),
          linkQuality: Math.max(55, Math.min(100, c.linkQuality + (Math.random() - 0.5) * 4)),
          lat,
          lon,
          path,
          charts: {
            altitude: push(c.charts.altitude, t, alt),
            humidity: push(c.charts.humidity, t, humidity),
            iaq: push(c.charts.iaq, t, iaq),
            radiation: push(c.charts.radiation, t, radiationCpm),
            batteryCurrent: push(c.charts.batteryCurrent, t, 0.4 + motorCurrent * 0.3),
            motorRpm: push(c.charts.motorRpm, t, motorRpm),
            motorCurrent: push(c.charts.motorCurrent, t, motorCurrent),
            irTemp: push(c.charts.irTemp, t, 22 - alt * 0.005),
          },
        };
      });
    }, 200);
    return () => clearInterval(id);
  }, []);

  return { rocket, cansat };
}
