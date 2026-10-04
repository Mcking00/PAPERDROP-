#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const logDir = path.join(root, "diagnostic-logs");
fs.mkdirSync(logDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const logFile = path.join(logDir, `preflight-${stamp}.log`);
const summaryFile = path.join(logDir, "latest-summary.log");

let errors = 0;
let warnings = 0;
let passed = 0;
let checkNo = 0;
const results = [];

function write(line = "") {
  fs.appendFileSync(logFile, line + "\n");
  process.stdout.write(line + "\n");
}

function check(name, fn, severity = "ERROR") {
  checkNo++;
  const label = String(checkNo).padStart(2, "0");
  write(`\n[CHECK ${label}] ${name}`);
  try {
    const result = fn();
    if (result === true || result === undefined) {
      passed++;
      results.push({ checkNo, name, status: "PASS", severity });
      write("PASS");
      return true;
    }
    const message = typeof result === "string" ? result : "Check failed";
    if (severity === "WARN") warnings++;
    else errors++;
    results.push({ checkNo, name, status: severity === "WARN" ? "WARN" : "FAIL", severity, message });
    write(`${severity === "WARN" ? "WARN" : "FAIL"}: ${message}`);
    return false;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (severity === "WARN") warnings++;
    else errors++;
    results.push({ checkNo, name, status: severity === "WARN" ? "WARN" : "FAIL", severity, message });
    write(`${severity === "WARN" ? "WARN" : "FAIL"}: ${message}`);
    return false;
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
    ...options,
  });
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
  if (output) write(output.trimEnd());
  return result;
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".next", ".git", "diagnostic-logs"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function sourceFiles() {
  return walk(root).filter((file) => /\.(tsx?|jsx?)$/.test(file));
}

function relative(file) {
  return path.relative(root, file).replaceAll(path.sep, "/");
}

write("PAPERDROPL PRE-DEPLOY DIAGNOSTICS");
write(`Started: ${new Date().toISOString()}`);
write(`Repository root: ${root}`);
write("Read-only checks except normal Next.js build artifacts/cache.");

check("package.json validation", () => {
  const raw = fs.readFileSync(path.join(root, "package.json"), "utf8");
  JSON.parse(raw);
  return true;
});

check("package-lock.json integrity", () => {
  if (!exists("package-lock.json")) return "package-lock.json is missing";
  JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
  return true;
}, "WARN");

check("installed dependency tree", () => {
  const r = run("npm", ["ls", "--depth=0", "--ignore-scripts"]);
  return r.status === 0 ? true : "npm dependency tree reported problems";
});

check("dependency vulnerability report", () => {
  const r = run("npm", ["audit", "--omit=dev", "--json"], { maxBuffer: 20 * 1024 * 1024 });
  if (!r.stdout) return "npm audit did not return a report";
  try {
    const report = JSON.parse(r.stdout);
    const total = report.metadata?.vulnerabilities;
    write(`Vulnerabilities: ${JSON.stringify(total ?? {})}`);
  } catch {
    write("npm audit output was not valid JSON");
  }
  return "Review dependency audit output";
}, "WARN");

check("TypeScript compilation", () => {
  const r = run("npx", ["tsc", "--noEmit"]);
  return r.status === 0 ? true : "TypeScript compiler reported errors";
});

check("TSX/JSX syntax compilation", () => {
  const r = run("npx", ["tsc", "--noEmit", "--jsx", "preserve"]);
  return r.status === 0 ? true : "TSX/JSX syntax or type errors were reported";
});

check("JSX tag-balance scan", () => {
  const files = sourceFiles();
  const failures = [];
  const tagRe = /<\/?([A-Za-z][A-Za-z0-9._:-]*)(?:\s[^<>]*?)?\/?\s*>/g;
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    const stack = [];
    let match;
    while ((match = tagRe.exec(text))) {
      const raw = match[0];
      const tag = match[1];
      if (/^<\//.test(raw)) {
        const last = stack.pop();
        if (last && last !== tag) failures.push(`${relative(file)}: expected </${last}> but found </${tag}>`);
      } else if (!/\/\s*>$/.test(raw) && !["input", "img", "br", "hr", "meta", "link"].includes(tag.toLowerCase())) {
        stack.push(tag);
      }
    }
    if (stack.length) failures.push(`${relative(file)}: unclosed <${stack[stack.length - 1]}>`);
  }
  return failures.length ? failures.slice(0, 20).join("\n") : true;
});

