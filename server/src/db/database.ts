import Database from "better-sqlite3";
import { config, ensureDirectories } from "../config.js";

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!dbInstance) {
    throw new Error("Database has not been initialized. Call initDatabase() first.");
  }
  return dbInstance;
}

export function initDatabase(customPath?: string): Database.Database {
  if (dbInstance && !customPath) return dbInstance;
  ensureDirectories();
  const targetPath = customPath || config.dbPath;
  const db = new Database(targetPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  createSchema(db);
  dbInstance = db;
  return db;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

export function createSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      short_code TEXT NOT NULL UNIQUE,
      logo_url TEXT,
      manager_name TEXT NOT NULL,
      initial_budget INTEGER NOT NULL DEFAULT 0 CHECK (initial_budget >= 0),
      current_balance INTEGER NOT NULL DEFAULT 0 CHECK (current_balance >= 0),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS player_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      base_price INTEGER NOT NULL CHECK (base_price >= 0),
      min_increment INTEGER NOT NULL DEFAULT 500 CHECK (min_increment > 0),
      custom_duration_seconds INTEGER CHECK (custom_duration_seconds IS NULL OR custom_duration_seconds >= 10),
      description TEXT DEFAULT '',
      color TEXT DEFAULT '#FABD2F',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_number TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      category_id INTEGER NOT NULL REFERENCES player_categories(id),
      position TEXT NOT NULL,
      jersey_number TEXT DEFAULT '',
      preferred_foot TEXT DEFAULT '',
      room_number TEXT DEFAULT '',
      contact_phone TEXT DEFAULT '',
      payment_method TEXT DEFAULT '',
      payment_status TEXT DEFAULT '',
      additional_info TEXT DEFAULT '',
      photo_url TEXT,
      registered_at TEXT,
      claim_code_hash TEXT NOT NULL,
      claim_code_plain TEXT,
      is_claimed INTEGER NOT NULL DEFAULT 0 CHECK (is_claimed IN (0, 1)),
      claimed_by_user_id INTEGER,
      auction_status TEXT NOT NULL DEFAULT 'unauctioned' CHECK (auction_status IN ('unauctioned', 'queued', 'live', 'sold', 'unsold')),
      sold_to_team_id INTEGER REFERENCES teams(id),
      sold_price INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('super_admin', 'team_manager', 'player')),
      display_name TEXT NOT NULL,
      team_id INTEGER UNIQUE REFERENCES teams(id) ON DELETE CASCADE,
      player_id INTEGER UNIQUE REFERENCES players(id) ON DELETE CASCADE,
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS player_claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      verification_method TEXT NOT NULL DEFAULT 'claim_code_and_phone',
      status TEXT NOT NULL DEFAULT 'verified' CHECK (status IN ('verified', 'rejected', 'revoked')),
      ip_address TEXT DEFAULT '',
      claimed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS player_profile_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      submitted_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      proposed_full_name TEXT,
      proposed_position TEXT,
      proposed_jersey_number TEXT,
      proposed_preferred_foot TEXT,
      proposed_additional_info TEXT,
      proposed_photo_url TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      reviewed_by_user_id INTEGER REFERENCES users(id),
      review_note TEXT DEFAULT '',
      reviewed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS auctions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'live', 'paused', 'completed')),
      started_at TEXT,
      ended_at TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS auction_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      auction_title TEXT NOT NULL DEFAULT 'YKSG NB-3 PLAYER AUCTION',
      default_duration_seconds INTEGER NOT NULL DEFAULT 60 CHECK (default_duration_seconds >= 10),
      default_starting_price INTEGER NOT NULL DEFAULT 2000 CHECK (default_starting_price >= 0),
      default_min_increment INTEGER NOT NULL DEFAULT 500 CHECK (default_min_increment > 0),
      anti_sniping_enabled INTEGER NOT NULL DEFAULT 1 CHECK (anti_sniping_enabled IN (0, 1)),
      anti_sniping_threshold_seconds INTEGER NOT NULL DEFAULT 10 CHECK (anti_sniping_threshold_seconds >= 1),
      anti_sniping_extension_seconds INTEGER NOT NULL DEFAULT 15 CHECK (anti_sniping_extension_seconds >= 1),
      auto_next_player INTEGER NOT NULL DEFAULT 0 CHECK (auto_next_player IN (0, 1)),
      auto_pause_between_players INTEGER NOT NULL DEFAULT 1 CHECK (auto_pause_between_players IN (0, 1)),
      auto_pause_seconds INTEGER NOT NULL DEFAULT 8 CHECK (auto_pause_seconds >= 0),
      scheduled_start_at TEXT,
      auction_status TEXT NOT NULL DEFAULT 'draft' CHECK (auction_status IN ('draft', 'scheduled', 'live', 'paused', 'completed')),
      current_auction_id INTEGER REFERENCES auctions(id),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS auction_players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      auction_id INTEGER NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      lot_order INTEGER NOT NULL DEFAULT 0,
      category_name_snapshot TEXT NOT NULL,
      starting_price_snapshot INTEGER NOT NULL CHECK (starting_price_snapshot >= 0),
      min_increment_snapshot INTEGER NOT NULL CHECK (min_increment_snapshot > 0),
      duration_seconds_snapshot INTEGER NOT NULL CHECK (duration_seconds_snapshot >= 10),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'live', 'paused', 'sold', 'unsold')),
      current_highest_bid INTEGER NOT NULL DEFAULT 0,
      highest_bidder_team_id INTEGER REFERENCES teams(id),
      winning_bid INTEGER,
      winning_team_id INTEGER REFERENCES teams(id),
      total_bids INTEGER NOT NULL DEFAULT 0,
      started_at TEXT,
      ended_at TEXT,
      timer_ends_at INTEGER,
      remaining_seconds_when_paused REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bids (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      auction_player_id INTEGER NOT NULL REFERENCES auction_players(id) ON DELETE CASCADE,
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      placed_by_user_id INTEGER NOT NULL REFERENCES users(id),
      amount INTEGER NOT NULL CHECK (amount > 0),
      is_winning INTEGER NOT NULL DEFAULT 0 CHECK (is_winning IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS team_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('initial_allocation', 'budget_adjustment', 'winning_bid', 'refund')),
      amount_delta INTEGER NOT NULL,
      balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
      reference_type TEXT DEFAULT '',
      reference_id INTEGER,
      description TEXT NOT NULL,
      created_by_user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      recipient_role TEXT,
      recipient_team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      payload_json TEXT DEFAULT '{}',
      is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_username TEXT DEFAULT 'system',
      actor_role TEXT DEFAULT 'system',
      action TEXT NOT NULL,
      entity_type TEXT DEFAULT '',
      entity_id INTEGER,
      details_json TEXT DEFAULT '{}',
      ip_address TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_players_category ON players(category_id);
    CREATE INDEX IF NOT EXISTS idx_players_status ON players(auction_status);
    CREATE INDEX IF NOT EXISTS idx_players_claimed ON players(is_claimed);
    CREATE INDEX IF NOT EXISTS idx_auction_players_auction ON auction_players(auction_id, status, lot_order);
    CREATE INDEX IF NOT EXISTS idx_bids_auction_player ON bids(auction_player_id, amount DESC);
    CREATE INDEX IF NOT EXISTS idx_bids_team ON bids(team_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_team_transactions_team ON team_transactions(team_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_user_id, recipient_team_id, is_read);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at DESC);
  `);
}
