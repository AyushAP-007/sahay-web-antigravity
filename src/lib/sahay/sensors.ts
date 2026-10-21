import type { MotionPattern } from "./models.ts";
import { simulatedAccel } from "./safety.ts";

export interface SensorReading {
  motionPattern: MotionPattern;
  accelMagnitude: number;
  orientation: "upright" | "tilted" | "inverted";
  sampledAt: string;
  source: "simulated" | "locket";
}

/**
 * Boundary for motion input. The simulated provider is what the app and the
 * Simulation Lab use today. A future locket firmware can implement the same
 * shape once a real device protocol exists.
 */
export interface SensorProvider {
  id: "simulated" | "locket";
  label: string;
  connected: boolean;
  describe(): string;
  read(pattern?: MotionPattern): SensorReading | null;
}

export const simulatedSensorProvider: SensorProvider = {
  id: "simulated",
  label: "Simulated motion",
  connected: true,
  describe() {
    return "Demonstration patterns only. No MPU6050, ESP32, or Bluetooth locket is connected.";
  },
  read(pattern: MotionPattern = "idle") {
    const sample = simulatedAccel(pattern);
    return {
      motionPattern: pattern,
      accelMagnitude: sample.magnitude,
      orientation: sample.orientation,
      sampledAt: new Date().toISOString(),
      source: "simulated",
    };
  },
};

export const locketSensorProvider: SensorProvider = {
  id: "locket",
  label: "Locket IMU",
  connected: false,
  describe() {
    return "No locket link is configured. When a device protocol exists, it can implement SensorProvider.read. Sahay will not invent sensor values.";
  },
  read() {
    return null;
  },
};

export function activeSensorProvider(): SensorProvider {
  return locketSensorProvider.connected
    ? locketSensorProvider
    : simulatedSensorProvider;
}
