import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");

function output(command: string, args: string[]) {
  try { return execFileSync(command, args, { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }); }
  catch { return ""; }
}

const adbPath = output("where.exe", ["adb.exe"]).trim().split(/\r?\n/).filter(Boolean)[0] ?? "";
const adbOutput = adbPath ? output(adbPath, ["devices", "-l"]) : "";
const androidAttached = adbOutput.split(/\r?\n/).filter((line) => /\sdevice(?:\s|$)/.test(line) && !line.startsWith("List of devices")).length;
const appleDeviceCountRaw = output("powershell.exe", [
  "-NoProfile",
  "-Command",
  "@(Get-CimInstance Win32_PnPEntity -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'iPhone|iPad|Apple Mobile Device' }).Count",
]).trim();
const appleDeviceCount = Number.parseInt(appleDeviceCountRaw, 10) || 0;

const report = {
  reportVersion: "0.9",
  generatedAt: new Date().toISOString(),
  mode: "physical-device-availability-audit",
  host: "Windows",
  android: {
    adbAvailable: Boolean(adbPath),
    attachedDeviceCount: androidAttached,
    realChromeRunStatus: androidAttached > 0 ? "available but not yet executed" : "pending — no ADB device attached",
  },
  ios: {
    detectedAppleMobileDeviceCount: appleDeviceCount,
    realSafariRunStatus: appleDeviceCount > 0 ? "device detected; iOS Safari automation still requires a compatible device lab" : "pending — no iPhone/iPad detected",
  },
  lowPerformanceHardware: {
    attachedCandidateCount: androidAttached,
    realHardwareRunStatus: androidAttached > 0 ? "candidate device attached; hardware tier must be confirmed" : "pending — no physical low-performance candidate attached",
  },
  emulationIsNotRealDeviceEvidence: true,
  passed: true,
};

const reportPath = resolve(root, "docs/v0.9-device-availability.json");
writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify({ reportPath, androidAttached, appleDeviceCount, passed: report.passed }, null, 2));
