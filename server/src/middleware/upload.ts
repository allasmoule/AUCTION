import crypto from "node:crypto";
import path from "node:path";
import multer from "multer";
import { config, ensureDirectories } from "../config.js";

const ALLOWED_MIMES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

function createImageUploader(destDir: () => string) {
  return multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        ensureDirectories();
        cb(null, destDir());
      },
      filename: (_req, file, cb) => {
        const ext = EXT_BY_MIME[file.mimetype] || path.extname(file.originalname).toLowerCase() || ".jpg";
        cb(null, `${crypto.randomUUID()}${ext}`);
      },
    }),
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB
    },
    fileFilter: (_req, file, cb) => {
      if (!ALLOWED_MIMES.has(file.mimetype)) {
        cb(new Error("Only JPEG, PNG, and WEBP image files are allowed (max 5MB)."));
        return;
      }
      cb(null, true);
    },
  });
}

export const uploadPlayerPhoto = createImageUploader(() => config.playerUploadsDir);
export const uploadTeamLogo = createImageUploader(() => config.teamUploadsDir);

export const uploadSpreadsheet = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});