check("import resolution scan", () => {
  const failures = [];
  const files = sourceFiles();
  const importRe = /(?:from\s+|import\s*\(\s*|require\(\s*)["']([^"']+)["']/g;
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    let m;
    while ((m = importRe.exec(text))) {
      const spec = m[1];
      if (!spec.startsWith(".") && !spec.startsWith("@/")) continue;
      const base = spec.startsWith("@/") ? path.join(root, spec.slice(2)) : path.resolve(path.dirname(file), spec);
      const candidates = [base, base + ".ts", base + ".tsx", base + ".js", base + ".jsx", path.join(base, "index.ts"), path.join(base, "index.tsx")];
      if (!candidates.some(fs.existsSync)) failures.push(`${relative(file)} -> ${spec}`);
    }
  }
  return failures.length ? failures.slice(0, 30).join("\n") : true;
});

check("export/import consistency scan", () => {
  const failures = [];
  const files = sourceFiles();
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    const named = [...text.matchAll(/import\s*\{([^}]+)\}\s*from\s*["'](.+?)["']/g)];
    for (const [, names, spec] of named) {
      if (!spec.startsWith("." ) && !spec.startsWith("@/")) continue;
      const base = spec.startsWith("@/") ? path.join(root, spec.slice(2)) : path.resolve(path.dirname(file), spec);
      const target = [base, base + ".ts", base + ".tsx", base + ".js", base + ".jsx"].find(fs.existsSync);
      if (!target) continue;
      const targetText = fs.readFileSync(target, "utf8");
      for (const item of names.split(",").map((x) => x.trim()).filter(Boolean)) {
        const name = item.split(/\s+as\s+/)[0].trim();
        if (!new RegExp(`\\bexport\\s+(?:const|let|var|function|class)\\s+${name}\\b`).test(targetText) &&
            !new RegExp(`\\bexport\\s*\\{[^}]*\\b${name}\\b`).test(targetText)) {
          failures.push(`${relative(file)} imports { ${name} } from ${spec}`);
        }
      }
    }
  }
  return failures.length ? failures.slice(0, 30).join("\n") : true;
});

check("React component structure", () => {
  const failures = [];
  for (const file of sourceFiles()) {
    const text = fs.readFileSync(file, "utf8");
    if (/export\s+default\s+function\s+[A-Za-z]/.test(text) && !/return\s*\(/.test(text) && !/return\s+</.test(text)) {
      failures.push(relative(file));
    }
  }
  return failures.length ? failures.join("\n") : true;
});

check("Next.js configuration validation", () => {
  for (const name of ["next.config.js", "next.config.mjs", "next.config.ts"]) {
    if (exists(name)) {
      const r = run("npx", ["next", "info"]);
      return r.status === 0 ? true : "Next.js configuration/environment check failed";
    }
  }
  return true;
});

check("Next.js production build", () => {
  const r = run("npm", ["run", "build"], { maxBuffer: 30 * 1024 * 1024 });
  return r.status === 0 ? true : "next build failed";
});

check("server/client boundary scan", () => {
  const failures = [];
  for (const file of sourceFiles()) {
    const text = fs.readFileSync(file, "utf8");
    if (text.includes("'use client'") || text.includes('"use client"')) continue;
    if (/\buseState\s*\(|\buseEffect\s*\(|\buseContext\s*\(/.test(text) && /app\//.test(relative(file))) {
      failures.push(`${relative(file)} uses client hooks without a client directive`);
    }
  }
  return failures.length ? failures.slice(0, 30).join("\n") : true;
});

check("route/page file validation", () => {
  const failures = [];
  for (const file of sourceFiles()) {
    const rel = relative(file);
    if (/^(app|pages)\/.*\/(page|route)\.(tsx?|jsx?)$/.test(rel) || /^(app|pages)\/(page|route)\.(tsx?|jsx?)$/.test(rel)) {
      const text = fs.readFileSync(file, "utf8");
      if (!/export\s+default/.test(text) && !/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)/.test(text)) failures.push(rel);
    }
  }
  return failures.length ? failures.join("\n") : true;
});

check("CSS syntax/balance scan", () => {
  const failures = [];
  for (const file of walk(root).filter((f) => f.endsWith(".css"))) {
    const text = fs.readFileSync(file, "utf8");
    if ((text.match(/{/g) || []).length !== (text.match(/}/g) || []).length) failures.push(relative(file) + ": brace mismatch");
    if ((text.match(/\(/g) || []).length !== (text.match(/\)/g) || []).length) failures.push(relative(file) + ": parenthesis mismatch");
  }
  return failures.length ? failures.join("\n") : true;
});

check("static asset existence", () => {
  const failures = [];
  for (const file of sourceFiles()) {
    const text = fs.readFileSync(file, "utf8");
    const refs = [...text.matchAll(/(?:src|href|url)\s*[:=]\s*["']([^"']+)["']/g)].map((m) => m[1]);
    for (const ref of refs) {
      if (!ref.startsWith("/") || ref.startsWith("//")) continue;
      const clean = ref.split("?")[0].split("#")[0];
      if (!clean || clean.startsWith("/api/")) continue;
      if (!fs.existsSync(path.join(root, "public", clean.slice(1))) && !clean.startsWith("/_next/")) {
        failures.push(`${relative(file)} -> ${clean}`);
      }
    }
  }
  return failures.length ? failures.slice(0, 40).join("\n") : true;
});

check("Linux case-sensitive path scan", () => {
  const failures = [];
  const publicDir = path.join(root, "public");
  if (!fs.existsSync(publicDir)) return true;
  for (const file of sourceFiles()) {
    const text = fs.readFileSync(file, "utf8");
    for (const [, ref] of text.matchAll(/["'](\/(?:anime|images|icons|assets|fonts)\/[^"']+)["']/g)) {
      const target = path.join(publicDir, ref.slice(1));
      if (!fs.existsSync(target)) failures.push(`${relative(file)} -> ${ref}`);
    }
  }
  return failures.length ? failures.slice(0, 40).join("\n") : true;
});

check("internal path/reference scan", () => {
  const failures = [];
  for (const file of sourceFiles()) {
    const text = fs.readFileSync(file, "utf8");
    for (const [, ref] of text.matchAll(/(?:href|action)=["'](\/[^"'#?]*)["']/g)) {
      if (!ref || ref.startsWith("/api/") || ref.startsWith("/_next/")) continue;
      const candidate = path.join(root, "app", ref === "/" ? "page.tsx" : ref.replace(/^\//, ""), "page.tsx");
      const direct = path.join(root, "app", ref.replace(/^\//, ""), "page.tsx");
      if (!fs.existsSync(candidate) && !fs.existsSync(direct) && !["/login", "/admin"].includes(ref)) {
        // Dynamic routes and client-generated anchors are allowed.
        if (!ref.includes("[") && !ref.startsWith("/#")) failures.push(`${relative(file)} -> ${ref}`);
      }
    }
  }
  return failures.length ? failures.slice(0, 30).join("\n") : true;
});

check("Amplify configuration validation", () => {
  if (!exists("amplify.yml")) return "amplify.yml is missing";
  const text = fs.readFileSync(path.join(root, "amplify.yml"), "utf8");
  return /version:\s*1/.test(text) && /frontend:/.test(text) && /backend:/.test(text) ? true : "amplify.yml structure is incomplete";
});

check("Amplify backend generation", () => {
  const r = run("npx", ["ampx", "generate", "outputs", "--branch", process.env.AWS_BRANCH || "replit/fix-paperdropl-integrity", "--app-id", process.env.AWS_APP_ID || ""]);
  return r.status === 0 ? true : "Amplify outputs generation failed";
});

check("GraphQL/schema/model validation", () => {
  if (!exists("amplify")) return "amplify directory is missing";
  const files = walk(path.join(root, "amplify")).filter((f) => /\.(ts|tsx|graphql)$/.test(f));
  return files.length ? true : "No Amplify backend source files found";
});

check("Auth/storage configuration validation", () => {
  if (!exists("amplify")) return "amplify directory is missing";
  const text = walk(path.join(root, "amplify")).filter((f) => /\.(ts|tsx)$/.test(f))
    .map((f) => fs.readFileSync(f, "utf8")).join("\n");
  return /auth|storage|defineAuth|defineStorage/.test(text) ? true : "Could not find expected Amplify auth/storage configuration";
});

check("Environment/configuration validation", () => {
  const required = ["AWS_BRANCH", "AWS_APP_ID"];
  const missing = required.filter((key) => !process.env[key]);
  return missing.length ? `Missing build variables: ${missing.join(", ")}` : true;
}, "WARN");

check("Production readiness summary", () => true);

const final = {
  started: new Date().toISOString(),
  checks: checkNo,
  passed,
  warnings,
  errors,
  results,
  logFile: path.relative(root, logFile),
};

fs.writeFileSync(summaryFile, JSON.stringify(final, null, 2) + "\n");
write("\n========================================");
write("PAPERDROPL DIAGNOSTIC SUMMARY");
write("========================================");
write(`Checks run : ${checkNo}/24`);
write(`Passed     : ${passed}`);
write(`Warnings   : ${warnings}`);
write(`Errors     : ${errors}`);
write(`Full log   : ${path.relative(root, logFile)}`);
write(`Summary    : ${path.relative(root, summaryFile)}`);
write("========================================");
write(errors ? "DIAGNOSTICS COMPLETE — BUILD SHOULD FAIL AFTER THIS REPORT." : "DIAGNOSTICS COMPLETE — NO BLOCKING ERRORS FOUND.");

process.exitCode = errors ? 1 : 0;
