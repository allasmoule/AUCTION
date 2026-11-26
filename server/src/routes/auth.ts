import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db/database.js";
import { requireAuth } from "../middleware/auth.js";
import { logActivity } from "../utils/audit.js";
import { hashPassword, signJwt, verifyPassword } from "../utils/security.js";

const router = Router();

const loginSchema = z.object({
  username: z.string().trim().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  expectedRole: z.enum(["super_admin", "team_manager", "player"]).optional(),
});

router.post("/login", (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid login input" });
    return;
  }

  const { username, password, expectedRole } = parsed.data;
  const db = getDb();

  const user = db
    .prepare(
      `SELECT id, username, password_hash, role, display_name, team_id, player_id, is_active
       FROM users WHERE LOWER(username) = LOWER(?)`
    )
    .get(username) as
    | {
        id: number;
        username: string;
        password_hash: string;
        role: "super_admin" | "team_manager" | "player";
        display_name: string;
        team_id: number | null;
        player_id: number | null;
        is_active: number;
      }
    | undefined;

  if (!user || !verifyPassword(password, user.password_hash)) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  if (!user.is_active) {
    res.status(403).json({ error: "This account has been deactivated by an administrator." });
    return;
  }

  if (expectedRole && user.role !== expectedRole) {
    res.status(403).json({ error: `This login portal is restricted to ${expectedRole.replace("_", " ")} accounts.` });
    return;
  }

  const token = signJwt({
    userId: user.id,
    username: user.username,
    role: user.role,
    teamId: user.team_id,
    playerId: user.player_id,
  });

  logActivity(db, {
    actorUserId: user.id,
    actorUsername: user.username,
    actorRole: user.role,
    action: "USER_LOGIN",
    entityType: "user",
    entityId: user.id,
    ipAddress: req.ip,
  });

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      displayName: user.display_name,
      teamId: user.team_id,
      playerId: user.player_id,
    },
  });
});

router.get("/me", requireAuth, (req, res) => {
  const db = getDb();
  let team = null;
  let player = null;

  if (req.user?.teamId) {
    team = db.prepare("SELECT * FROM teams WHERE id = ?").get(req.user.teamId) || null;
  }
  if (req.user?.playerId) {
    player = db
      .prepare(
        `SELECT p.id, p.player_number, p.full_name, p.position, p.jersey_number, p.preferred_foot,
                p.room_number, p.additional_info, p.photo_url, p.is_claimed, p.auction_status,
                pc.name AS category_name
         FROM players p
         LEFT JOIN player_categories pc ON pc.id = p.category_id
         WHERE p.id = ?`
      )
      .get(req.user.playerId) || null;
  }

  res.json({ user: req.user, team, player });
});

router.post("/change-password", requireAuth, (req, res) => {
  const schema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(6, "New password must be at least 6 characters"),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input" });
    return;
  }

  const db = getDb();
  const row = db
    .prepare("SELECT password_hash FROM users WHERE id = ?")
    .get(req.user!.id) as { password_hash: string } | undefined;

  if (!row || !verifyPassword(parsed.data.currentPassword, row.password_hash)) {
    res.status(400).json({ error: "Current password is incorrect" });
    return;
  }

  db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(
    hashPassword(parsed.data.newPassword),
    req.user!.id
  );

  logActivity(db, {
    actorUserId: req.user!.id,
    actorUsername: req.user!.username,
    actorRole: req.user!.role,
    action: "PASSWORD_CHANGED",
    entityType: "user",
    entityId: req.user!.id,
    ipAddress: req.ip,
  });

  res.json({ ok: true });
});

export default router;
