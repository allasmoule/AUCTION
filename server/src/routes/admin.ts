import fs from "node:fs";
import path from "node:path";
import { parse as parseCsv } from "csv-parse/sync";
import { Router } from "express";
import PDFDocument from "pdfkit";
import * as XLSX from "xlsx";
import { z } from "zod";
import { config } from "../config.js";
import { closeDatabase, getDb, initDatabase } from "../db/database.js";
import {
  broadcastState,
  extendActiveTimer,
  finalizeActiveLot,
  pauseAuction,
  queuePlayerForAuction,
  refundAndReauctionPlayer,
  resumeAuction,
  startPlayerAuction,
} from "../engine/auctionEngine.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { uploadPlayerPhoto, uploadSpreadsheet, uploadTeamLogo } from "../middleware/upload.js";
import { createNotification, logActivity } from "../utils/audit.js";
import { createDatabaseBackup, listBackups } from "../utils/backup.js";
import { generateClaimCode, hashClaimCode, hashPassword, normalizePhone } from "../utils/security.js";

const router = Router();

router.use(requireAuth, requireRole("super_admin"));

function actorFromReq(req: Express.Request & { user?: { id: number; username: string; role: string }; ip?: string }) {
  return {
    id: req.user!.id,
    username: req.user!.username,
    role: req.user!.role,
    ipAddress: req.ip,
  };
}

// ---------------- OVERVIEW ----------------
router.get("/overview", (_req, res) => {
  const db = getDb();

  const stats = {
    totalTeams: (db.prepare("SELECT COUNT(*) AS c FROM teams").get() as { c: number }).c,
    totalPlayers: (db.prepare("SELECT COUNT(*) AS c FROM players").get() as { c: number }).c,
    claimedPlayers: (db.prepare("SELECT COUNT(*) AS c FROM players WHERE is_claimed = 1").get() as { c: number }).c,
    unclaimedPlayers: (db.prepare("SELECT COUNT(*) AS c FROM players WHERE is_claimed = 0").get() as { c: number }).c,
    totalAuctioned: (
      db.prepare("SELECT COUNT(*) AS c FROM players WHERE auction_status IN ('sold', 'unsold')").get() as { c: number }
    ).c,
    soldPlayers: (db.prepare("SELECT COUNT(*) AS c FROM players WHERE auction_status = 'sold'").get() as { c: number }).c,
    unsoldPlayers: (db.prepare("SELECT COUNT(*) AS c FROM players WHERE auction_status = 'unsold'").get() as { c: number }).c,
    pendingProfileChanges: (
      db.prepare("SELECT COUNT(*) AS c FROM player_profile_changes WHERE status = 'pending'").get() as { c: number }
    ).c,
    currentHighestBid:
      (
        db
          .prepare("SELECT current_highest_bid FROM auction_players WHERE status IN ('live', 'paused') ORDER BY id DESC LIMIT 1")
          .get() as { current_highest_bid: number } | undefined
      )?.current_highest_bid || 0,
    highestSoldPrice:
      (db.prepare("SELECT COALESCE(MAX(sold_price), 0) AS m FROM players WHERE auction_status = 'sold'").get() as { m: number })
        .m,
    totalAuctionSpending:
      (db.prepare("SELECT COALESCE(SUM(sold_price), 0) AS s FROM players WHERE auction_status = 'sold'").get() as { s: number })
        .s,
    remainingTotalBudget:
      (db.prepare("SELECT COALESCE(SUM(current_balance), 0) AS b FROM teams").get() as { b: number }).b,
  };

  const teamSpending = db
    .prepare(
      `SELECT t.id, t.name, t.short_code, t.initial_budget, t.current_balance,
              (t.initial_budget - t.current_balance) AS spent_amount,
              (SELECT COUNT(*) FROM players p WHERE p.sold_to_team_id = t.id AND p.auction_status = 'sold') AS squad_count
       FROM teams t
       ORDER BY spent_amount DESC`
    )
    .all();

  const categorySales = db
    .prepare(
      `SELECT pc.name, pc.base_price, pc.color,
              COUNT(p.id) AS total_players,
              SUM(CASE WHEN p.auction_status = 'sold' THEN 1 ELSE 0 END) AS sold_count,
              COALESCE(SUM(CASE WHEN p.auction_status = 'sold' THEN p.sold_price ELSE 0 END), 0) AS total_revenue
       FROM player_categories pc
       LEFT JOIN players p ON p.category_id = pc.id
       GROUP BY pc.id
       ORDER BY pc.sort_order ASC`
    )
    .all();

  res.json({ stats, teamSpending, categorySales });
});

// ---------------- TEAMS ----------------
router.get("/teams", (_req, res) => {
  const db = getDb();
  const teams = db
    .prepare(
      `SELECT t.*, u.username AS manager_username, u.is_active AS manager_active,
              (t.initial_budget - t.current_balance) AS spent_amount,
              (SELECT COUNT(*) FROM players p WHERE p.sold_to_team_id = t.id AND p.auction_status = 'sold') AS players_count
       FROM teams t
       LEFT JOIN users u ON u.team_id = t.id AND u.role = 'team_manager'
       ORDER BY t.id ASC`
    )
    .all();
  res.json({ teams });
});

