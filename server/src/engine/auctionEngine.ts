import type Database from "better-sqlite3";
import type { Server as SocketIOServer } from "socket.io";
import { createNotification, logActivity } from "../utils/audit.js";

export interface ActorInfo {
  id: number | null;
  username: string;
  role: string;
  ipAddress?: string;
}

export interface LastAuctionResult {
  auctionPlayerId: number;
  playerId: number;
  playerNumber: string;
  playerName: string;
  playerPhoto: string | null;
  position: string;
  categoryName: string;
  outcome: "sold" | "unsold";
  winningBid: number | null;
  winningTeamId: number | null;
  winningTeamName: string | null;
  winningTeamLogo: string | null;
  endedAt: string;
}

let lastResult: LastAuctionResult | null = null;
let autoNextTimeout: NodeJS.Timeout | null = null;
let engineInterval: NodeJS.Timeout | null = null;
let lastBroadcastSecond = -1;

export function clearAutoNextTimer(): void {
  if (autoNextTimeout) {
    clearTimeout(autoNextTimeout);
    autoNextTimeout = null;
  }
}

export function getPublicAuctionState(db: Database.Database) {
  const settings = db
    .prepare("SELECT * FROM auction_settings WHERE id = 1")
    .get() as Record<string, unknown>;

  const currentAuction = settings?.current_auction_id
    ? (db.prepare("SELECT * FROM auctions WHERE id = ?").get(settings.current_auction_id) as Record<string, unknown> | undefined)
    : undefined;

  const activeLot = db
    .prepare(
      `SELECT ap.*,
              p.player_number, p.full_name, p.position, p.jersey_number, p.preferred_foot, p.room_number, p.photo_url, p.additional_info,
              pc.color AS category_color,
              t.name AS highest_team_name, t.short_code AS highest_team_code, t.logo_url AS highest_team_logo
       FROM auction_players ap
       JOIN players p ON p.id = ap.player_id
       LEFT JOIN player_categories pc ON pc.id = p.category_id
       LEFT JOIN teams t ON t.id = ap.highest_bidder_team_id
       WHERE ap.status IN ('live', 'paused')
       ORDER BY ap.id DESC
       LIMIT 1`
    )
    .get() as Record<string, unknown> | undefined;

  let currentLot: Record<string, unknown> | null = null;
  if (activeLot) {
    const bids = db
      .prepare(
        `SELECT b.id, b.amount, b.created_at, b.team_id, t.name AS team_name, t.short_code AS team_code, t.logo_url AS team_logo
         FROM bids b
         JOIN teams t ON t.id = b.team_id
         WHERE b.auction_player_id = ?
         ORDER BY b.amount DESC, b.id DESC
         LIMIT 25`
      )
      .all(activeLot.id);

    const nowMs = Date.now();
    const remainingSeconds =
      activeLot.status === "paused"
        ? Math.max(0, Math.ceil(Number(activeLot.remaining_seconds_when_paused || 0)))
        : Math.max(0, Math.ceil((Number(activeLot.timer_ends_at || 0) - nowMs) / 1000));

    const nextMinimumBid =
      Number(activeLot.total_bids) === 0
        ? Number(activeLot.starting_price_snapshot)
        : Number(activeLot.current_highest_bid) + Number(activeLot.min_increment_snapshot);

    currentLot = {
      ...activeLot,
      remaining_seconds: remainingSeconds,
      next_minimum_bid: nextMinimumBid,
      bids,
    };
  }

  const queue = db
    .prepare(
      `SELECT ap.id AS auction_player_id, ap.lot_order, ap.starting_price_snapshot, ap.min_increment_snapshot,
              p.id AS player_id, p.player_number, p.full_name, p.position, p.photo_url,
              pc.name AS category_name, pc.color AS category_color
       FROM auction_players ap
       JOIN players p ON p.id = ap.player_id
       LEFT JOIN player_categories pc ON pc.id = p.category_id
       WHERE ap.status = 'pending'
       ORDER BY ap.lot_order ASC, ap.id ASC`
    )
    .all();

  const teams = db
    .prepare(
      `SELECT t.id, t.name, t.short_code, t.logo_url, t.manager_name, t.initial_budget, t.current_balance, t.status,
              (t.initial_budget - t.current_balance) AS spent_amount,
              (SELECT COUNT(*) FROM players p WHERE p.sold_to_team_id = t.id AND p.auction_status = 'sold') AS players_count
       FROM teams t
       ORDER BY t.name ASC`
    )
    .all();

  const recentSold = db
    .prepare(
      `SELECT p.id, p.player_number, p.full_name, p.position, p.photo_url, p.sold_price,
              pc.name AS category_name, pc.color AS category_color,
              t.id AS team_id, t.name AS team_name, t.short_code AS team_code, t.logo_url AS team_logo,
              ap.ended_at
       FROM auction_players ap
       JOIN players p ON p.id = ap.player_id
       LEFT JOIN player_categories pc ON pc.id = p.category_id
       LEFT JOIN teams t ON t.id = ap.winning_team_id
       WHERE ap.status = 'sold'
       ORDER BY ap.id DESC
       LIMIT 12`
    )
    .all();

  const recentUnsold = db
    .prepare(
      `SELECT p.id, p.player_number, p.full_name, p.position, p.photo_url,
              pc.name AS category_name, pc.color AS category_color,
              ap.starting_price_snapshot, ap.ended_at
       FROM auction_players ap
       JOIN players p ON p.id = ap.player_id
       LEFT JOIN player_categories pc ON pc.id = p.category_id
       WHERE ap.status = 'unsold'
       ORDER BY ap.id DESC
       LIMIT 12`
    )
    .all();

  const recentActivity = db
    .prepare(
      `SELECT b.id, b.amount, b.created_at, p.full_name AS player_name, p.player_number,
              t.name AS team_name, t.short_code AS team_code
       FROM bids b
       JOIN players p ON p.id = b.player_id
       JOIN teams t ON t.id = b.team_id
       ORDER BY b.id DESC
       LIMIT 15`
    )
    .all();

  return {
    serverNow: Date.now(),
    settings,
    auction: currentAuction || null,
    currentLot,
    lastResult,
    queue,
    teams,
    recentSold,
    recentUnsold,
    recentActivity,
  };
}

