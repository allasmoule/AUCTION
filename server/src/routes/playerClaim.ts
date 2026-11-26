import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db/database.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { uploadPlayerPhoto } from "../middleware/upload.js";
import { logActivity } from "../utils/audit.js";
import { hashClaimCode, hashPassword, normalizePhone, signJwt } from "../utils/security.js";

const router = Router();

router.post("/lookup", (req, res) => {
  const schema = z.object({
    playerNumber: z.string().trim().min(1, "Player number is required"),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid player number" });
    return;
  }

  const db = getDb();
  const player = db
    .prepare(
      `SELECT p.id, p.player_number, p.full_name, p.position, p.room_number, p.photo_url,
              p.is_claimed, p.contact_phone, pc.name AS category_name
       FROM players p
       JOIN player_categories pc ON pc.id = p.category_id
       WHERE UPPER(p.player_number) = UPPER(?)`
    )
    .get(parsed.data.playerNumber) as
    | {
        id: number;
        player_number: string;
        full_name: string;
        position: string;
        room_number: string;
        photo_url: string | null;
        is_claimed: number;
        contact_phone: string;
        category_name: string;
      }
    | undefined;

  if (!player) {
    res.status(404).json({ error: "No player found with that Player Number." });
    return;
  }

  const requiresPhoneLast4 = normalizePhone(player.contact_phone || "").length >= 4;

  res.json({
    player: {
      id: player.id,
      playerNumber: player.player_number,
      fullName: player.full_name,
      position: player.position,
      roomNumber: player.room_number,
      photoUrl: player.photo_url,
      categoryName: player.category_name,
      isClaimed: Boolean(player.is_claimed),
      requiresPhoneLast4,
    },
  });
});

router.post("/claim", (req, res) => {
  const schema = z.object({
    playerNumber: z.string().trim().min(1),
    claimCode: z.string().trim().min(4, "One-time claim code is required"),
    phoneLast4: z.string().trim().optional(),
    username: z.string().trim().min(3, "Username must be at least 3 characters").max(32),
    password: z.string().min(6, "Password must be at least 6 characters"),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid claim payload" });
    return;
  }

  const { playerNumber, claimCode, phoneLast4, username, password } = parsed.data;
  const db = getDb();

  try {
    const result = db.transaction(() => {
      const player = db
        .prepare("SELECT * FROM players WHERE UPPER(player_number) = UPPER(?)")
        .get(playerNumber) as
        | {
            id: number;
            player_number: string;
            full_name: string;
            contact_phone: string;
            claim_code_hash: string;
            is_claimed: number;
          }
        | undefined;

      if (!player) {
        throw new Error("Player record not found.");
      }
      if (player.is_claimed) {
        throw new Error("This player profile has already been claimed. Please log in instead.");
      }

      if (hashClaimCode(claimCode) !== player.claim_code_hash) {
        throw new Error("Invalid one-time claim verification code.");
      }

      const normalizedPhone = normalizePhone(player.contact_phone || "");
      if (normalizedPhone.length >= 4) {
        const providedLast4 = (phoneLast4 || "").replace(/\D/g, "");
        if (providedLast4 !== normalizedPhone.slice(-4)) {
          throw new Error("Registered phone last 4 digits do not match our records.");
        }
      }

      const existingUser = db
        .prepare("SELECT id FROM users WHERE LOWER(username) = LOWER(?)")
        .get(username);
      if (existingUser) {
        throw new Error("That username is already taken. Please choose another.");
      }

      const userInfo = db
        .prepare(
          `INSERT INTO users (username, password_hash, role, display_name, player_id)
           VALUES (?, ?, 'player', ?, ?)`
        )
        .run(username, hashPassword(password), player.full_name, player.id);

      const userId = Number(userInfo.lastInsertRowid);

      db.prepare(
        `UPDATE players
         SET is_claimed = 1, claimed_by_user_id = ?, claim_code_plain = NULL, updated_at = datetime('now')
         WHERE id = ?`
      ).run(userId, player.id);

      db.prepare(
        `INSERT INTO player_claims (player_id, user_id, verification_method, status, ip_address)
         VALUES (?, ?, ?, 'verified', ?)`
      ).run(
        player.id,
        userId,
        normalizedPhone.length >= 4 ? "claim_code_and_phone" : "claim_code",
        req.ip || ""
      );

      logActivity(db, {
        actorUserId: userId,
        actorUsername: username,
        actorRole: "player",
        action: "PLAYER_PROFILE_CLAIMED",
        entityType: "player",
        entityId: player.id,
        details: { playerNumber: player.player_number, fullName: player.full_name },
        ipAddress: req.ip,
      });

      return { userId, playerId: player.id, fullName: player.full_name };
    }).immediate();

    const token = signJwt({
      userId: result.userId,
      username,
      role: "player",
      playerId: result.playerId,
    });

      res.status(201).json({
      token,
      user: {
        id: result.userId,
        username,
        role: "player",
        displayName: result.fullName,
        playerId: result.playerId,
      },
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to claim profile" });
  }
});

router.post("/claim-by-phone", (req, res) => {
  const schema = z.object({
    playerNumber: z.string().trim().min(1, "Player number is required"),
    phone: z.string().trim().min(6, "Mobile number is required"),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input" });
    return;
  }

  const { playerNumber, phone } = parsed.data;
  const db = getDb();
  const normalizedInput = normalizePhone(phone);

  try {
    const result = db.transaction(() => {
      const player = db
        .prepare("SELECT * FROM players WHERE UPPER(player_number) = UPPER(?)")
        .get(playerNumber) as
        | {
            id: number;
            player_number: string;
            full_name: string;
            contact_phone: string;
            is_claimed: number;
            claimed_by_user_id: number | null;
          }
        | undefined;

      if (!player) {
        throw new Error("Player record not found.");
      }

      const registeredPhone = normalizePhone(player.contact_phone || "");
      if (!registeredPhone) {
        throw new Error("No mobile number on file for this player.");
      }
      if (normalizedInput !== registeredPhone) {
        throw new Error("Mobile number does not match this player's registered number.");
      }

      if (player.is_claimed && player.claimed_by_user_id) {
        const existingUser = db
          .prepare("SELECT id, username, is_active FROM users WHERE id = ?")
          .get(player.claimed_by_user_id) as { id: number; username: string; is_active: number } | undefined;

        if (existingUser) {
          if (!existingUser.is_active) {
            throw new Error("This player account has been deactivated by Admin.");
          }
          logActivity(db, {
            actorUserId: existingUser.id,
            actorUsername: existingUser.username,
            actorRole: "player",
            action: "PLAYER_PORTAL_OPENED_BY_PHONE",
            entityType: "player",
            entityId: player.id,
            ipAddress: req.ip,
          });
          return {
            userId: existingUser.id,
            username: existingUser.username,
            playerId: player.id,
            fullName: player.full_name,
          };
        }
      }

      const baseUsername = player.player_number.toLowerCase().replace(/[^a-z0-9_-]/g, "");
      const existingUsername = db
        .prepare("SELECT id FROM users WHERE LOWER(username) = LOWER(?)")
        .get(baseUsername);
      const finalUsername = existingUsername ? `${baseUsername}_${player.id}` : baseUsername;

      const userInfo = db
        .prepare(
          `INSERT INTO users (username, password_hash, role, display_name, player_id)
           VALUES (?, ?, 'player', ?, ?)`
        )
        .run(finalUsername, hashPassword(normalizedInput), player.full_name, player.id);

      const userId = Number(userInfo.lastInsertRowid);

      db.prepare(
        `UPDATE players
         SET is_claimed = 1, claimed_by_user_id = ?, claim_code_plain = NULL, updated_at = datetime('now')
         WHERE id = ?`
      ).run(userId, player.id);

      db.prepare(
        `INSERT INTO player_claims (player_id, user_id, verification_method, status, ip_address)
         VALUES (?, ?, 'mobile_number', 'verified', ?)`
      ).run(player.id, userId, req.ip || "");

      logActivity(db, {
        actorUserId: userId,
        actorUsername: finalUsername,
        actorRole: "player",
        action: "PLAYER_PROFILE_CLAIMED_BY_PHONE",
        entityType: "player",
        entityId: player.id,
        details: { playerNumber: player.player_number, fullName: player.full_name },
        ipAddress: req.ip,
      });

      return { userId, username: finalUsername, playerId: player.id, fullName: player.full_name };
    }).immediate();

    const token = signJwt({
      userId: result.userId,
      username: result.username,
      role: "player",
      playerId: result.playerId,
    });

    res.status(201).json({
      token,
      user: {
        id: result.userId,
        username: result.username,
        role: "player",
        displayName: result.fullName,
        playerId: result.playerId,
      },
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to open player account" });
  }
});

router.get("/me", requireAuth, requireRole("player"), (req, res) => {
  const db = getDb();
  const player = db
    .prepare(
      `SELECT p.id, p.player_number, p.full_name, p.position, p.jersey_number, p.preferred_foot,
              p.room_number, p.additional_info, p.photo_url, p.is_claimed, p.auction_status,
              p.sold_price, pc.name AS category_name, pc.base_price, t.name AS sold_team_name
       FROM players p
       JOIN player_categories pc ON pc.id = p.category_id
       LEFT JOIN teams t ON t.id = p.sold_to_team_id
       WHERE p.id = ?`
    )
    .get(req.user!.playerId);

  const changes = db
    .prepare(
      `SELECT * FROM player_profile_changes
       WHERE player_id = ?
       ORDER BY id DESC LIMIT 20`
    )
    .all(req.user!.playerId);

  res.json({ player, changes });
});

router.post(
  "/profile-update",
  requireAuth,
  requireRole("player"),
  uploadPlayerPhoto.single("photo"),
  (req, res) => {
    const schema = z.object({
      fullName: z.string().trim().min(2).max(100).optional(),
      position: z.string().trim().min(2).max(80).optional(),
      jerseyNumber: z.string().trim().max(10).optional(),
      preferredFoot: z.string().trim().max(20).optional(),
      additionalInfo: z.string().trim().max(500).optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid profile update" });
      return;
    }

    const db = getDb();
    const photoUrl = req.file ? `/uploads/players/${req.file.filename}` : null;
    const { fullName, position, jerseyNumber, preferredFoot, additionalInfo } = parsed.data;

    if (!photoUrl && !fullName && !position && jerseyNumber === undefined && preferredFoot === undefined && additionalInfo === undefined) {
      res.status(400).json({ error: "Please provide at least one field or a photograph to update." });
      return;
    }

    const info = db
      .prepare(
        `INSERT INTO player_profile_changes (
          player_id, submitted_by_user_id, proposed_full_name, proposed_position,
          proposed_jersey_number, proposed_preferred_foot, proposed_additional_info, proposed_photo_url, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
      )
      .run(
        req.user!.playerId,
        req.user!.id,
        fullName || null,
        position || null,
        jerseyNumber ?? null,
        preferredFoot ?? null,
        additionalInfo ?? null,
        photoUrl
      );

    logActivity(db, {
      actorUserId: req.user!.id,
      actorUsername: req.user!.username,
      actorRole: "player",
      action: "PLAYER_PROFILE_CHANGE_SUBMITTED",
      entityType: "player_profile_change",
      entityId: Number(info.lastInsertRowid),
      details: { playerId: req.user!.playerId, hasPhoto: Boolean(photoUrl) },
      ipAddress: req.ip,
    });

    res.status(201).json({
      id: Number(info.lastInsertRowid),
      status: "pending",
      message: "Your profile update has been submitted for admin approval.",
    });
  }
);

export default router;
