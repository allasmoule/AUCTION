import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const rootDir = process.cwd();
const deployDir = path.join(rootDir, "hostinger-deploy");
const zipPath = path.join(rootDir, "yksg-nb3-hostinger-deploy.zip");

console.log("1. Building frontend and backend...");
execSync("npm run build", { stdio: "inherit", cwd: rootDir });

console.log("2. Preparing hostinger-deploy folder...");
fs.rmSync(deployDir, { recursive: true, force: true });
fs.rmSync(zipPath, { force: true });
fs.mkdirSync(path.join(deployDir, "server"), { recursive: true });

// Copy compiled backend & built frontend SPA
fs.cpSync(path.join(rootDir, "server", "dist"), path.join(deployDir, "server", "dist"), { recursive: true });
fs.cpSync(path.join(rootDir, "server", "public"), path.join(deployDir, "server", "public"), { recursive: true });
fs.copyFileSync(path.join(rootDir, "app.js"), path.join(deployDir, "app.js"));
fs.copyFileSync(path.join(rootDir, ".env.example"), path.join(deployDir, ".env.example"));
fs.copyFileSync(path.join(rootDir, "DEPLOYMENT.md"), path.join(deployDir, "DEPLOYMENT.md"));

// Include pre-initialized SQLite database & uploads if present (for direct folder upload)
const localDataDir = path.join(rootDir, "data");
if (fs.existsSync(localDataDir)) {
  const destDataDir = path.join(deployDir, "data");
  fs.mkdirSync(destDataDir, { recursive: true });
  for (const sub of ["uploads", "backups"]) {
    const srcSub = path.join(localDataDir, sub);
    if (fs.existsSync(srcSub)) {
      fs.cpSync(srcSub, path.join(destDataDir, sub), { recursive: true });
    }
  }
  const dbFile = path.join(localDataDir, "auction.db");
  if (fs.existsSync(dbFile)) {
    const srcDb = new Database(dbFile, { readonly: true });
    await srcDb.backup(path.join(destDataDir, "auction.db"));
    srcDb.close();
  }
}

// Read server dependencies so Hostinger installs all runtime packages cleanly at root
const serverPkg = JSON.parse(fs.readFileSync(path.join(rootDir, "server", "package.json"), "utf-8"));
const deployPkg = {
  name: "yksg-nb3-player-auction",
  version: "1.0.0",
  private: true,
  type: "module",
  main: "app.js",
  engines: {
    node: ">=20.0.0",
  },
  scripts: {
    start: "node app.js",
  },
  dependencies: serverPkg.dependencies,
};
fs.writeFileSync(path.join(deployDir, "package.json"), JSON.stringify(deployPkg, null, 2) + "\n");

const quickGuide = `YKSG NB-3 PLAYER AUCTION - HOSTINGER DEPLOYMENT STEPS
======================================================

1. Upload and extract this ZIP into your Hostinger Node.js app folder (or upload via Hostinger Node.js Web App ZIP deploy).
2. In Hostinger hPanel -> Node.js settings:
   - Node.js Version: 20.x or 22.x
   - Application Startup / Entry File: app.js
   - Start Command: npm start
   - Build / Install: Hostinger runs "npm install" automatically for package.json
3. Add Environment Variables in Hostinger hPanel (see .env.example):
   - NODE_ENV=production
   - PORT=4000 (or leave to Hostinger's assigned PORT)
   - JWT_SECRET=<long-random-secret-key>
   - ADMIN_USERNAME=admin
   - ADMIN_PASSWORD=<your-strong-admin-password>
   - DATA_DIR=/home/<your-hostinger-username>/yksg-nb3-data
4. Save & Restart the Node.js application.
`;
fs.writeFileSync(path.join(deployDir, "HOSTINGER_README.txt"), quickGuide);

console.log("3. Creating ZIP archive...");
if (process.platform === "win32") {
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${deployDir}\\*' -DestinationPath '${zipPath}' -Force"`,
    { stdio: "inherit" }
  );
} else {
  execSync(`cd "${deployDir}" && zip -r "${zipPath}" .`, { stdio: "inherit" });
}

const stat = fs.statSync(zipPath);
console.log(`\n✅ Created deployable package: ${zipPath} (${(stat.size / 1024).toFixed(1)} KB)`);