export function broadcastState(db: Database.Database, io: SocketIOServer | null): void {
  if (!io) return;
  io.emit("auction:state", getPublicAuctionState(db));
}

export function queuePlayerForAuction(
  db: Database.Database,
  io: SocketIOServer | null,
  playerId: number,
  actor: ActorInfo
) {
  const tx = db.transaction(() => {
    const settings = db.prepare("SELECT * FROM auction_settings WHERE id = 1").get() as {
      current_auction_id: number | null;
      default_duration_seconds: number;
      default_starting_price: number;
      default_min_increment: number;
    };
    const player = db
      .prepare(
        `SELECT p.*, pc.name AS category_name, pc.base_price, pc.min_increment, pc.custom_duration_seconds
         FROM players p
         JOIN player_categories pc ON pc.id = p.category_id
         WHERE p.id = ?`
      )
      .get(playerId) as
      | {
          id: number;
          player_number: string;
          full_name: string;
          auction_status: string;
          category_name: string;
          base_price: number;
          min_increment: number;
          custom_duration_seconds: number | null;
        }
      | undefined;

    if (!player) throw new Error("Player not found");
    if (player.auction_status === "live" || player.auction_status === "queued") {
      throw new Error("Player is already queued or live in the auction");
    }
    if (player.auction_status === "sold") {
      throw new Error("Player is already sold. Use Re-Auction/Refund if you want to return them to the pool.");
    }

    const maxOrder = (
      db.prepare("SELECT COALESCE(MAX(lot_order), 0) AS m FROM auction_players").get() as { m: number }
    ).m;

    const duration = player.custom_duration_seconds || settings.default_duration_seconds || 60;
    const startPrice = player.base_price ?? settings.default_starting_price ?? 2000;
    const minInc = player.min_increment || settings.default_min_increment || 500;

    const info = db
      .prepare(
        `INSERT INTO auction_players (
          auction_id, player_id, lot_order, category_name_snapshot,
          starting_price_snapshot, min_increment_snapshot, duration_seconds_snapshot, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`
      )
      .run(
        settings.current_auction_id || 1,
        player.id,
        maxOrder + 1,
        player.category_name,
        startPrice,
        minInc,
        duration
      );

    db.prepare("UPDATE players SET auction_status = 'queued', updated_at = datetime('now') WHERE id = ?").run(player.id);

    logActivity(db, {
      actorUserId: actor.id,
      actorUsername: actor.username,
      actorRole: actor.role,
      action: "PLAYER_QUEUED",
      entityType: "auction_player",
      entityId: Number(info.lastInsertRowid),
      details: { playerId: player.id, playerName: player.full_name },
      ipAddress: actor.ipAddress,
    });

    return Number(info.lastInsertRowid);
  }).immediate();

  broadcastState(db, io);
  return tx;
}

