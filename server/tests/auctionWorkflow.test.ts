import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { config } from "../src/config.js";
import { closeDatabase } from "../src/db/database.js";
import { stopAuctionTicker } from "../src/engine/auctionEngine.js";
import { createApp } from "../src/index.js";
import { stopBackupScheduler } from "../src/utils/backup.js";

let baseUrl = "";
let tmpDir = "";
let serverInstance: ReturnType<typeof createApp>["server"];
let adminToken = "";
let teamAToken = "";
let teamBToken = "";

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "yksg-nb3-test-"));
  config.dataDir = tmpDir;
  config.dbPath = path.join(tmpDir, "test-auction.db");
  config.uploadsDir = path.join(tmpDir, "uploads");
  config.playerUploadsDir = path.join(tmpDir, "uploads", "players");
  config.teamUploadsDir = path.join(tmpDir, "uploads", "teams");
  config.backupsDir = path.join(tmpDir, "backups");

  const { server } = createApp({
    seedRealPlayers: true,
    dbPath: config.dbPath,
    startBackgroundWorkers: false,
  });
  serverInstance = server;

  await new Promise<void>((resolve) => {
    server.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        baseUrl = `http://127.0.0.1:${addr.port}`;
      }
      resolve();
    });
  });
});

after(async () => {
  stopAuctionTicker();
  stopBackupScheduler();
  closeDatabase();
  await new Promise<void>((resolve) => serverInstance.close(() => resolve()));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function api(route: string, options: RequestInit & { token?: string } = {}) {
  const headers = new Headers(options.headers || {});
  if (options.token) headers.set("Authorization", `Bearer ${options.token}`);
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${baseUrl}${route}`, { ...options, headers });
  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(text);
  } catch {
    // non-json response (e.g. csv/pdf)
  }
  return { status: res.status, headers: res.headers, text, json };
}

test("1. Seeds 27 real YKSG NB-3 players and protects private fields on public API", async () => {
  const pub = await api("/api/public/players");
  assert.equal(pub.status, 200);
  const players = pub.json?.players as Array<Record<string, unknown>>;
  assert.equal(players.length, 27);
  assert.equal(players[0].player_number, "NB3-01");
  assert.equal(players[0].full_name, "Faisal Mahmud");
  assert.equal(players[0].claim_code_plain, undefined);
  assert.equal(players[0].contact_phone, undefined);
});

test("2. Super Admin login, RBAC enforcement, and team creation with ledger allocation", async () => {
  const login = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      username: config.adminUsername,
      password: config.adminPassword,
      expectedRole: "super_admin",
    }),
  });
  assert.equal(login.status, 200);
  adminToken = login.json?.token as string;
  assert.ok(adminToken);

  const teamA = await api("/api/admin/teams", {
    method: "POST",
    token: adminToken,
    body: JSON.stringify({
      name: "Alpha Strikers",
      shortCode: "ALP",
      managerName: "Manager A",
      username: "manager_a",
      password: "Password123!",
      initialBudget: 50000,
    }),
  });
  assert.equal(teamA.status, 201);

  const teamB = await api("/api/admin/teams", {
    method: "POST",
    token: adminToken,
    body: JSON.stringify({
      name: "Beta Titans",
      shortCode: "BET",
      managerName: "Manager B",
      username: "manager_b",
      password: "Password123!",
      initialBudget: 50000,
    }),
  });
  assert.equal(teamB.status, 201);

  const loginA = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: "manager_a", password: "Password123!", expectedRole: "team_manager" }),
  });
  assert.equal(loginA.status, 200);
  teamAToken = loginA.json?.token as string;

  const loginB = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: "manager_b", password: "Password123!", expectedRole: "team_manager" }),
  });
  assert.equal(loginB.status, 200);
  teamBToken = loginB.json?.token as string;

  // RBAC check: Team Manager cannot access admin routes
  const forbidden = await api("/api/admin/overview", { token: teamAToken });
  assert.equal(forbidden.status, 403);
});

test("3. Player Claim security, duplicate protection, and Admin profile approval", async () => {
  const adminPlayers = await api("/api/admin/players", { token: adminToken });
  const players = adminPlayers.json?.players as Array<Record<string, unknown>>;
  const target = players[0];
  const claimCode = target.claim_code_plain as string;
  assert.ok(claimCode);

  // Wrong code rejected
  const badCode = await api("/api/player-claim/claim", {
    method: "POST",
    body: JSON.stringify({
      playerNumber: target.player_number,
      claimCode: "WRONG1",
      phoneLast4: "1597",
      username: "faisal_player",
      password: "Player123!",
    }),
  });
  assert.equal(badCode.status, 400);

  // Wrong phone last 4 rejected
  const badPhone = await api("/api/player-claim/claim", {
    method: "POST",
    body: JSON.stringify({
      playerNumber: target.player_number,
      claimCode,
      phoneLast4: "9999",
      username: "faisal_player",
      password: "Player123!",
    }),
  });
  assert.equal(badPhone.status, 400);

  // Valid claim succeeds
  const claimed = await api("/api/player-claim/claim", {
    method: "POST",
    body: JSON.stringify({
      playerNumber: target.player_number,
      claimCode,
      phoneLast4: "1597",
      username: "faisal_player",
      password: "Player123!",
    }),
  });
  assert.equal(claimed.status, 201);
  const playerToken = claimed.json?.token as string;

  // Duplicate claim rejected
  const dup = await api("/api/player-claim/claim", {
    method: "POST",
    body: JSON.stringify({
      playerNumber: target.player_number,
      claimCode,
      phoneLast4: "1597",
      username: "faisal_dup",
      password: "Player123!",
    }),
  });
  assert.equal(dup.status, 400);

  // Player submits position update -> Admin approves
  const upd = await api("/api/player-claim/profile-update", {
    method: "POST",
    token: playerToken,
    body: JSON.stringify({ position: "Forward (FW)", jerseyNumber: "10", preferredFoot: "Right" }),
  });
  assert.equal(upd.status, 201);
  const changeId = upd.json?.id as number;

  const review = await api(`/api/admin/profile-changes/${changeId}/review`, {
    method: "POST",
    token: adminToken,
    body: JSON.stringify({ decision: "approved" }),
  });
  assert.equal(review.status, 200);

  const me = await api("/api/player-claim/me", { token: playerToken });
  assert.equal((me.json?.player as Record<string, unknown>).position, "Forward (FW)");
});

test("4. Live Auction bidding rules, concurrency safety, settlement, ledger, and snapshot preservation", async () => {
  // Assign player #1 to Category A (10,000 base / 1,000 inc)
  const cats = ((await api("/api/admin/categories", { token: adminToken })).json?.categories || []) as Array<{
    id: number;
    name: string;
    base_price: number;
    min_increment: number;
  }>;
  const catA = cats.find((c) => c.name === "Category A")!;
  await api("/api/admin/players/1", {
    method: "PUT",
    token: adminToken,
    body: JSON.stringify({
      playerNumber: "NB3-01",
      fullName: "Faisal Mahmud",
      categoryId: catA.id,
      position: "Forward (FW)",
    }),
  });

  const start = await api("/api/admin/auction/start-player", {
    method: "POST",
    token: adminToken,
    body: JSON.stringify({ playerId: 1 }),
  });
  assert.equal(start.status, 200);

  // Team A opens at base price 10,000
  const bidA1 = await api("/api/team/bid", {
    method: "POST",
    token: teamAToken,
    body: JSON.stringify({ amount: 10000 }),
  });
  assert.equal(bidA1.status, 200);

  // Team A cannot bid against its own highest bid
  const selfBid = await api("/api/team/bid", {
    method: "POST",
    token: teamAToken,
    body: JSON.stringify({ amount: 11000 }),
  });
  assert.equal(selfBid.status, 400);

  // Team B cannot bid below minimum increment (10,500 < 11,000)
  const lowBid = await api("/api/team/bid", {
    method: "POST",
    token: teamBToken,
    body: JSON.stringify({ amount: 10500 }),
  });
  assert.equal(lowBid.status, 400);

  // Team B cannot bid beyond balance (60,000 > 50,000)
  const overBudget = await api("/api/team/bid", {
    method: "POST",
    token: teamBToken,
    body: JSON.stringify({ amount: 60000 }),
  });
  assert.equal(overBudget.status, 400);

  // Concurrent bids at 11,000: Team B valid vs Team A invalid (or simultaneous two valid contenders)
  const bidB1 = await api("/api/team/bid", {
    method: "POST",
    token: teamBToken,
    body: JSON.stringify({ amount: 11000 }),
  });
  assert.equal(bidB1.status, 200);

  // Now simulate simultaneous bids from Team A (12,000) and Team B (12,000)
  const [resA, resB] = await Promise.all([
    api("/api/team/bid", { method: "POST", token: teamAToken, body: JSON.stringify({ amount: 12000 }) }),
    api("/api/team/bid", { method: "POST", token: teamBToken, body: JSON.stringify({ amount: 12000 }) }),
  ]);
  const statuses = [resA.status, resB.status].sort();
  assert.deepEqual(statuses, [200, 400]);

  // Admin marks SOLD to Team A for 12,000
  const sold = await api("/api/admin/auction/mark-sold", { method: "POST", token: adminToken });
  assert.equal(sold.status, 200);

  // Team A balance must be 50,000 - 12,000 = 38,000 with immutable ledger row
  const dashA = await api("/api/team/dashboard", { token: teamAToken });
  assert.equal((dashA.json?.team as Record<string, unknown>).current_balance, 38000);
  const txA = dashA.json?.transactions as Array<Record<string, unknown>>;
  assert.equal(txA[0].type, "winning_bid");
  assert.equal(txA[0].amount_delta, -12000);

  // Changing Category A future price must NOT change historical snapshot price
  await api(`/api/admin/categories/${catA.id}`, {
    method: "PUT",
    token: adminToken,
    body: JSON.stringify({
      name: "Category A",
      basePrice: 25000,
      minIncrement: 2000,
      status: "active",
      sortOrder: 1,
    }),
  });

  const reports = await api("/api/admin/reports", { token: adminToken });
  const history = reports.json?.auctionHistory as Array<Record<string, unknown>>;
  assert.equal(history[0].starting_price_snapshot, 10000);
  assert.equal(history[0].winning_bid, 12000);

  // CSV, PDF, and Backup endpoints
  const csv = await api("/api/admin/reports/export.csv", { token: adminToken });
  assert.equal(csv.status, 200);
  assert.ok(csv.text.includes("Faisal Mahmud"));

  const pdf = await api("/api/admin/reports/export.pdf", { token: adminToken });
  assert.equal(pdf.status, 200);

  const backup = await api("/api/admin/backups/create", { method: "POST", token: adminToken });
  assert.equal(backup.status, 200);
});

test("5. Mobile-number-only claim opens account, allows return access, and blocks mismatch", async () => {
  // NB3-02 (Shiddhartho) registered phone: 01744431513
  const wrongPhone = await api("/api/player-claim/claim-by-phone", {
    method: "POST",
    body: JSON.stringify({ playerNumber: "NB3-02", phone: "01700000000" }),
  });
  assert.equal(wrongPhone.status, 400);

  const ok = await api("/api/player-claim/claim-by-phone", {
    method: "POST",
    body: JSON.stringify({ playerNumber: "NB3-02", phone: "01744431513" }),
  });
  assert.equal(ok.status, 201);
  const pToken = ok.json?.token as string;
  assert.ok(pToken);

  // Returning with the same mobile number reopens the account without a password
  const reopen = await api("/api/player-claim/claim-by-phone", {
    method: "POST",
    body: JSON.stringify({ playerNumber: "NB3-02", phone: "01744431513" }),
  });
  assert.equal(reopen.status, 201);

  const me = await api("/api/player-claim/me", { token: pToken });
  assert.equal(me.status, 200);
  assert.equal((me.json?.player as Record<string, unknown>).base_price, 2000);
});
