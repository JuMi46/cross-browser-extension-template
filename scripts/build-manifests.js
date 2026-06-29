const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

// Fill these out
const haveEnvVars = false; // Set to true if you want to use environment variables in your build
const requiredEnvVars = [];
const extensionName = "";

const rootDir = path.resolve(__dirname, "..");
const sourceExtensionDir = path.join(rootDir, "extension");
const sourceManifestPath = path.join(sourceExtensionDir, "manifest.json");
const distDir = path.join(rootDir, "dist");
const sharedFiles = getAllFiles(sourceExtensionDir, null, ["manifest.json"]);
const envPath = path.join(rootDir, ".env");

function loadBuildConfig() {
  const config = {};

  if (!fs.existsSync(envPath)) {
    throw new Error(`Missing .env file. Create one with the required variables: ${requiredEnvVars.join(", ")}`);
  }

  const envRaw = fs.readFileSync(envPath, "utf8");
  const lines = envRaw.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['\"]|['\"]$/g, "");

    if (value) {
      config[key] = value;
    }
  }

  for (const varName of requiredEnvVars) {
    if (!config[varName]) {
      throw new Error(`${varName} is required in .env and cannot be empty.`);
    }
  }

  return config;
}

function injectEnvs(text) {
  if (haveEnvVars) {
    for (const [key, value] of Object.entries(buildConfig)) {
      const placeholder = `__${key}__`;
      text = text.replace(new RegExp(placeholder, "g"), value);
    }
  }
  return text;
}

function readSourceManifest() {
  const manifest = injectEnvs(fs.readFileSync(sourceManifestPath, "utf8"));
  return JSON.parse(manifest);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function copySharedFiles(targetDir, buildConfig) {
  for (const sourcePath of sharedFiles) {
    const targetPath = path.join(targetDir, path.basename(sourcePath));

    if (haveEnvVars) {
      let fileContent = injectEnvs(fs.readFileSync(sourcePath, "utf8"));
      fs.writeFileSync(targetPath, fileContent, "utf8");
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function getAllFiles(dir, endsWith, excludeFiles) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...getAllFiles(entryPath, endsWith, excludeFiles));
      continue;
    }
  
    if (entry.isFile() 
      && (!endsWith || entry.name.endsWith(endsWith))
      && (!excludeFiles || !excludeFiles.some((exclude) => entry.name.endsWith(exclude)))) 
    {
      files.push(entryPath);
    }
  }

  return files;
}

function rewriteApisForChrome(targetDir) {
  const jsFiles = getAllFiles(targetDir, ".js");

  for (const filePath of jsFiles) {
    const raw = fs.readFileSync(filePath, "utf8");
    const rewritten = raw.replace(/\bbrowser\./g, "chrome.");
    fs.writeFileSync(filePath, rewritten, "utf8");
  }
}

function buildChrome(sourceManifest, buildConfig) {
  const chromeManifest = JSON.parse(JSON.stringify(sourceManifest));

  chromeManifest.background = {
    service_worker: "background.js",
  };

  delete chromeManifest.browser_specific_settings;

  const targetDir = path.join(distDir, "chrome");
  ensureDir(targetDir);
  copySharedFiles(targetDir, buildConfig);
  rewriteApisForChrome(targetDir);
  writeJson(path.join(targetDir, "manifest.json"), chromeManifest);
}

function buildFirefox(sourceManifest, buildConfig) {
  const firefoxManifest = JSON.parse(JSON.stringify(sourceManifest));

  const targetDir = path.join(distDir, "firefox");
  ensureDir(targetDir);
  copySharedFiles(targetDir, buildConfig);
  writeJson(path.join(targetDir, "manifest.json"), firefoxManifest);
}

function cleanDist() {
  fs.rmSync(distDir, { recursive: true, force: true });
  ensureDir(distDir);
}

function createArchiveFromDir(sourceDir, archivePath, archiveLabel) {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Cannot create ${archiveLabel} archive. Missing directory: ${sourceDir}`);
  }

  if (fs.existsSync(archivePath)) {
    fs.rmSync(archivePath, { force: true });
  }

  const archiveExt = path.extname(archivePath).toLowerCase();

  if (process.platform === "win32") {
    const tempArchivePath = archiveExt === ".zip" ? archivePath : `${archivePath}.zip`;
    const psCommand = `Compress-Archive -Path '${sourceDir.replace(/'/g, "''")}\\*' -DestinationPath '${tempArchivePath.replace(/'/g, "''")}' -Force`;
    const result = spawnSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", psCommand],
      { stdio: "inherit" }
    );

    if (result.status !== 0) {
      throw new Error(`Failed to create ${archiveLabel} archive with PowerShell.`);
    }

    if (tempArchivePath !== archivePath) {
      fs.renameSync(tempArchivePath, archivePath);
    }

    return;
  }

  const result = spawnSync("zip", ["-r", "-q", archivePath, "."], {
    cwd: sourceDir,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(`Failed to create ${archiveLabel} archive. Install "zip" or run build on Windows.`);
  }
}

function zipChromeBuild() {
  const chromeDir = path.join(distDir, "chrome");
  const zipPath = path.join(distDir, `${extensionName} chrome extension.zip`);

  createArchiveFromDir(chromeDir, zipPath, "Chrome");
}

function packageFirefoxBuild() {
  const firefoxDir = path.join(distDir, "firefox");
  const xpiPath = path.join(distDir, `${extensionName} firefox extension.xpi`);

  createArchiveFromDir(firefoxDir, xpiPath, "Firefox XPI");
}

function main() {
  const target = (process.argv[2] || "all").toLowerCase();
  const sourceManifest = readSourceManifest();
  const buildConfig = loadBuildConfig();

  cleanDist();

  if (target === "chrome") {
    buildChrome(sourceManifest, buildConfig);
    zipChromeBuild();
    return;
  }

  if (target === "firefox") {
    buildFirefox(sourceManifest, buildConfig);
    packageFirefoxBuild();
    return;
  }

  if (target === "all") {
    buildChrome(sourceManifest, buildConfig);
    buildFirefox(sourceManifest, buildConfig);
    zipChromeBuild();
    packageFirefoxBuild();
    return;
  }

  console.error('Invalid target. Use "chrome", "firefox", or "all".');
  process.exit(1);
}

main();