export function startPlayerAuction(
  db: Database.Database,
  io: SocketIOServer | null,
  playerId: number,
  actor: ActorInfo,
  overrides?: { startingPrice?: number; durationSeconds?: number; minIncrement?: number }
) {
  clearAutoNextTimer();
  lastResult = null;

  const result = db.transaction(() => {
    const existingActive = db
      .prepare("SELECT id FROM auction_players WHERE status IN ('live', 'paused') LIMIT 1")
      .get();
    if (existingActive) {
      throw new Error("Another player auction is currently active or paused. Complete or resolve it first.");
    }

    const settings = db.prepare("SELECT * FROM auction_settings WHERE id = 1").get() as {
      current_auction_id: number | null;
      default_duration_seconds: number;
      default_starting_price: number;
      default_min_increment: number;
    };

    const player = db
      .prepare(
        `SELECT p.*, pc.name AS category_name, pc.base_price, pc.min_increment, pc.custom_duration_seconds
         FROM players p
         JOIN player_categories pc ON pc.id = p.category_id
         WHERE p.id = ?`
      )
      .get(playerId) as
      | {
          id: number;
          player_number: string;
          full_name: string;
          auction_status: string;
          category_name: string;
          base_price: number;
          min_increment: number;
          custom_duration_seconds: number | null;
        }
      | undefined;

    if (!player) throw new Error("Player not found");
    if (player.auction_status === "sold") {
      throw new Error("Player is already sold.");
    }

    // Reuse pending lot if queued, otherwise create a new lot
    const pendingLot = db
      .prepare("SELECT id FROM auction_players WHERE player_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1")
      .get(player.id) as { id: number } | undefined;

    const duration = overrides?.durationSeconds ?? player.custom_duration_seconds ?? settings.default_duration_seconds ?? 60;
    const startPrice = overrides?.startingPrice ?? player.base_price ?? settings.default_starting_price ?? 2000;
    const minInc = overrides?.minIncrement ?? player.min_increment ?? settings.default_min_increment ?? 500;
    const endsAt = Date.now() + duration * 1000;

    let lotId: number;
    if (pendingLot) {
      lotId = pendingLot.id;
      db.prepare(
        `UPDATE auction_players
         SET status = 'live',
             category_name_snapshot = ?,
             starting_price_snapshot = ?,
             min_increment_snapshot = ?,
             duration_seconds_snapshot = ?,
             started_at = datetime('now'),
             timer_ends_at = ?,
             remaining_seconds_when_paused = NULL
         WHERE id = ?`
      ).run(player.category_name, startPrice, minInc, duration, endsAt, lotId);
    } else {
      const maxOrder = (
        db.prepare("SELECT COALESCE(MAX(lot_order), 0) AS m FROM auction_players").get() as { m: number }
      ).m;
      const info = db
        .prepare(
          `INSERT INTO auction_players (
            auction_id, player_id, lot_order, category_name_snapshot,
            starting_price_snapshot, min_increment_snapshot, duration_seconds_snapshot,
            status, started_at, timer_ends_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'live', datetime('now'), ?)`
        )
        .run(
          settings.current_auction_id || 1,
          player.id,
          maxOrder + 1,
          player.category_name,
          startPrice,
          minInc,
          duration,
          endsAt
        );
      lotId = Number(info.lastInsertRowid);
    }

    db.prepare("UPDATE players SET auction_status = 'live', updated_at = datetime('now') WHERE id = ?").run(player.id);
    db.prepare("UPDATE auction_settings SET auction_status = 'live', updated_at = datetime('now') WHERE id = 1").run();
    if (settings.current_auction_id) {
      db.prepare(
        "UPDATE auctions SET status = 'live', started_at = COALESCE(started_at, datetime('now')) WHERE id = ?"
      ).run(settings.current_auction_id);
    }

    logActivity(db, {
      actorUserId: actor.id,
      actorUsername: actor.username,
      actorRole: actor.role,
      action: "AUCTION_LOT_STARTED",
      entityType: "auction_player",
      entityId: lotId,
      details: { playerId: player.id, playerName: player.full_name, startPrice, duration, minInc },
      ipAddress: actor.ipAddress,
    });

    createNotification(db, io, {
      type: "auction_started",
      title: "Player On The Block",
      message: `${player.full_name} (${player.player_number}) is now live! Base price ৳${startPrice.toLocaleString()}`,
      payload: { lotId, playerId: player.id },
    });

    return lotId;
  }).immediate();

  broadcastState(db, io);
  return result;
}

