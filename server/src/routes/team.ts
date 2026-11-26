import { Router } from "express";
import { z } from "zod";
import { getDb } from "../db/database.js";
import { getPublicAuctionState, placeBid } from "../engine/auctionEngine.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth, requireRole("team_manager"));

router.get("/dashboard", (req, res) => {
  const db = getDb();
  const teamId = req.user!.teamId;
  if (!teamId) {
    res.status(400).json({ error: "No team associated with this manager account." });
    return;
  }

  const team = db
    .prepare(
      `SELECT t.*, (t.initial_budget - t.current_balance) AS spent_amount
       FROM teams t WHERE t.id = ?`
    )
    .get(teamId);

  const squad = db
    .prepare(
      `SELECT p.id, p.player_number, p.full_name, p.position, p.jersey_number, p.preferred_foot,
              p.photo_url, p.sold_price, pc.name AS category_name, pc.color AS category_color
       FROM players p
       JOIN player_categories pc ON pc.id = p.category_id
       WHERE p.sold_to_team_id = ? AND p.auction_status = 'sold'
       ORDER BY p.sold_price DESC`
    )
    .all(teamId);

  const bids = db
    .prepare(
      `SELECT b.*, p.player_number, p.full_name AS player_name, p.position,
              ap.status AS lot_status, ap.winning_bid, ap.winning_team_id
       FROM bids b
       JOIN players p ON p.id = b.player_id
       JOIN auction_players ap ON ap.id = b.auction_player_id
       WHERE b.team_id = ?
       ORDER BY b.id DESC LIMIT 100`
    )
    .all(teamId);

  const transactions = db
    .prepare(
      `SELECT * FROM team_transactions
       WHERE team_id = ?
       ORDER BY id DESC LIMIT 100`
    )
    .all(teamId);

  const notifications = db
    .prepare(
      `SELECT * FROM notifications
       WHERE recipient_team_id = ? OR (recipient_team_id IS NULL AND recipient_user_id IS NULL)
       ORDER BY id DESC LIMIT 30`
    )
    .all(teamId);

  const auctionHistory = db
    .prepare(
      `SELECT ap.*, p.player_number, p.full_name AS player_name, p.position, p.photo_url,
              t.name AS winning_team_name, t.short_code AS winning_team_code
       FROM auction_players ap
       JOIN players p ON p.id = ap.player_id
       LEFT JOIN teams t ON t.id = ap.winning_team_id
       WHERE ap.status IN ('sold', 'unsold')
       ORDER BY ap.id DESC LIMIT 50`
    )
    .all();

  res.json({
    team,
    squad,
    bids,
    transactions,
    notifications,
    auctionHistory,
    liveState: getPublicAuctionState(db),
  });
});

router.post("/bid", (req, res) => {
  const schema = z.object({
    amount: z.coerce.number().int().positive("Bid amount must be a positive integer"),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid bid amount" });
    return;
  }

  const teamId = req.user!.teamId;
  if (!teamId) {
    res.status(403).json({ error: "No team assigned to this user." });
    return;
  }

  try {
    const db = getDb();
    const io = req.app.get("io");
    const result = placeBid(db, io, {
      teamId,
      userId: req.user!.id,
      amount: parsed.data.amount,
      ipAddress: req.ip,
    });
    res.json({ ok: true, bid: result });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Bid rejected" });
  }
});

router.post("/notifications/read", (req, res) => {
  const db = getDb();
  if (req.user?.teamId) {
    db.prepare("UPDATE notifications SET is_read = 1 WHERE recipient_team_id = ?").run(req.user.teamId);
  }
  res.json({ ok: true });
});

export default router;
