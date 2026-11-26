import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { Server as SocketIOServer } from "socket.io";
import { config, ensureDirectories } from "./config.js";
import { initDatabase } from "./db/database.js";
import { seedInitialData } from "./db/seed.js";
import { getPublicAuctionState, startAuctionTicker, stopAuctionTicker } from "./engine/auctionEngine.js";
import adminRoutes from "./routes/admin.js";
import authRoutes from "./routes/auth.js";
import playerClaimRoutes from "./routes/playerClaim.js";
import publicRoutes from "./routes/public.js";
import teamRoutes from "./routes/team.js";
import { startBackupScheduler, stopBackupScheduler } from "./utils/backup.js";
import { verifyJwt } from "./utils/security.js";

export function createApp(options: { seedRealPlayers?: boolean; dbPath?: string; startBackgroundWorkers?: boolean } = {}) {
  const { seedRealPlayers = true, dbPath, startBackgroundWorkers = true } = options;

  ensureDirectories();
  const db = initDatabase(dbPath);
  seedInitialData(db, { seedRealPlayers });

  const app = express();
  const server = http.createServer(app);

  const allowedOrigins = config.clientOrigin.split(",").map((s) => s.trim()).filter(Boolean);
  const io = new SocketIOServer(server, {
    cors: {
      origin: config.nodeEnv === "production" ? true : allowedOrigins,
      credentials: true,
    },
  });

  app.set("io", io);
  app.set("trust proxy", 1);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );
  app.use(
    cors({
      origin: config.nodeEnv === "production" ? true : allowedOrigins,
      credentials: true,
    })
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many login or claim attempts. Please try again shortly." },
  });

  const bidLimiter = rateLimit({
    windowMs: 10 * 1000,
    max: 40,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Bidding rate limit exceeded. Slow down slightly." },
  });

  // Persistent uploaded images
  app.use("/uploads", express.static(config.uploadsDir));

  // API routes
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", app: "YKSG NB-3 PLAYER AUCTION", timestamp: new Date().toISOString() });
  });

  app.use("/api/auth", authLimiter, authRoutes);
  app.use("/api/public", publicRoutes);
  app.use("/api/player-claim", authLimiter, playerClaimRoutes);
  app.use("/api/team/bid", bidLimiter);
  app.use("/api/team", teamRoutes);
  app.use("/api/admin", adminRoutes);

  // Socket.IO connection & room binding
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token === "string" && token.length > 0) {
      try {
        const user = verifyJwt(token);
        socket.data.user = user;
      } catch {
        // Allow public spectators even if token expired
      }
    }
    next();
  });

  io.on("connection", (socket) => {
    const user = socket.data.user as
      | { userId: number; role: string; teamId?: number | null }
      | undefined;

    if (user) {
      socket.join(`user:${user.userId}`);
      socket.join(`role:${user.role}`);
      if (user.teamId) {
        socket.join(`team:${user.teamId}`);
      }
    }

    socket.emit("auction:state", getPublicAuctionState(db));
  });

  // Serve compiled React SPA in production
  const currentFilePath = fileURLToPath(import.meta.url);
  const publicDir = path.resolve(path.dirname(currentFilePath), "../public");
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/") || req.path.startsWith("/uploads/") || req.path.startsWith("/socket.io/")) {
        next();
        return;
      }
      res.sendFile(path.join(publicDir, "index.html"));
    });
  }

  // Multer & global error handler
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[server error]", err.message);
    res.status(400).json({ error: err.message || "Unexpected server error" });
  });

  if (startBackgroundWorkers) {
    startAuctionTicker(db, io);
    startBackupScheduler(db);
  }

  return { app, server, io, db };
}

export function startServer() {
  const { server } = createApp();
  server.listen(config.port, () => {
    console.log(`\n🏆 YKSG NB-3 Player Auction Server running on http://localhost:${config.port}`);
    console.log(`📁 Persistent Data Directory: ${config.dataDir}`);
    console.log(`🔐 Initial Admin Username: ${config.adminUsername}\n`);
  });

  const shutdown = () => {
    stopAuctionTicker();
    stopBackupScheduler();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  return server;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  startServer();
}