export function placeBid(
  db: Database.Database,
  io: SocketIOServer | null,
  params: { teamId: number; userId: number; amount: number; ipAddress?: string }
) {
  const outcome = db.transaction(() => {
    const lot = db
      .prepare(
        `SELECT ap.*, p.full_name AS player_name, p.player_number
         FROM auction_players ap
         JOIN players p ON p.id = ap.player_id
         WHERE ap.status = 'live'
         ORDER BY ap.id DESC LIMIT 1`
      )
      .get() as
      | {
          id: number;
          player_id: number;
          player_name: string;
          player_number: string;
          starting_price_snapshot: number;
          min_increment_snapshot: number;
          current_highest_bid: number;
          highest_bidder_team_id: number | null;
          total_bids: number;
          timer_ends_at: number;
        }
      | undefined;

    if (!lot) {
      throw new Error("No live player auction is currently running.");
    }

    const nowMs = Date.now();
    if (!lot.timer_ends_at || nowMs > lot.timer_ends_at) {
      throw new Error("Bidding time for this player has already expired.");
    }

    const team = db
      .prepare("SELECT id, name, short_code, current_balance, status FROM teams WHERE id = ?")
      .get(params.teamId) as
      | { id: number; name: string; short_code: string; current_balance: number; status: string }
      | undefined;

    if (!team) {
      throw new Error("Team account not found.");
    }
    if (team.status !== "active") {
      throw new Error("Your team is currently inactive or suspended from bidding.");
    }
    if (lot.highest_bidder_team_id === team.id) {
      throw new Error("You already hold the highest bid for this player.");
    }

    const bidAmount = Math.floor(Number(params.amount));
    if (!Number.isFinite(bidAmount) || bidAmount <= 0) {
      throw new Error("Invalid bid amount.");
    }

    const requiredMin =
      lot.total_bids === 0
        ? lot.starting_price_snapshot
        : lot.current_highest_bid + lot.min_increment_snapshot;

    if (bidAmount < requiredMin) {
      throw new Error(`Minimum valid bid is ৳${requiredMin.toLocaleString()}.`);
    }

    if (team.current_balance < bidAmount) {
      throw new Error(
        `Insufficient budget. Your remaining balance is ৳${team.current_balance.toLocaleString()}.`
      );
    }

    const previousLeaderTeamId = lot.highest_bidder_team_id;

    const bidInfo = db
      .prepare(
        `INSERT INTO bids (auction_player_id, player_id, team_id, placed_by_user_id, amount)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(lot.id, lot.player_id, team.id, params.userId, bidAmount);

    // Anti-sniping check
    const settings = db.prepare("SELECT * FROM auction_settings WHERE id = 1").get() as {
      anti_sniping_enabled: number;
      anti_sniping_threshold_seconds: number;
      anti_sniping_extension_seconds: number;
    };

    let newTimerEndsAt = lot.timer_ends_at;
    let extended = false;
    const remainingSec = (lot.timer_ends_at - nowMs) / 1000;
    if (settings.anti_sniping_enabled && remainingSec <= settings.anti_sniping_threshold_seconds) {
      newTimerEndsAt = Math.max(lot.timer_ends_at, nowMs + settings.anti_sniping_extension_seconds * 1000);
      extended = true;
    }

    db.prepare(
      `UPDATE auction_players
       SET current_highest_bid = ?,
           highest_bidder_team_id = ?,
           total_bids = total_bids + 1,
           timer_ends_at = ?
       WHERE id = ?`
    ).run(bidAmount, team.id, newTimerEndsAt, lot.id);

    logActivity(db, {
      actorUserId: params.userId,
      actorUsername: team.name,
      actorRole: "team_manager",
      action: "BID_PLACED",
      entityType: "bid",
      entityId: Number(bidInfo.lastInsertRowid),
      details: {
        auctionPlayerId: lot.id,
        playerId: lot.player_id,
        playerName: lot.player_name,
        teamId: team.id,
        amount: bidAmount,
        extended,
      },
      ipAddress: params.ipAddress,
    });

    createNotification(db, io, {
      type: "new_highest_bid",
      title: "New Highest Bid",
      message: `${team.name} bid ৳${bidAmount.toLocaleString()} for ${lot.player_name}`,
      payload: { lotId: lot.id, teamId: team.id, amount: bidAmount },
    });

    if (previousLeaderTeamId && previousLeaderTeamId !== team.id) {
      createNotification(db, io, {
        recipientTeamId: previousLeaderTeamId,
        type: "outbid",
        title: "You Have Been Outbid!",
        message: `${team.name} outbid you with ৳${bidAmount.toLocaleString()} for ${lot.player_name}`,
        payload: { lotId: lot.id, playerId: lot.player_id, amount: bidAmount },
      });
    }

    return {
      bidId: Number(bidInfo.lastInsertRowid),
      lotId: lot.id,
      amount: bidAmount,
      teamId: team.id,
      teamName: team.name,
      extended,
      newTimerEndsAt,
    };
  }).immediate();

  if (io) {
    io.emit("auction:bid_placed", outcome);
  }
  broadcastState(db, io);
  return outcome;
}

export function pauseAuction(db: Database.Database, io: SocketIOServer | null, actor: ActorInfo) {
  clearAutoNextTimer();
  const tx = db.transaction(() => {
    const lot = db
      .prepare("SELECT id, timer_ends_at, player_id FROM auction_players WHERE status = 'live' ORDER BY id DESC LIMIT 1")
      .get() as { id: number; timer_ends_at: number; player_id: number } | undefined;

    if (!lot) throw new Error("No live auction lot to pause.");

    const remaining = Math.max(1, (lot.timer_ends_at - Date.now()) / 1000);
    db.prepare(
      "UPDATE auction_players SET status = 'paused', remaining_seconds_when_paused = ? WHERE id = ?"
    ).run(remaining, lot.id);
    db.prepare("UPDATE auction_settings SET auction_status = 'paused', updated_at = datetime('now') WHERE id = 1").run();

    logActivity(db, {
      actorUserId: actor.id,
      actorUsername: actor.username,
      actorRole: actor.role,
      action: "AUCTION_PAUSED",
      entityType: "auction_player",
      entityId: lot.id,
      details: { remainingSeconds: Math.ceil(remaining) },
      ipAddress: actor.ipAddress,
    });

    createNotification(db, io, {
      type: "auction_paused",
      title: "Auction Paused",
      message: "The live auction has been paused by the administrator.",
    });

    return { lotId: lot.id, remainingSeconds: Math.ceil(remaining) };
  }).immediate();

  broadcastState(db, io);
  return tx;
}

export function resumeAuction(db: Database.Database, io: SocketIOServer | null, actor: ActorInfo) {
  const tx = db.transaction(() => {
    const lot = db
      .prepare(
        "SELECT id, remaining_seconds_when_paused FROM auction_players WHERE status = 'paused' ORDER BY id DESC LIMIT 1"
      )
      .get() as { id: number; remaining_seconds_when_paused: number | null } | undefined;

    if (!lot) throw new Error("No paused auction lot to resume.");

    const remaining = Math.max(1, Number(lot.remaining_seconds_when_paused || 15));
    const newEndsAt = Date.now() + remaining * 1000;

    db.prepare(
      "UPDATE auction_players SET status = 'live', timer_ends_at = ?, remaining_seconds_when_paused = NULL WHERE id = ?"
    ).run(newEndsAt, lot.id);
    db.prepare("UPDATE auction_settings SET auction_status = 'live', updated_at = datetime('now') WHERE id = 1").run();

    logActivity(db, {
      actorUserId: actor.id,
      actorUsername: actor.username,
      actorRole: actor.role,
      action: "AUCTION_RESUMED",
      entityType: "auction_player",
      entityId: lot.id,
      details: { remainingSeconds: Math.ceil(remaining) },
      ipAddress: actor.ipAddress,
    });

    createNotification(db, io, {
      type: "auction_resumed",
      title: "Auction Resumed",
      message: "Bidding has resumed!",
    });

    return { lotId: lot.id, remainingSeconds: Math.ceil(remaining) };
  }).immediate();

  broadcastState(db, io);
  return tx;
}

export function extendActiveTimer(
  db: Database.Database,
  io: SocketIOServer | null,
  extraSeconds: number,
  actor: ActorInfo
) {
  const tx = db.transaction(() => {
    const lot = db
      .prepare(
        "SELECT id, status, timer_ends_at, remaining_seconds_when_paused FROM auction_players WHERE status IN ('live', 'paused') ORDER BY id DESC LIMIT 1"
      )
      .get() as
      | { id: number; status: string; timer_ends_at: number; remaining_seconds_when_paused: number | null }
      | undefined;

    if (!lot) throw new Error("No active or paused auction lot.");

    if (lot.status === "paused") {
      const nextRem = Math.max(5, Number(lot.remaining_seconds_when_paused || 0) + extraSeconds);
      db.prepare("UPDATE auction_players SET remaining_seconds_when_paused = ? WHERE id = ?").run(nextRem, lot.id);
    } else {
      const base = Math.max(Date.now(), Number(lot.timer_ends_at || Date.now()));
      const nextEnds = base + extraSeconds * 1000;
      db.prepare("UPDATE auction_players SET timer_ends_at = ? WHERE id = ?").run(nextEnds, lot.id);
    }

    logActivity(db, {
      actorUserId: actor.id,
      actorUsername: actor.username,
      actorRole: actor.role,
      action: "AUCTION_TIMER_ADJUSTED",
      entityType: "auction_player",
      entityId: lot.id,
      details: { extraSeconds },
      ipAddress: actor.ipAddress,
    });
  }).immediate();

  broadcastState(db, io);
  return tx;
}

export function finalizeActiveLot(
  db: Database.Database,
  io: SocketIOServer | null,
  mode: "auto" | "manual_sold" | "manual_unsold",
  actor: ActorInfo
): LastAuctionResult | null {
  clearAutoNextTimer();

  const settled = db.transaction(() => {
    const lot = db
      .prepare(
        `SELECT ap.*, p.player_number, p.full_name, p.position, p.photo_url
         FROM auction_players ap
         JOIN players p ON p.id = ap.player_id
         WHERE ap.status IN ('live', 'paused')
         ORDER BY ap.id DESC LIMIT 1`
      )
      .get() as
      | {
          id: number;
          player_id: number;
          player_number: string;
          full_name: string;
          position: string;
          photo_url: string | null;
          category_name_snapshot: string;
          total_bids: number;
          current_highest_bid: number;
          highest_bidder_team_id: number | null;
        }
      | undefined;

    if (!lot) return null;

    const shouldSell =
      mode === "manual_unsold"
        ? false
        : lot.total_bids > 0 && lot.highest_bidder_team_id !== null;

    if (mode === "manual_sold" && !shouldSell) {
      throw new Error("Cannot mark as SOLD because no valid bids have been placed on this player.");
    }

    const endedAt = new Date().toISOString();

    if (shouldSell && lot.highest_bidder_team_id) {
      const team = db
        .prepare("SELECT id, name, logo_url, current_balance FROM teams WHERE id = ?")
        .get(lot.highest_bidder_team_id) as {
        id: number;
        name: string;
        logo_url: string | null;
        current_balance: number;
      };

      if (!team || team.current_balance < lot.current_highest_bid) {
        throw new Error("Winning team no longer has sufficient balance to complete this purchase.");
      }

      const newBalance = team.current_balance - lot.current_highest_bid;

      db.prepare("UPDATE teams SET current_balance = ?, updated_at = datetime('now') WHERE id = ?").run(
        newBalance,
        team.id
      );

      db.prepare(
        `INSERT INTO team_transactions (
          team_id, type, amount_delta, balance_after, reference_type, reference_id, description, created_by_user_id
        ) VALUES (?, 'winning_bid', ?, ?, 'auction_player', ?, ?, ?)`
      ).run(
        team.id,
        -lot.current_highest_bid,
        newBalance,
        lot.id,
        `Won ${lot.full_name} (${lot.player_number}) in auction`,
        actor.id
      );

      db.prepare(
        `UPDATE auction_players
         SET status = 'sold',
             winning_bid = ?,
             winning_team_id = ?,
             ended_at = datetime('now'),
             remaining_seconds_when_paused = NULL
         WHERE id = ?`
      ).run(lot.current_highest_bid, team.id, lot.id);

      db.prepare(
        `UPDATE bids SET is_winning = 1
         WHERE id = (SELECT id FROM bids WHERE auction_player_id = ? ORDER BY amount DESC, id DESC LIMIT 1)`
      ).run(lot.id);

      db.prepare(
        `UPDATE players
         SET auction_status = 'sold', sold_to_team_id = ?, sold_price = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).run(team.id, lot.current_highest_bid, lot.player_id);

      logActivity(db, {
        actorUserId: actor.id,
        actorUsername: actor.username,
        actorRole: actor.role,
        action: "PLAYER_SOLD",
        entityType: "auction_player",
        entityId: lot.id,
        details: {
          playerId: lot.player_id,
          playerName: lot.full_name,
          teamId: team.id,
          teamName: team.name,
          amount: lot.current_highest_bid,
        },
        ipAddress: actor.ipAddress,
      });

      createNotification(db, io, {
        type: "player_sold",
        title: "PLAYER SOLD!",
        message: `${lot.full_name} sold to ${team.name} for ৳${lot.current_highest_bid.toLocaleString()}`,
        payload: { playerId: lot.player_id, teamId: team.id, amount: lot.current_highest_bid },
      });

      lastResult = {
        auctionPlayerId: lot.id,
        playerId: lot.player_id,
        playerNumber: lot.player_number,
        playerName: lot.full_name,
        playerPhoto: lot.photo_url,
        position: lot.position,
        categoryName: lot.category_name_snapshot,
        outcome: "sold",
        winningBid: lot.current_highest_bid,
        winningTeamId: team.id,
        winningTeamName: team.name,
        winningTeamLogo: team.logo_url,
        endedAt,
      };
    } else {
      db.prepare(
        `UPDATE auction_players
         SET status = 'unsold',
             ended_at = datetime('now'),
             remaining_seconds_when_paused = NULL
         WHERE id = ?`
      ).run(lot.id);

      db.prepare(
        `UPDATE players
         SET auction_status = 'unsold', sold_to_team_id = NULL, sold_price = NULL, updated_at = datetime('now')
         WHERE id = ?`
      ).run(lot.player_id);

      logActivity(db, {
        actorUserId: actor.id,
        actorUsername: actor.username,
        actorRole: actor.role,
        action: "PLAYER_UNSOLD",
        entityType: "auction_player",
        entityId: lot.id,
        details: { playerId: lot.player_id, playerName: lot.full_name },
        ipAddress: actor.ipAddress,
      });

      createNotification(db, io, {
        type: "player_unsold",
        title: "Player Unsold",
        message: `${lot.full_name} went unsold.`,
        payload: { playerId: lot.player_id },
      });

      lastResult = {
        auctionPlayerId: lot.id,
        playerId: lot.player_id,
        playerNumber: lot.player_number,
        playerName: lot.full_name,
        playerPhoto: lot.photo_url,
        position: lot.position,
        categoryName: lot.category_name_snapshot,
        outcome: "unsold",
        winningBid: null,
        winningTeamId: null,
        winningTeamName: null,
        winningTeamLogo: null,
        endedAt,
      };
    }

    return lastResult;
  }).immediate();

  if (settled) {
    if (io) {
      io.emit("auction:result", settled);
    }
    broadcastState(db, io);

    // Check auto-next player
    const settings = db.prepare("SELECT * FROM auction_settings WHERE id = 1").get() as {
      auto_next_player: number;
      auto_pause_between_players: number;
      auto_pause_seconds: number;
    };

    if (settings.auto_next_player) {
      const nextLot = db
        .prepare("SELECT player_id FROM auction_players WHERE status = 'pending' ORDER BY lot_order ASC, id ASC LIMIT 1")
        .get() as { player_id: number } | undefined;

      if (nextLot) {
        const delayMs = settings.auto_pause_between_players
          ? Math.max(2, settings.auto_pause_seconds || 5) * 1000
          : 2000;
        autoNextTimeout = setTimeout(() => {
          try {
            startPlayerAuction(db, io, nextLot.player_id, {
              id: null,
              username: "auction-engine",
              role: "system",
            });
          } catch (err) {
            console.error("[auctionEngine] auto-next failed:", err);
          }
        }, delayMs);
      } else {
        db.prepare("UPDATE auction_settings SET auction_status = 'completed', updated_at = datetime('now') WHERE id = 1").run();
        broadcastState(db, io);
      }
    } else {
      db.prepare("UPDATE auction_settings SET auction_status = 'paused', updated_at = datetime('now') WHERE id = 1").run();
      broadcastState(db, io);
    }
  }

  return settled;
}

