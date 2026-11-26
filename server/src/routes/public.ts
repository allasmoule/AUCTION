import { Router } from "express";
import { getDb } from "../db/database.js";
import { getPublicAuctionState } from "../engine/auctionEngine.js";

const router = Router();

router.get("/state", (_req, res) => {
  const db = getDb();
  res.json(getPublicAuctionState(db));
});

router.get("/players", (_req, res) => {
  const db = getDb();
  const players = db
    .prepare(
      `SELECT p.id, p.player_number, p.full_name, p.position, p.jersey_number, p.preferred_foot,
              p.room_number, p.additional_info, p.photo_url, p.is_claimed, p.auction_status,
              p.sold_price, p.sold_to_team_id,
              pc.id AS category_id, pc.name AS category_name, pc.base_price, pc.color AS category_color,
              t.name AS sold_team_name, t.short_code AS sold_team_code, t.logo_url AS sold_team_logo
       FROM players p
       JOIN player_categories pc ON pc.id = p.category_id
       LEFT JOIN teams t ON t.id = p.sold_to_team_id
       ORDER BY p.id ASC`
    )
    .all();
  res.json({ players });
});

router.get("/teams", (_req, res) => {
  const db = getDb();
  const teams = db
    .prepare(
      `SELECT t.id, t.name, t.short_code, t.logo_url, t.manager_name, t.initial_budget, t.current_balance, t.status,
              (t.initial_budget - t.current_balance) AS spent_amount
       FROM teams t
       ORDER BY t.name ASC`
    )
    .all() as Array<Record<string, unknown>>;

  const playersByTeam = db
    .prepare(
      `SELECT p.id, p.player_number, p.full_name, p.position, p.jersey_number, p.photo_url, p.sold_price, p.sold_to_team_id,
              pc.name AS category_name, pc.color AS category_color
       FROM players p
       JOIN player_categories pc ON pc.id = p.category_id
       WHERE p.auction_status = 'sold' AND p.sold_to_team_id IS NOT NULL
       ORDER BY p.sold_price DESC`
    )
    .all() as Array<{ sold_to_team_id: number } & Record<string, unknown>>;

  const result = teams.map((team) => ({
    ...team,
    squad: playersByTeam.filter((p) => p.sold_to_team_id === team.id),
  }));

  res.json({ teams: result });
});

router.get("/categories", (_req, res) => {
  const db = getDb();
  const categories = db
    .prepare("SELECT * FROM player_categories WHERE status = 'active' ORDER BY sort_order ASC, id ASC")
    .all();
  res.json({ categories });
});

export default router;
