import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const configPath = path.join(root, "theme-sources.json");
const outThemesDir = path.join(root, "themes");
const sigmaBaseDir = path.join(root, "sigma-main");
const sourcesDir = path.join(root, "_sources");

const configs = JSON.parse(fs.readFileSync(configPath, "utf8"));

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function resetDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function clearChildren(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    return;
  }

  for (const entry of fs.readdirSync(dir)) {
    fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
  }
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

function rewriteCss(cssText, cfg) {
  let out = cssText.replace(/\r\n/g, "\n");

  // Strip remote Google Fonts imports so offline mode does not depend on them.
  out = out.replace(
    /@import\s+url\((['"])https:\/\/fonts\.googleapis\.com\/[^)]+\);\s*/gi,
    ""
  );

  // Rewrite SCP Wiki hotlinked theme assets to local filenames when present.
  out = out.replace(
    /url\((['"]?)https:\/\/scp-wiki\.wikidot\.com\/local--files\/theme:[^)\/]+\/([^)'"?#]+)\1\)/gi,
    "url($1./$2$1)"
  );

  if (cfg.role === "base") {
    // Sigma base assets
    out = out
      .replace(/url\((['"]?)(?:\.\/)?dist\/fonts\//gi, "url($1./fonts/")
      .replace(/url\((['"]?)(?:\.\/)?fonts\//gi, "url($1./fonts/")
      .replace(/url\((['"]?)(?:\.\/)?dist\/images\//gi, "url($1./images/")
      .replace(/url\((['"]?)(?:\.\/)?images\//gi, "url($1./images/");
  } else {
    // Overlay theme assets
    out = out
      .replace(/url\((['"]?)(?:\.\/)?dist\/fonts\//gi, "url($1./fonts/")
      .replace(/url\((['"]?)(?:\.\/)?fonts\//gi, "url($1./fonts/")
      .replace(/url\((['"]?)(?:\.\/)?dist\/img\//gi, "url($1./img/")
      .replace(/url\((['"]?)(?:\.\/)?img\//gi, "url($1./img/")
      .replace(/url\((['"]?)(?:\.\/)?dist\/images\//gi, "url($1./images/")
      .replace(/url\((['"]?)(?:\.\/)?images\//gi, "url($1./images/")
      .replace(/url\((['"]?)(?:\.\/)?dist\/misc\//gi, "url($1./misc/")
      .replace(/url\((['"]?)(?:\.\/)?misc\//gi, "url($1./misc/");
  }

  return out;
}

function importBaseTheme(cfg) {
  const repoDir = path.join(sourcesDir, cfg.sourceDirName);
  const cssSrc = path.join(repoDir, cfg.build.css);

  if (!fs.existsSync(cssSrc)) {
    throw new Error(`Missing built CSS for ${cfg.id}: ${cssSrc}`);
  }

  ensureDir(sigmaBaseDir);

  fs.rmSync(path.join(sigmaBaseDir, "fonts"), { recursive: true, force: true });
  fs.rmSync(path.join(sigmaBaseDir, "images"), { recursive: true, force: true });

  const cssRaw = fs.readFileSync(cssSrc, "utf8");
  const cssOut = rewriteCss(cssRaw, cfg);
  fs.writeFileSync(path.join(sigmaBaseDir, "sigma.css"), cssOut, "utf8");

  for (const item of cfg.build.copy || []) {
    const abs = path.join(repoDir, item);
    if (!fs.existsSync(abs)) continue;

    const stat = fs.statSync(abs);
    const targetName = path.basename(abs);

    if (stat.isDirectory()) {
      copyDirRecursive(abs, path.join(sigmaBaseDir, targetName));
    } else if (stat.isFile()) {
      copyFileSafe(abs, path.join(sigmaBaseDir, targetName));
    }
  }

  console.log(`Imported base theme: ${cfg.id} -> sigma-main/`);
}

function importOverlayTheme(cfg, manifest) {
  const repoDir = path.join(sourcesDir, cfg.sourceDirName);
  const themeDir = path.join(outThemesDir, cfg.id);
  const cssSrc = path.join(repoDir, cfg.build.css);

  if (!fs.existsSync(cssSrc)) {
    throw new Error(`Missing built CSS for ${cfg.id}: ${cssSrc}`);
  }

  resetDir(themeDir);

  const cssRaw = fs.readFileSync(cssSrc, "utf8");
  const cssOut = rewriteCss(cssRaw, cfg);
  fs.writeFileSync(path.join(themeDir, "theme.css"), cssOut, "utf8");

  for (const item of cfg.build.copy || []) {
    const abs = path.join(repoDir, item);
    if (!fs.existsSync(abs)) continue;

    const stat = fs.statSync(abs);
    const targetName = path.basename(abs);

    if (stat.isDirectory()) {
      copyDirRecursive(abs, path.join(themeDir, targetName));
    } else if (stat.isFile()) {
      copyFileSafe(abs, path.join(themeDir, targetName));
    }
  }

  manifest.push({
    id: cfg.id,
    name: cfg.name,
    css: "theme.css",
    description: cfg.description,
    mode: "overlay"
  });

  console.log(`Imported overlay theme: ${cfg.id} -> themes/${cfg.id}/`);
}

ensureDir(outThemesDir);
clearChildren(outThemesDir);

const manifest = [];

for (const cfg of configs) {
  if (cfg.role === "base") {
    importBaseTheme(cfg);
  } else {
    importOverlayTheme(cfg, manifest);
  }
}

fs.writeFileSync(
  path.join(outThemesDir, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
  "utf8"
);

console.log(`Wrote themes/manifest.json with ${manifest.length} entries.`);
