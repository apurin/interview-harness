#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const repo = "apurin/interview-harness";
const version = process.argv[2];

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("Usage: node scripts/release.mjs X.Y.Z");
  process.exit(1);
}

const major = version.split(".")[0];
const tag = `v${version}`;
const scriptUrl = `https://cdn.jsdelivr.net/gh/${repo}@${major}/interview-harness.js`;
const assets = [
  "interview-harness.js",
  "skills/interview-harness/SKILL.md",
  "skills/interview-harness-min/SKILL.md"
];

function run(command, args) {
  console.log(`$ ${[command].concat(args).join(" ")}`);
  execFileSync(command, args, { stdio: "inherit" });
}

function render(sourcePath, targetPath) {
  writeFileSync(
    targetPath,
    readFileSync(sourcePath, "utf8")
      .replaceAll("%VERSION%", version)
      .replaceAll("%MAJOR%", major)
      .replaceAll("%SCRIPT_URL%", scriptUrl)
  );
}

console.log(`Preparing Interview Harness ${tag} on @${major}`);

writeFileSync(
  "interview-harness.js",
  readFileSync("interview-harness.js", "utf8")
    .replace(/const VERSION = "\d+\.\d+\.\d+";/, `const VERSION = "${version}";`)
);

render("templates/skills/interview-harness/SKILL.md", "skills/interview-harness/SKILL.md");
render("templates/skills/interview-harness-min/SKILL.md", "skills/interview-harness-min/SKILL.md");

run(process.execPath, ["--check", "interview-harness.js"]);
run("git", ["add", "-A"]);
run("git", ["commit", "-m", `Release ${tag}`]);
run("git", ["tag", tag]);
run("git", ["push", "origin", "HEAD:main"]);
run("git", ["push", "origin", tag]);

for (const alias of [major, "latest"]) {
  for (const asset of assets) {
    const url = `https://purge.jsdelivr.net/gh/${repo}@${alias}/${asset}`;
    console.log(`Purging ${url}`);
    await fetch(url);
  }
}

for (const alias of [tag, major, "latest"]) {
  for (const asset of assets) {
    const url = `https://cdn.jsdelivr.net/gh/${repo}@${alias}/${asset}`;
    console.log(`Fetching ${url}`);
    await fetch(url, { method: "HEAD" });
  }
}

console.log(`Released ${tag}.`);
