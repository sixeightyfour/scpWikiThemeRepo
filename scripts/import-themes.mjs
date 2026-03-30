import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const configPath = path.join(root, "theme-sources.json");
const outDir = path.join(root, "themes");
const sourcesDir = path.join(root, "_sources");

const configs = JSON.parse(fs.readFileSync(configPath, "utf8"));

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function emptyDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function copyFileSafe(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDirRecursive(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return;
  ensureDir(destDir);

  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(src, dest);
    } else if (entry.isFile()) {
      copyFileSafe(src, dest);
    }
  }
}

function listFilesMatchingGlobLike(pattern) {
  // supports simple patterns like "dist/*.png"
  const dir = path.dirname(pattern);
  const base = path.basename(pattern);
  const starIdx = base.indexOf("*");

  if (starIdx === -1) {
    return fs.existsSync(pattern) ? [pattern] : [];
  }

  if (!fs.existsSync(dir)) return [];

  const prefix = base.slice(0, starIdx);
  const suffix = base.slice(starIdx + 1);

  return fs
    .readdirSync(dir)
    .filter((name) => name.startsWith(prefix) && name.endsWith(suffix))
    .map((name) => path.join(dir, name));
}

function rewriteCss(cssText) {
  return cssText
    .replace(/\r\n/g, "\n")
    // strip Google Fonts imports so offline mode doesn't hard depend on them
    .replace(/@import\s+url\((['"])https:\/\/fonts\.googleapis\.com\/[^)]+\);\s*/gi, "")
    // normalize quotes around url()
    .replace(/url\((['"]?)(\.\/)?dist\/fonts\//gi, "url($1./fonts/")
    .replace(/url\((['"]?)(\.\/)?fonts\//gi, "url($1./fonts/")
    .replace(/url\((['"]?)(\.\/)?dist\/img\//gi, "url($1./img/")
    .replace(/url\((['"]?)(\.\/)?img\//gi, "url($1./img/");
}

ensureDir(outDir);

const manifest = [];

for (const cfg of configs) {
  const repoDir = path.join(sourcesDir, cfg.sourceDirName);
  const themeDir = path.join(outDir, cfg.id);
  emptyDir(themeDir);

  const cssSrc = path.join(repoDir, cfg.build.css);
  if (!fs.existsSync(cssSrc)) {
    throw new Error(`Missing built CSS for ${cfg.id}: ${cssSrc}`);
  }

  const cssRaw = fs.readFileSync(cssSrc, "utf8");
  const cssOut = rewriteCss(cssRaw);
  fs.writeFileSync(path.join(themeDir, "theme.css"), cssOut, "utf8");

  for (const item of cfg.build.copy || []) {
    const abs = path.join(repoDir, item);

    if (item.includes("*")) {
      const matches = listFilesMatchingGlobLike(abs);
      for (const match of matches) {
        const dest = path.join(themeDir, path.basename(match));
        copyFileSafe(match, dest);
      }
      continue;
    }

    if (!fs.existsSync(abs)) continue;

    const stat = fs.statSync(abs);
    if (stat.isDirectory()) {
      copyDirRecursive(abs, path.join(themeDir, path.basename(abs)));
    } else if (stat.isFile()) {
      copyFileSafe(abs, path.join(themeDir, path.basename(abs)));
    }
  }

  manifest.push({
    id: cfg.id,
    name: cfg.name,
    css: "theme.css",
    description: cfg.description,
    mode: "overlay"
  });
}

fs.writeFileSync(
  path.join(outDir, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
  "utf8"
);

console.log(`Imported ${manifest.length} themes.`);
