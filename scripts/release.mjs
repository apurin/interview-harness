#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const repo = "apurin/interview-harness";
const version = process.argv[2];

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("Usage: node scripts/release.mjs X.Y.Z");
  process.exit(1);
}

const tag = `v${version}`;
const scriptUrl = `https://cdn.jsdelivr.net/gh/${repo}@${tag}/interview-harness.js`;
const latestSkillUrl = `https://cdn.jsdelivr.net/gh/${repo}@latest/skills/interview-harness/SKILL.md`;
const skillAssets = [
  "skills/interview-harness/SKILL.md",
  "skills/interview-harness-min/SKILL.md"
];
const releaseAssets = ["interview-harness.js", ...skillAssets];

function run(command, args) {
  console.log(`$ ${[command].concat(args).join(" ")}`);
  execFileSync(command, args, { stdio: "inherit" });
}

function read(command, args) {
  return execFileSync(command, args, { encoding: "utf8" }).trim();
}

async function fetchChecked(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`${options?.method || "GET"} ${url} returned ${response.status}`);
  }
  return response;
}

function render(sourcePath, targetPath) {
  writeFileSync(
    targetPath,
    readFileSync(sourcePath, "utf8")
      .replaceAll("%VERSION%", version)
      .replaceAll("%SCRIPT_URL%", scriptUrl)
  );
}

function authoringReference(content) {
  const start = content.indexOf("## Authoring API");
  const guidance = content.indexOf("\n\nBefore presenting", start);
  return content.slice(start, guidance === -1 ? undefined : guidance).trim();
}

const fullSkillTemplate = readFileSync("templates/skills/interview-harness/SKILL.md", "utf8");
const minimalSkillTemplate = readFileSync("templates/skills/interview-harness-min/SKILL.md", "utf8");
if (authoringReference(fullSkillTemplate) !== authoringReference(minimalSkillTemplate)) {
  throw new Error("Minimal and full skill authoring references differ");
}

const readme = readFileSync("README.md", "utf8");
if (!readme.includes(latestSkillUrl)) {
  throw new Error(`README must link to the latest skill at ${latestSkillUrl}`);
}
if (/https:\/\/cdn\.jsdelivr\.net\/gh\/apurin\/interview-harness@[^/]+\/interview-harness\.js/.test(readme)) {
  throw new Error("README must direct users through the skill instead of the runtime library");
}

if (read("git", ["status", "--porcelain", "--untracked-files=no"])) {
  throw new Error("Commit tracked working-tree changes before releasing");
}

if (read("git", ["branch", "--show-current"]) !== "main") {
  throw new Error("Releases must be run from main");
}

if (read("git", ["tag", "--list", tag])) {
  throw new Error(`${tag} already exists`);
}

console.log(`Preparing Interview Harness ${tag} with ${scriptUrl}`);

writeFileSync(
  "interview-harness.js",
  readFileSync("interview-harness.js", "utf8")
    .replace(/const VERSION = "\d+\.\d+\.\d+";/, `const VERSION = "${version}";`)
);

render("templates/skills/interview-harness/SKILL.md", "skills/interview-harness/SKILL.md");
render("templates/skills/interview-harness-min/SKILL.md", "skills/interview-harness-min/SKILL.md");

for (const asset of skillAssets) {
  if (!readFileSync(asset, "utf8").includes(scriptUrl)) {
    throw new Error(`${asset} does not reference the exact release runtime ${scriptUrl}`);
  }
}

run(process.execPath, ["--check", "interview-harness.js"]);
run("git", ["add", "--", ...releaseAssets]);
run("git", ["commit", "--allow-empty", "-m", `Release ${tag}`]);
run("git", ["tag", tag]);
run("git", ["push", "origin", "HEAD:main"]);
run("git", ["push", "origin", tag]);

for (const asset of skillAssets) {
  const url = `https://purge.jsdelivr.net/gh/${repo}@latest/${asset}`;
  console.log(`Purging ${url}`);
  await fetchChecked(url);
}

console.log(`Verifying ${scriptUrl}`);
const publishedScript = await (await fetchChecked(scriptUrl)).text();
if (!publishedScript.includes(`const VERSION = "${version}";`)) {
  throw new Error(`${scriptUrl} does not contain Interview Harness ${version}`);
}

for (const asset of skillAssets) {
  const url = `https://cdn.jsdelivr.net/gh/${repo}@latest/${asset}`;
  console.log(`Verifying ${url}`);
  const publishedSkill = await (await fetchChecked(url)).text();
  if (!publishedSkill.includes(scriptUrl)) {
    throw new Error(`${url} does not reference the exact release runtime ${scriptUrl}`);
  }
}

console.log(`Released ${tag}.`);
