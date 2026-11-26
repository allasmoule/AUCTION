import path from "node:path";
import fs from "node:fs";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), "../.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const rootDir = path.resolve(process.cwd(), fs.existsSync(path.resolve(process.cwd(), "server")) ? "." : "..");
const rawDataDir = process.env.DATA_DIR || path.join(rootDir, "data");
const dataDir = path.isAbsolute(rawDataDir) ? rawDataDir : path.resolve(rootDir, rawDataDir);

export const config = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 4000),
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  jwtSecret: process.env.JWT_SECRET || "yksg-nb3-dev-secret-change-in-production",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "12h",
  adminUsername: process.env.ADMIN_USERNAME || "admin",
  adminPassword: process.env.ADMIN_PASSWORD || "Admin@YKSGNB3!",
  adminDisplayName: process.env.ADMIN_DISPLAY_NAME || "YKSG NB-3 Super Admin",
  dataDir,
  dbPath: path.join(dataDir, "auction.db"),
  uploadsDir: path.join(dataDir, "uploads"),
  playerUploadsDir: path.join(dataDir, "uploads", "players"),
  teamUploadsDir: path.join(dataDir, "uploads", "teams"),
  backupsDir: path.join(dataDir, "backups"),
  backupIntervalMinutes: Math.max(5, Number(process.env.BACKUP_INTERVAL_MINUTES || 60)),
  backupRetentionCount: Math.max(3, Number(process.env.BACKUP_RETENTION_COUNT || 24)),
};

export function ensureDirectories(): void {
  for (const dir of [
    config.dataDir,
    config.uploadsDir,
    config.playerUploadsDir,
    config.teamUploadsDir,
    config.backupsDir,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
