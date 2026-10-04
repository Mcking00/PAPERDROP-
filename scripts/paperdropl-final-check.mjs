import fs from "node:fs";

const file = "diagnostic-logs/latest-summary.log";

if (!fs.existsSync(file)) {
  console.error("PAPERDROPL diagnostic summary is missing.");
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(file, "utf8"));

console.log("PAPERDROPL final diagnostic gate");
console.log("Checks:", report.checks);
console.log("Passed:", report.passed);
console.log("Warnings:", report.warnings);
console.log("Errors:", report.errors);

if (report.errors > 0) {
  console.error("PAPERDROPL diagnostics found blocking errors.");
  process.exit(1);
}

console.log("PAPERDROPL diagnostics passed.");