export function refundAndReauctionPlayer(
  db: Database.Database,
  io: SocketIOServer | null,
  playerId: number,
  actor: ActorInfo
) {
  const res = db.transaction(() => {
    const player = db.prepare("SELECT * FROM players WHERE id = ?").get(playerId) as
      | {
          id: number;
          player_number: string;
          full_name: string;
          auction_status: string;
          sold_to_team_id: number | null;
          sold_price: number | null;
        }
      | undefined;

    if (!player) throw new Error("Player not found");
    if (player.auction_status === "live") throw new Error("Cannot reset a currently live player");

    if (player.auction_status === "sold" && player.sold_to_team_id && player.sold_price) {
      const team = db
        .prepare("SELECT id, current_balance FROM teams WHERE id = ?")
        .get(player.sold_to_team_id) as { id: number; current_balance: number } | undefined;
      if (team) {
        const newBal = team.current_balance + player.sold_price;
        db.prepare("UPDATE teams SET current_balance = ?, updated_at = datetime('now') WHERE id = ?").run(
          newBal,
          team.id
        );
        db.prepare(
          `INSERT INTO team_transactions (
            team_id, type, amount_delta, balance_after, reference_type, reference_id, description, created_by_user_id
          ) VALUES (?, 'refund', ?, ?, 'player', ?, ?, ?)`
        ).run(
          team.id,
          player.sold_price,
          newBal,
          player.id,
          `Refund for re-auction of ${player.full_name} (${player.player_number})`,
          actor.id
        );
      }
    }

    db.prepare(
      `UPDATE players
       SET auction_status = 'unauctioned', sold_to_team_id = NULL, sold_price = NULL, updated_at = datetime('now')
       WHERE id = ?`
    ).run(player.id);

    logActivity(db, {
      actorUserId: actor.id,
      actorUsername: actor.username,
      actorRole: actor.role,
      action: "PLAYER_RESET_FOR_REAUCTION",
      entityType: "player",
      entityId: player.id,
      details: { playerName: player.full_name, previousStatus: player.auction_status },
      ipAddress: actor.ipAddress,
    });
  }).immediate();

  broadcastState(db, io);
  return res;
}

