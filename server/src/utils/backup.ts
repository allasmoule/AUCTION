import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { config } from "../config.js";

let backupTimer: NodeJS.Timeout | null = null;

export async function createDatabaseBackup(db: Database.Database, label = "auto"): Promise<{ filename: string; path: string; size: number }> {
  fs.mkdirSync(config.backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeLabel = label.replace(/[^a-zA-Z0-9_-]/g, "");
  const filename = `auction-${safeLabel}-${stamp}.db`;
  const targetPath = path.join(config.backupsDir, filename);

  await db.backup(targetPath);

  // Prune old backups beyond retention limit
  const files = fs
    .readdirSync(config.backupsDir)
    .filter((f) => f.endsWith(".db"))
    .map((f) => ({
      name: f,
      fullPath: path.join(config.backupsDir, f),
      mtime: fs.statSync(path.join(config.backupsDir, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);

  if (files.length > config.backupRetentionCount) {
    for (const old of files.slice(config.backupRetentionCount)) {
      try {
        fs.unlinkSync(old.fullPath);
      } catch {
        // ignore cleanup errors
      }
    }
  }

  const stat = fs.statSync(targetPath);
  return { filename, path: targetPath, size: stat.size };
}

export function listBackups(): Array<{ filename: string; size: number; createdAt: string }> {
  if (!fs.existsSync(config.backupsDir)) return [];
  return fs
    .readdirSync(config.backupsDir)
    .filter((f) => f.endsWith(".db"))
    .map((f) => {
      const stat = fs.statSync(path.join(config.backupsDir, f));
      return {
        filename: f,
        size: stat.size,
        createdAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function startBackupScheduler(db: Database.Database): void {
  if (backupTimer) clearInterval(backupTimer);
  const intervalMs = config.backupIntervalMinutes * 60 * 1000;
  backupTimer = setInterval(() => {
    createDatabaseBackup(db, "auto").catch((err) => {
      console.error("[backup] scheduled backup failed:", err);
    });
  }, intervalMs);
}

export function stopBackupScheduler(): void {
  if (backupTimer) {
    clearInterval(backupTimer);
    backupTimer = null;
  }
}
