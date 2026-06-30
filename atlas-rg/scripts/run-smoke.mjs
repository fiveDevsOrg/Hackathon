import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const resultsPath = resolve(".smoke-results.json");
const command = process.platform === "win32" ? "npx.cmd" : "npx";
const args = ["vitest", "run", "tests/atlas.smoke.test.jsx", "--environment", "jsdom", "--reporter=json", `--outputFile=${resultsPath}`];
const result = spawnSync(command, args, {
  encoding: "utf8",
  shell: false,
});

const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
let parsed;
if (existsSync(resultsPath)) {
  try {
    parsed = JSON.parse(readFileSync(resultsPath, "utf8"));
  } catch {
    parsed = null;
  }
}

const suites = parsed?.testResults || [];
const assertions = suites.flatMap((suite) => suite.assertionResults || []);
const passed = assertions.filter((test) => test.status === "passed").map((test) => test.fullName || test.title);
const failed = assertions.filter((test) => test.status === "failed");
const failureMessages = failed.flatMap((test) => test.failureMessages || []).filter(Boolean);
const bugs = failureMessages.length ? failureMessages.map((message) => message.split("\n")[0]) : ["None"];
const statusResult = spawnSync("git", ["status", "--short"], {
  encoding: "utf8",
  shell: false,
});
const touchedFiles = statusResult.status === 0
  ? statusResult.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/^[ MADRCU?!]{1,2}\s+/, ""))
      .filter((file) => !file.startsWith("../"))
      .filter((file) => file !== ".smoke-results.json")
  : [];

const report = [
  "# Atlas Smoke Test Report",
  "",
  `Generated: ${new Date().toISOString()}`,
  "",
  "## Summary",
  "",
  `- Status: ${result.status === 0 ? "PASS" : "FAIL"}`,
  `- Passed tests: ${passed.length}`,
  `- Failed tests: ${failed.length}`,
  "",
  "## Passed Tests",
  "",
  ...(passed.length ? passed.map((test) => `- ${test}`) : ["- None"]),
  "",
  "## Failed Tests",
  "",
  ...(failed.length ? failed.map((test) => `- ${test.fullName || test.title}`) : ["- None"]),
  "",
  "## Bugs Found",
  "",
  ...bugs.map((bug) => `- ${bug}`),
  "",
  "## Files Touched",
  "",
  ...(touchedFiles.length ? touchedFiles.map((file) => `- ${file}`) : ["- None"]),
  "",
  "## Commands To Rerun",
  "",
  "```bash",
  "npm run smoke",
  "npm test",
  "```",
  "",
  "## Raw Output",
  "",
  "```text",
  output.trim() || "(no console output)",
  "```",
  "",
].join("\n");

writeFileSync("SMOKE_TEST_REPORT.md", report);
process.stdout.write(report);
process.exit(result.status ?? 1);