export function startAuctionTicker(db: Database.Database, io: SocketIOServer): void {
  if (engineInterval) clearInterval(engineInterval);
  engineInterval = setInterval(() => {
    try {
      const liveLot = db
        .prepare("SELECT id, timer_ends_at FROM auction_players WHERE status = 'live' ORDER BY id DESC LIMIT 1")
        .get() as { id: number; timer_ends_at: number } | undefined;

      if (!liveLot) {
        lastBroadcastSecond = -1;
        return;
      }

      const remainingMs = liveLot.timer_ends_at - Date.now();
      const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));

      if (remainingMs <= 0) {
        finalizeActiveLot(db, io, "auto", {
          id: null,
          username: "auction-timer",
          role: "system",
        });
        lastBroadcastSecond = -1;
        return;
      }

      if (remainingSeconds !== lastBroadcastSecond) {
        lastBroadcastSecond = remainingSeconds;
        io.emit("auction:tick", {
          lotId: liveLot.id,
          remainingSeconds,
          timerEndsAt: liveLot.timer_ends_at,
          serverNow: Date.now(),
        });
      }
    } catch (err) {
      console.error("[auctionTicker] error:", err);
    }
  }, 250);
}

export function stopAuctionTicker(): void {
  clearAutoNextTimer();
  if (engineInterval) {
    clearInterval(engineInterval);
    engineInterval = null;
  }
}
