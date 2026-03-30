import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const sourcesDir = path.join(root, "_sources");
const configPath = path.join(root, "theme-sources.json");

const configs = JSON.parse(fs.readFileSync(configPath, "utf8"));

fs.mkdirSync(sourcesDir, { recursive: true });

for (const cfg of configs) {
  const targetDir = path.join(sourcesDir, cfg.sourceDirName);

  fs.rmSync(targetDir, { recursive: true, force: true });

  const args = [
    "clone",
    "--depth",
    "1",
    "--branch",
    cfg.branch,
    `https://github.com/${cfg.repo}.git`,
    targetDir
  ];

  console.log(`Cloning ${cfg.repo}#${cfg.branch} -> ${targetDir}`);
  execFileSync("git", args, { stdio: "inherit" });
}