router.post("/teams", uploadTeamLogo.single("logo"), (req, res) => {
  const schema = z.object({
    name: z.string().trim().min(2, "Team name is required"),
    shortCode: z.string().trim().min(2).max(8),
    managerName: z.string().trim().min(2, "Manager name is required"),
    username: z.string().trim().min(3, "Username must be at least 3 characters"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    initialBudget: z.coerce.number().int().min(0),
    status: z.enum(["active", "inactive", "suspended"]).default("active"),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid team data" });
    return;
  }

  const db = getDb();
  const logoUrl = req.file ? `/uploads/teams/${req.file.filename}` : null;
  const { name, shortCode, managerName, username, password, initialBudget, status } = parsed.data;

  try {
    const teamId = db.transaction(() => {
      const existingUser = db.prepare("SELECT id FROM users WHERE LOWER(username) = LOWER(?)").get(username);
      if (existingUser) throw new Error("Manager username already exists.");

      const info = db
        .prepare(
          `INSERT INTO teams (name, short_code, logo_url, manager_name, initial_budget, current_balance, status)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(name, shortCode.toUpperCase(), logoUrl, managerName, initialBudget, initialBudget, status);

      const newTeamId = Number(info.lastInsertRowid);

      db.prepare(
        `INSERT INTO users (username, password_hash, role, display_name, team_id)
         VALUES (?, ?, 'team_manager', ?, ?)`
      ).run(username, hashPassword(password), managerName, newTeamId);

      db.prepare(
        `INSERT INTO team_transactions (
          team_id, type, amount_delta, balance_after, reference_type, reference_id, description, created_by_user_id
        ) VALUES (?, 'initial_allocation', ?, ?, 'team', ?, ?, ?)`
      ).run(
        newTeamId,
        initialBudget,
        initialBudget,
        newTeamId,
        `Initial budget allocation for ${name}`,
        req.user!.id
      );

      logActivity(db, {
        ...actorFromReq(req),
        actorUserId: req.user!.id,
        action: "TEAM_CREATED",
        entityType: "team",
        entityId: newTeamId,
        details: { name, shortCode: shortCode.toUpperCase(), initialBudget, username },
      });

      return newTeamId;
    }).immediate();

    broadcastState(db, req.app.get("io"));
    res.status(201).json({ id: teamId });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to create team" });
  }
});

router.put("/teams/:id", uploadTeamLogo.single("logo"), (req, res) => {
  const teamId = Number(req.params.id);
  const schema = z.object({
    name: z.string().trim().min(2),
    shortCode: z.string().trim().min(2).max(8),
    managerName: z.string().trim().min(2),
    status: z.enum(["active", "inactive", "suspended"]),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid team update" });
    return;
  }

  const db = getDb();
  const existing = db.prepare("SELECT * FROM teams WHERE id = ?").get(teamId) as { logo_url: string | null } | undefined;
  if (!existing) {
    res.status(404).json({ error: "Team not found" });
    return;
  }

  const logoUrl = req.file ? `/uploads/teams/${req.file.filename}` : existing.logo_url;
  const { name, shortCode, managerName, status } = parsed.data;

  try {
    db.transaction(() => {
      db.prepare(
        `UPDATE teams SET name = ?, short_code = ?, manager_name = ?, status = ?, logo_url = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).run(name, shortCode.toUpperCase(), managerName, status, logoUrl, teamId);

      db.prepare(
        "UPDATE users SET display_name = ?, updated_at = datetime('now') WHERE team_id = ? AND role = 'team_manager'"
      ).run(managerName, teamId);

      logActivity(db, {
        ...actorFromReq(req),
        actorUserId: req.user!.id,
        action: "TEAM_UPDATED",
        entityType: "team",
        entityId: teamId,
        details: { name, shortCode, status },
      });
    }).immediate();

    broadcastState(db, req.app.get("io"));
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to update team" });
  }
});

router.post("/teams/:id/adjust-budget", (req, res) => {
  const teamId = Number(req.params.id);
  const schema = z.object({
    amountDelta: z.coerce.number().int().refine((v) => v !== 0, "Adjustment cannot be zero"),
    reason: z.string().trim().min(3, "Reason is required"),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid adjustment" });
    return;
  }

  const db = getDb();
  try {
    const updated = db.transaction(() => {
      const team = db.prepare("SELECT * FROM teams WHERE id = ?").get(teamId) as
        | { id: number; name: string; initial_budget: number; current_balance: number }
        | undefined;
      if (!team) throw new Error("Team not found");

      const nextBalance = team.current_balance + parsed.data.amountDelta;
      const nextInitial = Math.max(0, team.initial_budget + parsed.data.amountDelta);
      if (nextBalance < 0) {
        throw new Error("Adjustment would make team balance negative.");
      }

      db.prepare(
        "UPDATE teams SET initial_budget = ?, current_balance = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(nextInitial, nextBalance, teamId);

      db.prepare(
        `INSERT INTO team_transactions (
          team_id, type, amount_delta, balance_after, reference_type, reference_id, description, created_by_user_id
        ) VALUES (?, 'budget_adjustment', ?, ?, 'admin_adjustment', ?, ?, ?)`
      ).run(teamId, parsed.data.amountDelta, nextBalance, teamId, parsed.data.reason, req.user!.id);

      logActivity(db, {
        ...actorFromReq(req),
        actorUserId: req.user!.id,
        action: "TEAM_BUDGET_ADJUSTED",
        entityType: "team",
        entityId: teamId,
        details: { delta: parsed.data.amountDelta, nextBalance, reason: parsed.data.reason },
      });

      return { nextBalance, nextInitial };
    }).immediate();

    broadcastState(db, req.app.get("io"));
    res.json({ ok: true, ...updated });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to adjust budget" });
  }
});

router.post("/teams/:id/reset-password", (req, res) => {
  const teamId = Number(req.params.id);
  const schema = z.object({
    newPassword: z.string().min(6, "Password must be at least 6 characters"),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid password" });
    return;
  }

  const db = getDb();
  const info = db
    .prepare(
      "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE team_id = ? AND role = 'team_manager'"
    )
    .run(hashPassword(parsed.data.newPassword), teamId);

  if (info.changes === 0) {
    res.status(404).json({ error: "Team manager account not found" });
    return;
  }

  logActivity(db, {
    ...actorFromReq(req),
    actorUserId: req.user!.id,
    action: "TEAM_PASSWORD_RESET",
    entityType: "team",
    entityId: teamId,
  });

  res.json({ ok: true });
});

router.delete("/teams/:id", (req, res) => {
  const teamId = Number(req.params.id);
  const db = getDb();
  const soldCount = (
    db.prepare("SELECT COUNT(*) AS c FROM players WHERE sold_to_team_id = ?").get(teamId) as { c: number }
  ).c;
  if (soldCount > 0) {
    res.status(400).json({ error: "Cannot delete a team that already owns auctioned players." });
    return;
  }
  const hasBids = (db.prepare("SELECT COUNT(*) AS c FROM bids WHERE team_id = ?").get(teamId) as { c: number }).c;
  if (hasBids > 0) {
    res.status(400).json({ error: "Cannot delete a team with existing bid history. Set status to inactive instead." });
    return;
  }
  db.prepare("DELETE FROM teams WHERE id = ?").run(teamId);
  broadcastState(db, req.app.get("io"));
  res.json({ ok: true });
});

// ---------------- PLAYERS ----------------
router.get("/players", (_req, res) => {
  const db = getDb();
  const players = db
    .prepare(
      `SELECT p.*, pc.name AS category_name, pc.base_price, pc.min_increment, pc.color AS category_color,
              t.name AS sold_team_name, t.short_code AS sold_team_code,
              u.username AS claimed_username
       FROM players p
       JOIN player_categories pc ON pc.id = p.category_id
       LEFT JOIN teams t ON t.id = p.sold_to_team_id
       LEFT JOIN users u ON u.id = p.claimed_by_user_id
       ORDER BY p.id ASC`
    )
    .all();
  res.json({ players });
});

router.post("/players", uploadPlayerPhoto.single("photo"), (req, res) => {
  const schema = z.object({
    playerNumber: z.string().trim().min(1),
    fullName: z.string().trim().min(2),
    categoryId: z.coerce.number().int().positive(),
    position: z.string().trim().min(2),
    jerseyNumber: z.string().trim().optional().default(""),
    preferredFoot: z.string().trim().optional().default(""),
    roomNumber: z.string().trim().optional().default(""),
    contactPhone: z.string().trim().optional().default(""),
    paymentMethod: z.string().trim().optional().default(""),
    paymentStatus: z.string().trim().optional().default(""),
    additionalInfo: z.string().trim().optional().default(""),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid player data" });
    return;
  }

  const db = getDb();
  const d = parsed.data;
  const photoUrl = req.file ? `/uploads/players/${req.file.filename}` : null;
  const claimCode = generateClaimCode();

  try {
    const info = db
      .prepare(
        `INSERT INTO players (
          player_number, full_name, category_id, position, jersey_number, preferred_foot,
          room_number, contact_phone, payment_method, payment_status, additional_info,
          photo_url, claim_code_hash, claim_code_plain
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        d.playerNumber,
        d.fullName,
        d.categoryId,
        d.position,
        d.jerseyNumber,
        d.preferredFoot,
        d.roomNumber,
        normalizePhone(d.contactPhone),
        d.paymentMethod,
        d.paymentStatus,
        d.additionalInfo,
        photoUrl,
        hashClaimCode(claimCode),
        claimCode
      );

    logActivity(db, {
      ...actorFromReq(req),
      actorUserId: req.user!.id,
      action: "PLAYER_CREATED",
      entityType: "player",
      entityId: Number(info.lastInsertRowid),
      details: { playerNumber: d.playerNumber, fullName: d.fullName },
    });

    broadcastState(db, req.app.get("io"));
    res.status(201).json({ id: Number(info.lastInsertRowid), claimCode });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to create player" });
  }
});

router.put("/players/:id", uploadPlayerPhoto.single("photo"), (req, res) => {
  const playerId = Number(req.params.id);
  const schema = z.object({
    playerNumber: z.string().trim().min(1),
    fullName: z.string().trim().min(2),
    categoryId: z.coerce.number().int().positive(),
    position: z.string().trim().min(2),
    jerseyNumber: z.string().trim().optional().default(""),
    preferredFoot: z.string().trim().optional().default(""),
    roomNumber: z.string().trim().optional().default(""),
    contactPhone: z.string().trim().optional().default(""),
    paymentMethod: z.string().trim().optional().default(""),
    paymentStatus: z.string().trim().optional().default(""),
    additionalInfo: z.string().trim().optional().default(""),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid player data" });
    return;
  }

  const db = getDb();
  const existing = db.prepare("SELECT photo_url FROM players WHERE id = ?").get(playerId) as
    | { photo_url: string | null }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  const d = parsed.data;
  const photoUrl = req.file ? `/uploads/players/${req.file.filename}` : existing.photo_url;

  try {
    db.prepare(
      `UPDATE players
       SET player_number = ?, full_name = ?, category_id = ?, position = ?, jersey_number = ?,
           preferred_foot = ?, room_number = ?, contact_phone = ?, payment_method = ?,
           payment_status = ?, additional_info = ?, photo_url = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      d.playerNumber,
      d.fullName,
      d.categoryId,
      d.position,
      d.jerseyNumber,
      d.preferredFoot,
      d.roomNumber,
      normalizePhone(d.contactPhone),
      d.paymentMethod,
      d.paymentStatus,
      d.additionalInfo,
      photoUrl,
      playerId
    );

    logActivity(db, {
      ...actorFromReq(req),
      actorUserId: req.user!.id,
      action: "PLAYER_UPDATED",
      entityType: "player",
      entityId: playerId,
      details: { fullName: d.fullName, categoryId: d.categoryId },
    });

    broadcastState(db, req.app.get("io"));
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to update player" });
  }
});

router.patch("/players/bulk-category", (req, res) => {
  const schema = z.object({
    playerIds: z.array(z.coerce.number().int().positive()).min(1),
    categoryId: z.coerce.number().int().positive(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid category assignment" });
    return;
  }

  const db = getDb();
  const category = db
    .prepare("SELECT id, name, base_price FROM player_categories WHERE id = ?")
    .get(parsed.data.categoryId) as { id: number; name: string; base_price: number } | undefined;
  if (!category) {
    res.status(404).json({ error: "Category not found" });
    return;
  }

  const updated = db.transaction(() => {
    const stmt = db.prepare(
      "UPDATE players SET category_id = ?, updated_at = datetime('now') WHERE id = ? AND auction_status != 'live'"
    );
    let count = 0;
    for (const pid of parsed.data.playerIds) {
      const info = stmt.run(category.id, pid);
      count += info.changes;
    }

    logActivity(db, {
      ...actorFromReq(req),
      actorUserId: req.user!.id,
      action: "PLAYERS_CATEGORY_ASSIGNED",
      details: { playerIds: parsed.data.playerIds, categoryId: category.id, categoryName: category.name },
    });
    return count;
  }).immediate();

  broadcastState(db, req.app.get("io"));
  res.json({ ok: true, updated, category });
});

router.delete("/players/:id", (req, res) => {
  const playerId = Number(req.params.id);
  const db = getDb();
  const player = db.prepare("SELECT auction_status FROM players WHERE id = ?").get(playerId) as
    | { auction_status: string }
    | undefined;
  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return;
  }
  if (player.auction_status === "live" || player.auction_status === "sold") {
    res.status(400).json({ error: "Cannot delete a live or sold player. Reset/refund first." });
    return;
  }
  db.prepare("DELETE FROM players WHERE id = ?").run(playerId);
  broadcastState(db, req.app.get("io"));
  res.json({ ok: true });
});

router.post("/players/:id/regenerate-claim-code", (req, res) => {
  const playerId = Number(req.params.id);
  const db = getDb();
  const code = generateClaimCode();
  const info = db
    .prepare(
      "UPDATE players SET claim_code_hash = ?, claim_code_plain = ?, updated_at = datetime('now') WHERE id = ?"
    )
    .run(hashClaimCode(code), code, playerId);

  if (info.changes === 0) {
    res.status(404).json({ error: "Player not found" });
    return;
  }
  res.json({ claimCode: code });
});

router.post("/players/import", uploadSpreadsheet.single("file"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "CSV or Excel file is required" });
    return;
  }

  const db = getDb();
  const ext = path.extname(req.file.originalname).toLowerCase();

  let rows: Array<Record<string, unknown>> = [];
  try {
    if (ext === ".csv") {
      rows = parseCsv(req.file.buffer.toString("utf-8"), {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }) as Array<Record<string, unknown>>;
    } else {
      const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error("Spreadsheet has no sheets.");
      rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
    }
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Could not parse spreadsheet" });
    return;
  }

  const categories = db.prepare("SELECT id, name FROM player_categories").all() as Array<{ id: number; name: string }>;
  const defaultCat = categories[categories.length - 1]?.id || 1;
  let currentMax = (db.prepare("SELECT COUNT(*) AS c FROM players").get() as { c: number }).c;

  let imported = 0;
  let skipped = 0;

  const tx = db.transaction(() => {
    const insert = db.prepare(
      `INSERT INTO players (
        player_number, full_name, category_id, position, room_number,
        contact_phone, payment_method, payment_status, additional_info,
        claim_code_hash, claim_code_plain
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const raw of rows) {
      const map: Record<string, string> = {};
      for (const [k, v] of Object.entries(raw)) {
        map[k.trim().toLowerCase()] = String(v ?? "").trim();
      }

      const fullName = map["full name"] || map["name"] || map["player name"] || map["full_name"] || "";
      if (!fullName) {
        skipped++;
        continue;
      }

      const catName = map["category"] || map["category_name"] || "";
      const matchedCat = categories.find((c) => c.name.toLowerCase() === catName.toLowerCase());
      const categoryId = matchedCat?.id ?? defaultCat;

      let playerNumber = map["player number"] || map["player_number"] || map["number"] || "";
      if (!playerNumber) {
        currentMax++;
        playerNumber = `NB3-${String(currentMax).padStart(2, "0")}`;
      }

      const position = map["position"] || map["playing position"] || "Midfielder (MF)";
      const room = map["room"] || map["room number"] || map["room_number"] || "";
      const phone = normalizePhone(map["phone"] || map["contact"] || map["contact_phone"] || map["mobile"] || "");
      const paymentMethod = map["payment method"] || map["payment_method"] || "";
      const paymentStatus = map["payment status"] || map["payment_status"] || "";
      const additionalInfo = map["additional info"] || map["notes"] || "";
      const claimCode = generateClaimCode();

      try {
        insert.run(
          playerNumber,
          fullName,
          categoryId,
          position,
          room,
          phone,
          paymentMethod,
          paymentStatus,
          additionalInfo,
          hashClaimCode(claimCode),
          claimCode
        );
        imported++;
      } catch {
        skipped++;
      }
    }
  });

  tx();
  logActivity(db, {
    ...actorFromReq(req),
    actorUserId: req.user!.id,
    action: "PLAYERS_BULK_IMPORTED",
    details: { imported, skipped, filename: req.file.originalname },
  });
  broadcastState(db, req.app.get("io"));

  res.json({ imported, skipped });
});

// ---------------- PROFILE CHANGE APPROVALS ----------------
router.get("/profile-changes", (_req, res) => {
  const db = getDb();
  const changes = db
    .prepare(
      `SELECT pc.*, p.player_number, p.full_name AS current_name, p.position AS current_position,
              p.photo_url AS current_photo_url, u.username AS submitted_by_username
       FROM player_profile_changes pc
       JOIN players p ON p.id = pc.player_id
       JOIN users u ON u.id = pc.submitted_by_user_id
       ORDER BY CASE WHEN pc.status = 'pending' THEN 0 ELSE 1 END, pc.id DESC`
    )
    .all();
  res.json({ changes });
});

router.post("/profile-changes/:id/review", (req, res) => {
  const changeId = Number(req.params.id);
  const schema = z.object({
    decision: z.enum(["approved", "rejected"]),
    reviewNote: z.string().trim().optional().default(""),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid review decision" });
    return;
  }

  const db = getDb();
  const io = req.app.get("io");

  try {
    db.transaction(() => {
      const change = db.prepare("SELECT * FROM player_profile_changes WHERE id = ?").get(changeId) as
        | {
            id: number;
            player_id: number;
            submitted_by_user_id: number;
            proposed_full_name: string | null;
            proposed_position: string | null;
            proposed_jersey_number: string | null;
            proposed_preferred_foot: string | null;
            proposed_additional_info: string | null;
            proposed_photo_url: string | null;
            status: string;
          }
        | undefined;

      if (!change) throw new Error("Profile change request not found");
      if (change.status !== "pending") throw new Error("This change request has already been reviewed");

      db.prepare(
        `UPDATE player_profile_changes
         SET status = ?, reviewed_by_user_id = ?, review_note = ?, reviewed_at = datetime('now')
         WHERE id = ?`
      ).run(parsed.data.decision, req.user!.id, parsed.data.reviewNote, changeId);

      if (parsed.data.decision === "approved") {
        const player = db.prepare("SELECT * FROM players WHERE id = ?").get(change.player_id) as Record<string, string | null>;
        db.prepare(
          `UPDATE players
           SET full_name = ?, position = ?, jersey_number = ?, preferred_foot = ?,
               additional_info = ?, photo_url = ?, updated_at = datetime('now')
           WHERE id = ?`
        ).run(
          change.proposed_full_name || player.full_name,
          change.proposed_position || player.position,
          change.proposed_jersey_number ?? player.jersey_number,
          change.proposed_preferred_foot ?? player.preferred_foot,
          change.proposed_additional_info ?? player.additional_info,
          change.proposed_photo_url || player.photo_url,
          change.player_id
        );

        createNotification(db, io, {
          recipientUserId: change.submitted_by_user_id,
          type: "profile_approved",
          title: "Profile Update Approved",
          message: "Your player profile changes have been approved by the Admin.",
        });
      } else {
        createNotification(db, io, {
          recipientUserId: change.submitted_by_user_id,
          type: "profile_rejected",
          title: "Profile Update Rejected",
          message: parsed.data.reviewNote || "Your profile change request was rejected.",
        });
      }

      logActivity(db, {
        ...actorFromReq(req),
        actorUserId: req.user!.id,
        action: `PROFILE_CHANGE_${parsed.data.decision.toUpperCase()}`,
        entityType: "player_profile_change",
        entityId: changeId,
        details: { playerId: change.player_id },
      });
    }).immediate();

    broadcastState(db, io);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Review failed" });
  }
});

// ---------------- CATEGORIES ----------------
router.get("/categories", (_req, res) => {
  const db = getDb();
  const categories = db.prepare("SELECT * FROM player_categories ORDER BY sort_order ASC, id ASC").all();
  res.json({ categories });
});

router.post("/categories", (req, res) => {
  const schema = z.object({
    name: z.string().trim().min(1),
    basePrice: z.coerce.number().int().min(0),
    minIncrement: z.coerce.number().int().positive(),
    customDurationSeconds: z.union([z.coerce.number().int().min(10), z.literal(""), z.null()]).optional(),
    description: z.string().trim().optional().default(""),
    color: z.string().trim().optional().default("#FABD2F"),
    status: z.enum(["active", "inactive"]).default("active"),
    sortOrder: z.coerce.number().int().optional().default(0),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid category" });
    return;
  }

  const db = getDb();
  const d = parsed.data;
  const customDur = d.customDurationSeconds === "" || d.customDurationSeconds === undefined ? null : d.customDurationSeconds;

  try {
    const info = db
      .prepare(
        `INSERT INTO player_categories (name, base_price, min_increment, custom_duration_seconds, description, color, status, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(d.name, d.basePrice, d.minIncrement, customDur, d.description, d.color, d.status, d.sortOrder);

    logActivity(db, {
      ...actorFromReq(req),
      actorUserId: req.user!.id,
      action: "CATEGORY_CREATED",
      entityType: "player_category",
      entityId: Number(info.lastInsertRowid),
      details: { name: d.name, basePrice: d.basePrice },
    });

    res.status(201).json({ id: Number(info.lastInsertRowid) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to create category" });
  }
});

router.put("/categories/:id", (req, res) => {
  const catId = Number(req.params.id);
  const schema = z.object({
    name: z.string().trim().min(1),
    basePrice: z.coerce.number().int().min(0),
    minIncrement: z.coerce.number().int().positive(),
    customDurationSeconds: z.union([z.coerce.number().int().min(10), z.literal(""), z.null()]).optional(),
    description: z.string().trim().optional().default(""),
    color: z.string().trim().optional().default("#FABD2F"),
    status: z.enum(["active", "inactive"]),
    sortOrder: z.coerce.number().int().optional().default(0),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid category update" });
    return;
  }

  const db = getDb();
  const d = parsed.data;
  const customDur = d.customDurationSeconds === "" || d.customDurationSeconds === undefined ? null : d.customDurationSeconds;

  db.prepare(
    `UPDATE player_categories
     SET name = ?, base_price = ?, min_increment = ?, custom_duration_seconds = ?,
         description = ?, color = ?, status = ?, sort_order = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(d.name, d.basePrice, d.minIncrement, customDur, d.description, d.color, d.status, d.sortOrder, catId);

  logActivity(db, {
    ...actorFromReq(req),
    actorUserId: req.user!.id,
    action: "CATEGORY_UPDATED",
    entityType: "player_category",
    entityId: catId,
    details: { name: d.name, basePrice: d.basePrice, minIncrement: d.minIncrement },
  });

  broadcastState(db, req.app.get("io"));
  res.json({ ok: true });
});

router.delete("/categories/:id", (req, res) => {
  const catId = Number(req.params.id);
  const db = getDb();
  const count = (db.prepare("SELECT COUNT(*) AS c FROM players WHERE category_id = ?").get(catId) as { c: number }).c;
  if (count > 0) {
    res.status(400).json({ error: "Cannot delete a category that has players assigned to it." });
    return;
  }
  db.prepare("DELETE FROM player_categories WHERE id = ?").run(catId);
  res.json({ ok: true });
});

// ---------------- AUCTION SETTINGS & LIVE CONTROL ----------------
router.get("/settings", (_req, res) => {
  const db = getDb();
  const settings = db.prepare("SELECT * FROM auction_settings WHERE id = 1").get();
  res.json({ settings });
});

router.put("/settings", (req, res) => {
  const schema = z.object({
    auctionTitle: z.string().trim().min(2),
    defaultDurationSeconds: z.coerce.number().int().min(10).max(600),
    defaultStartingPrice: z.coerce.number().int().min(0),
    defaultMinIncrement: z.coerce.number().int().positive(),
    antiSnipingEnabled: z.boolean(),
    antiSnipingThresholdSeconds: z.coerce.number().int().min(1).max(60),
    antiSnipingExtensionSeconds: z.coerce.number().int().min(1).max(120),
    autoNextPlayer: z.boolean(),
    autoPauseBetweenPlayers: z.boolean(),
    autoPauseSeconds: z.coerce.number().int().min(0).max(60),
    scheduledStartAt: z.string().nullable().optional(),
    auctionStatus: z.enum(["draft", "scheduled", "live", "paused", "completed"]),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid settings" });
    return;
  }

  const d = parsed.data;
  const db = getDb();
  db.prepare(
    `UPDATE auction_settings
     SET auction_title = ?, default_duration_seconds = ?, default_starting_price = ?, default_min_increment = ?,
         anti_sniping_enabled = ?, anti_sniping_threshold_seconds = ?, anti_sniping_extension_seconds = ?,
         auto_next_player = ?, auto_pause_between_players = ?, auto_pause_seconds = ?,
         scheduled_start_at = ?, auction_status = ?, updated_at = datetime('now')
     WHERE id = 1`
  ).run(
    d.auctionTitle,
    d.defaultDurationSeconds,
    d.defaultStartingPrice,
    d.defaultMinIncrement,
    d.antiSnipingEnabled ? 1 : 0,
    d.antiSnipingThresholdSeconds,
    d.antiSnipingExtensionSeconds,
    d.autoNextPlayer ? 1 : 0,
    d.autoPauseBetweenPlayers ? 1 : 0,
    d.autoPauseSeconds,
    d.scheduledStartAt || null,
    d.auctionStatus
  );

  logActivity(db, {
    ...actorFromReq(req),
    actorUserId: req.user!.id,
    action: "AUCTION_SETTINGS_UPDATED",
    details: d,
  });

  broadcastState(db, req.app.get("io"));
  res.json({ ok: true });
});

router.post("/auction/queue", (req, res) => {
  const schema = z.object({ playerIds: z.array(z.coerce.number().int().positive()).min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Provide at least one playerId" });
    return;
  }

  const db = getDb();
  const io = req.app.get("io");
  const queued: number[] = [];
  const errors: string[] = [];

  for (const pid of parsed.data.playerIds) {
    try {
      queued.push(queuePlayerForAuction(db, io, pid, actorFromReq(req)));
    } catch (err) {
      errors.push(err instanceof Error ? err.message : `Failed for player ${pid}`);
    }
  }

  res.json({ queued, errors });
});

router.post("/auction/clear-queue", (req, res) => {
  const db = getDb();
  db.transaction(() => {
    const pending = db.prepare("SELECT id, player_id FROM auction_players WHERE status = 'pending'").all() as Array<{
      id: number;
      player_id: number;
    }>;
    for (const lot of pending) {
      db.prepare("UPDATE players SET auction_status = 'unauctioned' WHERE id = ? AND auction_status = 'queued'").run(
        lot.player_id
      );
      db.prepare("DELETE FROM auction_players WHERE id = ?").run(lot.id);
    }
  }).immediate();
  broadcastState(db, req.app.get("io"));
  res.json({ ok: true });
});

router.post("/auction/start-player", (req, res) => {
  const schema = z.object({
    playerId: z.coerce.number().int().positive(),
    startingPrice: z.coerce.number().int().min(0).optional(),
    durationSeconds: z.coerce.number().int().min(10).optional(),
    minIncrement: z.coerce.number().int().positive().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid start request" });
    return;
  }

  try {
    const lotId = startPlayerAuction(getDb(), req.app.get("io"), parsed.data.playerId, actorFromReq(req), {
      startingPrice: parsed.data.startingPrice,
      durationSeconds: parsed.data.durationSeconds,
      minIncrement: parsed.data.minIncrement,
    });
    res.json({ ok: true, lotId });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Could not start player auction" });
  }
});

router.post("/auction/pause", (req, res) => {
  try {
    const result = pauseAuction(getDb(), req.app.get("io"), actorFromReq(req));
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Cannot pause" });
  }
});

router.post("/auction/resume", (req, res) => {
  try {
    const result = resumeAuction(getDb(), req.app.get("io"), actorFromReq(req));
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Cannot resume" });
  }
});

router.post("/auction/extend", (req, res) => {
  const schema = z.object({ seconds: z.coerce.number().int().min(-30).max(300) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid seconds" });
    return;
  }

  try {
    extendActiveTimer(getDb(), req.app.get("io"), parsed.data.seconds, actorFromReq(req));
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Cannot adjust timer" });
  }
});

router.post("/auction/mark-sold", (req, res) => {
  try {
    const settled = finalizeActiveLot(getDb(), req.app.get("io"), "manual_sold", actorFromReq(req));
    if (!settled) {
      res.status(400).json({ error: "No active player lot found" });
      return;
    }
    res.json({ ok: true, result: settled });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Cannot mark sold" });
  }
});

router.post("/auction/mark-unsold", (req, res) => {
  try {
    const settled = finalizeActiveLot(getDb(), req.app.get("io"), "manual_unsold", actorFromReq(req));
    if (!settled) {
      res.status(400).json({ error: "No active player lot found" });
      return;
    }
    res.json({ ok: true, result: settled });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Cannot mark unsold" });
  }
});

router.post("/auction/reauction", (req, res) => {
  const schema = z.object({ playerId: z.coerce.number().int().positive() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid playerId" });
    return;
  }

  try {
    refundAndReauctionPlayer(getDb(), req.app.get("io"), parsed.data.playerId, actorFromReq(req));
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Cannot reset player" });
  }
});

// ---------------- REPORTS & EXPORTS ----------------
router.get("/reports", (_req, res) => {
  const db = getDb();

  const auctionHistory = db
    .prepare(
      `SELECT ap.*, p.player_number, p.full_name AS player_name, p.position,
              t.name AS winning_team_name, t.short_code AS winning_team_code
       FROM auction_players ap
       JOIN players p ON p.id = ap.player_id
       LEFT JOIN teams t ON t.id = ap.winning_team_id
       WHERE ap.status IN ('sold', 'unsold')
       ORDER BY ap.id DESC`
    )
    .all() as Array<Record<string, unknown>>;

  const bidsByLot = db
    .prepare(
      `SELECT b.*, t.name AS team_name, t.short_code AS team_code
       FROM bids b
       JOIN teams t ON t.id = b.team_id
       ORDER BY b.amount DESC`
    )
    .all() as Array<{ auction_player_id: number } & Record<string, unknown>>;

  const historyWithBids = auctionHistory.map((lot) => ({
    ...lot,
    bids: bidsByLot.filter((b) => b.auction_player_id === lot.id),
  }));

  const teamReports = db
    .prepare(
      `SELECT t.id, t.name, t.short_code, t.manager_name, t.initial_budget, t.current_balance,
              (t.initial_budget - t.current_balance) AS total_spending
       FROM teams t ORDER BY t.name ASC`
    )
    .all() as Array<{ id: number } & Record<string, unknown>>;

  const soldPlayers = db
    .prepare(
      `SELECT p.id, p.player_number, p.full_name, p.position, p.sold_price, p.sold_to_team_id,
              pc.name AS category_name, t.name AS team_name
       FROM players p
       JOIN player_categories pc ON pc.id = p.category_id
       LEFT JOIN teams t ON t.id = p.sold_to_team_id
       WHERE p.auction_status = 'sold'
       ORDER BY p.sold_price DESC`
    )
    .all() as Array<{ sold_to_team_id: number } & Record<string, unknown>>;

  const unsoldPlayers = db
    .prepare(
      `SELECT p.id, p.player_number, p.full_name, p.position, pc.name AS category_name, pc.base_price
       FROM players p
       JOIN player_categories pc ON pc.id = p.category_id
       WHERE p.auction_status = 'unsold'
       ORDER BY p.id ASC`
    )
    .all();

  const categorySales = db
    .prepare(
      `SELECT pc.name, pc.base_price,
              COUNT(p.id) AS total_players,
              SUM(CASE WHEN p.auction_status = 'sold' THEN 1 ELSE 0 END) AS sold_count,
              SUM(CASE WHEN p.auction_status = 'unsold' THEN 1 ELSE 0 END) AS unsold_count,
              COALESCE(SUM(CASE WHEN p.auction_status = 'sold' THEN p.sold_price ELSE 0 END), 0) AS total_spent
       FROM player_categories pc
       LEFT JOIN players p ON p.category_id = pc.id
       GROUP BY pc.id
       ORDER BY pc.sort_order ASC`
    )
    .all();

  res.json({
    auctionHistory: historyWithBids,
    teamReports: teamReports.map((t) => ({
      ...t,
      players: soldPlayers.filter((p) => p.sold_to_team_id === t.id),
    })),
    soldPlayers,
    unsoldPlayers,
    categorySales,
  });
});

router.get("/reports/export.csv", (_req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT p.player_number, p.full_name, pc.name AS category, p.position, p.room_number,
              p.auction_status, COALESCE(t.name, '-') AS winning_team, COALESCE(p.sold_price, 0) AS sold_price
       FROM players p
       JOIN player_categories pc ON pc.id = p.category_id
       LEFT JOIN teams t ON t.id = p.sold_to_team_id
       ORDER BY p.id ASC`
    )
    .all() as Array<Record<string, unknown>>;

  const headers = ["Player Number", "Full Name", "Category", "Position", "Room", "Auction Status", "Winning Team", "Sold Price (BDT)"];
  const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csvLines = [
    headers.map(escape).join(","),
    ...rows.map((r) =>
      [r.player_number, r.full_name, r.category, r.position, r.room_number, r.auction_status, r.winning_team, r.sold_price]
        .map(escape)
        .join(",")
    ),
  ];

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=yksg-nb3-auction-report.csv");
  res.send(csvLines.join("\n"));
});

router.get("/reports/export.pdf", (_req, res) => {
  const db = getDb();
  const teams = db
    .prepare(
      `SELECT name, short_code, initial_budget, (initial_budget - current_balance) AS spent, current_balance
       FROM teams ORDER BY name ASC`
    )
    .all() as Array<{ name: string; short_code: string; initial_budget: number; spent: number; current_balance: number }>;

  const sold = db
    .prepare(
      `SELECT p.player_number, p.full_name, p.position, pc.name AS category, p.sold_price, t.name AS team_name
       FROM players p
       JOIN player_categories pc ON pc.id = p.category_id
       LEFT JOIN teams t ON t.id = p.sold_to_team_id
       WHERE p.auction_status = 'sold'
       ORDER BY p.sold_price DESC`
    )
    .all() as Array<{ player_number: string; full_name: string; position: string; category: string; sold_price: number; team_name: string }>;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=yksg-nb3-auction-report.pdf");

  const doc = new PDFDocument({ margin: 40, size: "A4" });
  doc.pipe(res);

  doc.fontSize(20).text("YKSG NB-3 PLAYER AUCTION REPORT", { align: "center" });
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor("#555555").text(`Generated: ${new Date().toLocaleString()}`, { align: "center" });
  doc.moveDown(1.2);

  doc.fillColor("#000000").fontSize(14).text("Team Budgets & Spending");
  doc.moveDown(0.4);
  if (teams.length === 0) {
    doc.fontSize(10).text("No teams created yet.");
  } else {
    for (const t of teams) {
      doc
        .fontSize(10)
        .text(
          `${t.name} (${t.short_code})  |  Budget: BDT ${t.initial_budget.toLocaleString()}  |  Spent: BDT ${t.spent.toLocaleString()}  |  Remaining: BDT ${t.current_balance.toLocaleString()}`
        );
    }
  }

  doc.moveDown(1);
  doc.fontSize(14).text("Sold Players Summary");
  doc.moveDown(0.4);
  if (sold.length === 0) {
    doc.fontSize(10).text("No players sold yet.");
  } else {
    for (const p of sold) {
      doc
        .fontSize(10)
        .text(
          `${p.player_number} · ${p.full_name} (${p.position}, ${p.category}) -> ${p.team_name} for BDT ${p.sold_price.toLocaleString()}`
        );
    }
  }

  doc.end();
});

// ---------------- USERS, LOGS, NOTIFICATIONS, BACKUPS ----------------
router.get("/users", (_req, res) => {
  const db = getDb();
  const users = db
    .prepare(
      `SELECT u.id, u.username, u.role, u.display_name, u.team_id, u.player_id, u.is_active, u.created_at,
              t.name AS team_name, p.player_number
       FROM users u
       LEFT JOIN teams t ON t.id = u.team_id
       LEFT JOIN players p ON p.id = u.player_id
       ORDER BY u.id ASC`
    )
    .all();
  res.json({ users });
});

router.put("/users/:id/toggle", (req, res) => {
  const userId = Number(req.params.id);
  if (userId === req.user!.id) {
    res.status(400).json({ error: "You cannot deactivate your own admin account." });
    return;
  }
  const db = getDb();
  db.prepare("UPDATE users SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END, updated_at = datetime('now') WHERE id = ?").run(
    userId
  );
  res.json({ ok: true });
});

router.get("/audit-logs", (_req, res) => {
  const db = getDb();
  const logs = db.prepare("SELECT * FROM activity_logs ORDER BY id DESC LIMIT 200").all();
  res.json({ logs });
});

router.get("/notifications", (_req, res) => {
  const db = getDb();
  const notifications = db.prepare("SELECT * FROM notifications ORDER BY id DESC LIMIT 50").all();
  res.json({ notifications });
});

router.post("/notifications/read", (_req, res) => {
  const db = getDb();
  db.prepare("UPDATE notifications SET is_read = 1 WHERE recipient_team_id IS NULL AND recipient_user_id IS NULL").run();
  res.json({ ok: true });
});

router.get("/backups", (_req, res) => {
  res.json({ backups: listBackups() });
});

router.post("/backups/create", async (req, res) => {
  try {
    const db = getDb();
    const info = await createDatabaseBackup(db, "manual");
    logActivity(db, {
      ...actorFromReq(req),
      actorUserId: req.user!.id,
      action: "DATABASE_BACKUP_CREATED",
      details: { filename: info.filename, size: info.size },
    });
    res.json({ ok: true, backup: info });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Backup failed" });
  }
});

router.get("/backups/:filename/download", (req, res) => {
  const filename = path.basename(req.params.filename);
  const target = path.join(config.backupsDir, filename);
  if (!fs.existsSync(target)) {
    res.status(404).json({ error: "Backup file not found" });
    return;
  }
  res.download(target, filename);
});

router.post("/backups/:filename/restore", async (req, res) => {
  const filename = path.basename(req.params.filename);
  const backupPath = path.join(config.backupsDir, filename);
  if (!fs.existsSync(backupPath)) {
    res.status(404).json({ error: "Backup file not found" });
    return;
  }

  try {
    // Take safety snapshot before restoring
    await createDatabaseBackup(getDb(), "pre-restore");
    closeDatabase();
    fs.copyFileSync(backupPath, config.dbPath);
    for (const suffix of ["-wal", "-shm"]) {
      const sidecar = config.dbPath + suffix;
      if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar);
    }
    const restoredDb = initDatabase();
    broadcastState(restoredDb, req.app.get("io"));
    res.json({ ok: true, message: `Database restored from ${filename}` });
  } catch (err) {
    initDatabase();
    res.status(500).json({ error: err instanceof Error ? err.message : "Restore failed" });
  }
});

export default router;
