#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const REPO = "apurin/interview-harness";
const ROOT_FILES = [
  "AGENTS.md",
  "README.md",
  "interview-harness.js",
  "scripts/release.mjs",
  "skills/interview-harness/SKILL.md",
  "skills/interview-harness-min/SKILL.md",
  "templates/skills/interview-harness/SKILL.md",
  "templates/skills/interview-harness-min/SKILL.md"
];

const version = process.argv[2];

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("Usage: node scripts/release.mjs X.Y.Z");
  process.exit(1);
}

const major = version.split(".")[0];
const tag = `v${version}`;
const replacements = {
  "%VERSION%": version,
  "%MAJOR%": major,
  "%SCRIPT_URL%": `https://cdn.jsdelivr.net/gh/${REPO}@${major}/interview-harness.js`,
  "%SKILL_URL%": `https://cdn.jsdelivr.net/gh/${REPO}@${major}/skills/interview-harness/SKILL.md`,
  "%MIN_SKILL_URL%": `https://cdn.jsdelivr.net/gh/${REPO}@${major}/skills/interview-harness-min/SKILL.md`
};

function read(path) {
  return readFileSync(path, "utf8");
}

function write(path, content) {
  writeFileSync(path, content);
}

function git(args, options = {}) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: options.stdio || ["ignore", "pipe", "pipe"]
  });
}

function run(command, args) {
  console.log(`$ ${[command].concat(args).join(" ")}`);
  execFileSync(command, args, { stdio: "inherit" });
}

function renderTemplate(sourcePath, targetPath) {
  let content = read(sourcePath);
  for (const [key, value] of Object.entries(replacements)) {
    content = content.split(key).join(value);
  }
  write(targetPath, content);
}

function updateDocs(path) {
  const content = read(path)
    .replace(/interview-harness@v\d+\.\d+\.\d+(?=\/)/g, `interview-harness@${tag}`)
    .replace(/interview-harness@\d+(?=\/)/g, `interview-harness@${major}`)
    .replace(/node scripts\/release\.mjs \d+\.\d+\.\d+/g, `node scripts/release.mjs ${version}`)
    .replace(/such as `@\d+`/g, `such as \`@${major}\``)
    .replace(/such as `v\d+\.\d+\.\d+`/g, `such as \`${tag}\``);
  write(path, content);
}

function ensureNoPlaceholders(path) {
  const content = read(path);
  const placeholders = Object.keys(replacements).filter((key) => content.includes(key));
  if (placeholders.length) {
    throw new Error(`${path} still contains ${placeholders.join(", ")}`);
  }
}

function tagExists() {
  return git(["tag", "--list", tag]).trim() === tag;
}

function hasStagedChanges() {
  try {
    git(["diff", "--cached", "--quiet"]);
    return false;
  } catch {
    return true;
  }
}

async function touchJsDelivr(path) {
  const purgeUrl = `https://purge.jsdelivr.net/gh/${REPO}${path}`;
  const cdnUrl = `https://cdn.jsdelivr.net/gh/${REPO}${path}`;
  console.log(`Purging ${purgeUrl}`);
  const purge = await fetch(purgeUrl);
  if (!purge.ok) throw new Error(`Purge failed ${purge.status}: ${purgeUrl}`);
  console.log(`Fetching ${cdnUrl}`);
  const response = await fetch(cdnUrl, { method: "HEAD" });
  if (!response.ok) throw new Error(`Fetch failed ${response.status}: ${cdnUrl}`);
}

console.log(`Preparing Interview Harness ${tag} on @${major}`);

write(
  "interview-harness.js",
  read("interview-harness.js").replace(/const VERSION = "\d+\.\d+\.\d+";/, `const VERSION = "${version}";`)
);

renderTemplate("templates/skills/interview-harness/SKILL.md", "skills/interview-harness/SKILL.md");
renderTemplate("templates/skills/interview-harness-min/SKILL.md", "skills/interview-harness-min/SKILL.md");
updateDocs("README.md");
updateDocs("AGENTS.md");

for (const path of [
  "README.md",
  "AGENTS.md",
  "skills/interview-harness/SKILL.md",
  "skills/interview-harness-min/SKILL.md"
]) {
  ensureNoPlaceholders(path);
}

run(process.execPath, ["--check", "interview-harness.js"]);
run("git", ["add", ...ROOT_FILES]);

if (hasStagedChanges()) {
  run("git", ["commit", "-m", `Release ${tag}`]);
} else {
  console.log("No release file changes to commit.");
}

if (tagExists()) {
  console.log(`${tag} already exists.`);
} else {
  run("git", ["tag", tag]);
}

run("git", ["push", "origin", "HEAD:main"]);
run("git", ["push", "origin", tag]);

for (const versionAlias of [tag, major, "latest"]) {
  for (const asset of [
    "interview-harness.js",
    "skills/interview-harness/SKILL.md",
    "skills/interview-harness-min/SKILL.md"
  ]) {
    await touchJsDelivr(`@${versionAlias}/${asset}`);
  }
}

console.log(`Released ${tag}.`);
