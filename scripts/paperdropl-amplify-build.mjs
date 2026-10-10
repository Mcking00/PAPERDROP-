#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const logDir = path.join(root, "diagnostic-logs");
fs.mkdirSync(logDir, { recursive: true });

const summaryFile = path.join(logDir, "latest-summary.log");
const orchestrationLog = path.join(logDir, "amplify-orchestration.log");
const failures = [];

try { fs.rmSync(summaryFile, { force: true }); } catch {}

function log(line = "") {
  fs.appendFileSync(orchestrationLog, line + "\n");
  process.stdout.write(line + "\n");
}

function run(name, command, args, options = {}) {
  log(`\n[ORCHESTRATION] ${name}`);
  log(`$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 30 * 1024 * 1024,
    ...options,
  });
  if (result.stdout) log(result.stdout.trimEnd());
  if (result.stderr) log(result.stderr.trimEnd());
  if (result.error) log(`Process error: ${result.error.message}`);
  const status = result.status ?? 1;
  if (status !== 0) {
    const message = `${name} failed (exit ${status})`;
    failures.push({ checkNo: 0, name, status: "FAIL", severity: "ERROR", message });
    log(`FAIL: ${message}`);
  } else {
    log(`PASS: ${name}`);
  }
  return status === 0;
}

log("PAPERDROPL AMPLIFY BUILD ORCHESTRATOR");
log(`Started: ${new Date().toISOString()}`);
log("Each stage is attempted even when an earlier stage fails. Final deployment gate remains strict.");

run("Dependency reconciliation and installation", "npm", [
  "install", "--cache", ".npm", "--prefer-offline", "--no-audit", "--no-fund",
]);

if (!process.env.AWS_BRANCH || !process.env.AWS_APP_ID) {
  failures.push({
    checkNo: 0,
    name: "Amplify environment",
    status: "FAIL",
    severity: "ERROR",
    message: "AWS_BRANCH or AWS_APP_ID is missing; backend deployment commands cannot be safely run.",
  });
  log("FAIL: AWS_BRANCH or AWS_APP_ID is missing; continuing with diagnostics.");
} else {
  run("Amplify backend deployment", "npx", [
    "ampx", "pipeline-deploy", "--branch", process.env.AWS_BRANCH,
    "--app-id", process.env.AWS_APP_ID,
  ]);
  run("Amplify outputs generation", "npx", [
    "ampx", "generate", "outputs", "--branch", process.env.AWS_BRANCH,
    "--app-id", process.env.AWS_APP_ID,
  ]);
}

run("Full PAPERDROPL diagnostics", process.execPath, [
  path.join(root, "scripts", "paperdropl-diagnostics.mjs"),
]);

let report;
try {
  report = JSON.parse(fs.readFileSync(summaryFile, "utf8"));
  if (!Array.isArray(report.results)) report.results = [];
} catch {
  report = {
    started: new Date().toISOString(),
    checks: 0,
    passed: 0,
    warnings: 0,
    errors: 1,
    results: [{
      checkNo: 0,
      name: "Diagnostic report generation",
      status: "FAIL",
      severity: "ERROR",
      message: "Diagnostics did not produce a readable latest-summary.log; see amplify-orchestration.log.",
    }],
    logFile: path.relative(root, orchestrationLog),
  };
}

for (const failure of failures) {
  report.results.push({ ...failure, checkNo: report.results.length + 1 });
}
report.checks = report.results.length;
report.passed = report.results.filter((item) => item.status === "PASS").length;
report.warnings = report.results.filter((item) => item.status === "WARN").length;
report.errors = report.results.filter((item) => item.status === "FAIL" && item.severity !== "WARN").length;
report.orchestrationLog = path.relative(root, orchestrationLog);
report.completed = new Date().toISOString();

fs.writeFileSync(summaryFile, JSON.stringify(report, null, 2) + "\n");
log("\nPAPERDROPL orchestration finished; all available stages were attempted.");
log(`Checks recorded: ${report.checks}; passed: ${report.passed}; warnings: ${report.warnings}; errors: ${report.errors}`);
log(`Full orchestration log: ${report.orchestrationLog}`);
log("The frontend final-check decides whether deployment may proceed.");
// Deliberately return success here so Amplify reaches the frontend final gate.
// The final gate fails when any required orchestration or diagnostic check failed.
