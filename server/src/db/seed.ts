import type Database from "better-sqlite3";
import { config } from "../config.js";
import { generateClaimCode, hashClaimCode, hashPassword, normalizePhone } from "../utils/security.js";

const INITIAL_CATEGORIES = [
  { name: "Category A", base_price: 10000, min_increment: 1000, description: "Marquee & Tier-1 Stars", color: "#FABD2F", sort_order: 1 },
  { name: "Category B", base_price: 8000, min_increment: 500, description: "Senior First-Team Players", color: "#38BDF8", sort_order: 2 },
  { name: "Category C", base_price: 6000, min_increment: 500, description: "Core Squad Regulars", color: "#34D399", sort_order: 3 },
  { name: "Category D", base_price: 4000, min_increment: 500, description: "Emerging & Utility Players", color: "#A78BFA", sort_order: 4 },
  { name: "Category E", base_price: 2000, min_increment: 250, description: "Development & Squad Depth", color: "#F24E29", sort_order: 5 },
];

const INITIAL_PLAYERS_RAW = [
  { registeredAt: "20/11/2026 16:06:30", fullName: "Faisal Mahmud", room: "315", position: "Midfielder (MF)", phone: "01860041597", paymentMethod: "Hand Cash", paymentStatus: "" },
  { registeredAt: "20/11/2026 16:08:49", fullName: "Shiddhartho", room: "308", position: "Defender (DF)", phone: "01744431513", paymentMethod: "বিকাশ (Personal): 01754958008", paymentStatus: "done" },
  { registeredAt: "20/11/2026 16:14:52", fullName: "Nayeem Sheikh", room: "315", position: "Defender (DF)", phone: "01895632025", paymentMethod: "Hand Cash", paymentStatus: "" },
  { registeredAt: "20/11/2026 16:15:21", fullName: "Talha Bin Shahad", room: "306", position: "Defender (DF)", phone: "01988631372", paymentMethod: "Hand Cash", paymentStatus: "" },
  { registeredAt: "20/11/2026 16:18:46", fullName: "Rupom", room: "310", position: "Midfielder (MF), Forward (FW)", phone: "01870755116", paymentMethod: "বিকাশ (Personal): 01754958008", paymentStatus: "done" },
  { registeredAt: "20/11/2026 16:24:41", fullName: "SAMIM", room: "307", position: "Midfielder (MF)", phone: "01799399816", paymentMethod: "Hand Cash", paymentStatus: "" },
  { registeredAt: "20/11/2026 16:27:18", fullName: "Safin Ahmed", room: "307", position: "Defender (DF)", phone: "01540502220", paymentMethod: "বিকাশ (Personal): 01754958008", paymentStatus: "DUE" },
  { registeredAt: "20/11/2026 16:54:19", fullName: "Abdul kader", room: "305", position: "Forward (FW)", phone: "01304866950", paymentMethod: "Hand Cash", paymentStatus: "" },
  { registeredAt: "20/11/2026 19:08:17", fullName: "Tahseen saba", room: "301", position: "Defender (DF)", phone: "01766893235", paymentMethod: "বিকাশ (Personal): 01754958008", paymentStatus: "Due" },
  { registeredAt: "20/11/2026 19:47:12", fullName: "Muhammad Al Amin", room: "3rd floor", position: "Forward (FW)", phone: "01706003216", paymentMethod: "Hand Cash", paymentStatus: "" },
  { registeredAt: "20/11/2026 20:24:20", fullName: "Moon", room: "305", position: "Striker (ST)", phone: "01601319897", paymentMethod: "Hand Cash", paymentStatus: "" },
  { registeredAt: "20/11/2026 20:31:45", fullName: "Mosabbir Sadik", room: "301", position: "Forward (FW)", phone: "01888537478", paymentMethod: "Hand Cash", paymentStatus: "" },
  { registeredAt: "20/11/2026 21:36:14", fullName: "Koushik", room: "311", position: "Midfielder (MF)", phone: "01400032569", paymentMethod: "Hand Cash", paymentStatus: "" },
  { registeredAt: "20/11/2026 21:42:18", fullName: "Sawon Ahmed ( Alpha )", room: "303", position: "Striker (ST)", phone: "01967883847", paymentMethod: "বিকাশ (Personal): 01754958008", paymentStatus: "Due" },
  { registeredAt: "20/11/2026 22:15:43", fullName: "Alif", room: "310", position: "Defender (DF)", phone: "01300190503", paymentMethod: "Hand Cash", paymentStatus: "" },
  { registeredAt: "20/11/2026 23:01:52", fullName: "Rony", room: "302", position: "Defender (DF)", phone: "01771870509", paymentMethod: "Hand Cash", paymentStatus: "" },
  { registeredAt: "20/11/2026 23:02:54", fullName: "Sheikh Uzzal", room: "311", position: "Midfielder (MF)", phone: "01829083861", paymentMethod: "Hand Cash", paymentStatus: "" },
  { registeredAt: "20/11/2026 23:05:22", fullName: "Mushfiq", room: "NB-309", position: "Goalkeeper (GK)", phone: "01810058557", paymentMethod: "Hand Cash", paymentStatus: "" },
  { registeredAt: "20/11/2026 23:37:00", fullName: "Arabi Rahman", room: "310", position: "Defender (DF)", phone: "1340857333", paymentMethod: "Hand Cash", paymentStatus: "" },
  { registeredAt: "21/11/2026 19:18:01", fullName: "Shakib", room: "312", position: "Goalkeeper (GK)", phone: "01932528489", paymentMethod: "Hand Cash", paymentStatus: "" },
  { registeredAt: "21/11/2026 21:04:57", fullName: "Md Abu Rayhan Emon", room: "3rd floor", position: "Midfielder (MF)", phone: "01879715784", paymentMethod: "Hand Cash", paymentStatus: "" },
  { registeredAt: "21/11/2026 23:24:23", fullName: "Md Sojib Molla", room: "301", position: "Forward (FW), Striker (ST)", phone: "01303427518", paymentMethod: "Hand Cash", paymentStatus: "" },
  { registeredAt: "22/11/2026 00:21:30", fullName: "Azizul Kabir Khalid", room: "304", position: "Defender (DF)", phone: "01764408058", paymentMethod: "Hand Cash", paymentStatus: "" },
  { registeredAt: "22/11/2026 00:27:51", fullName: "Ahnaf Musfiq Nafes", room: "303", position: "Defender (DF)", phone: "01568701075", paymentMethod: "Hand Cash", paymentStatus: "" },
  { registeredAt: "22/11/2026 22:06:31", fullName: "Md Nahid Hasan", room: "303", position: "Striker (ST)", phone: "01926041175", paymentMethod: "Hand Cash", paymentStatus: "" },
  { registeredAt: "22/11/2026 22:33:04", fullName: "Nazmul Rahad", room: "304", position: "Midfielder (MF)", phone: "1781300182", paymentMethod: "Hand Cash", paymentStatus: "" },
  { registeredAt: "23/11/2026 00:12:46", fullName: "Md.Tanvir Ahammad", room: "311", position: "Forward (FW)", phone: "01890756912", paymentMethod: "Hand Cash", paymentStatus: "" },
];

export function seedInitialData(db: Database.Database, options: { seedRealPlayers?: boolean } = {}): void {
  const { seedRealPlayers = true } = options;

  const tx = db.transaction(() => {
    // 1. Super Admin user
    const existingAdmin = db
      .prepare("SELECT id FROM users WHERE role = 'super_admin' LIMIT 1")
      .get() as { id: number } | undefined;

    let adminId: number;
    if (!existingAdmin) {
      const info = db
        .prepare(
          `INSERT INTO users (username, password_hash, role, display_name)
           VALUES (?, ?, 'super_admin', ?)`
        )
        .run(config.adminUsername, hashPassword(config.adminPassword), config.adminDisplayName);
      adminId = Number(info.lastInsertRowid);
    } else {
      adminId = existingAdmin.id;
    }

    // 2. Default categories
    const catCount = (db.prepare("SELECT COUNT(*) as c FROM player_categories").get() as { c: number }).c;
    if (catCount === 0) {
      const insertCat = db.prepare(
        `INSERT INTO player_categories (name, base_price, min_increment, description, color, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`
      );
      for (const c of INITIAL_CATEGORIES) {
        insertCat.run(c.name, c.base_price, c.min_increment, c.description, c.color, c.sort_order);
      }
    }

    // 3. Default auction + singleton auction_settings
    const settingsCount = (db.prepare("SELECT COUNT(*) as c FROM auction_settings").get() as { c: number }).c;
    if (settingsCount === 0) {
      const auctionInfo = db
        .prepare("INSERT INTO auctions (name, status, created_by) VALUES (?, 'upcoming', ?)")
        .run("YKSG NB-3 Tournament Auction 2026", adminId);
      db.prepare(
        `INSERT INTO auction_settings (
          id, auction_title, default_duration_seconds, default_starting_price, default_min_increment,
          anti_sniping_enabled, anti_sniping_threshold_seconds, anti_sniping_extension_seconds,
          auto_next_player, auto_pause_between_players, auto_pause_seconds, auction_status, current_auction_id
        ) VALUES (1, 'YKSG NB-3 PLAYER AUCTION', 60, 2000, 500, 1, 10, 15, 0, 1, 8, 'draft', ?)`
      ).run(Number(auctionInfo.lastInsertRowid));
    }

    // 4. Seed the 27 registered YKSG NB-3 players if players table is empty
    if (seedRealPlayers) {
      const playerCount = (db.prepare("SELECT COUNT(*) as c FROM players").get() as { c: number }).c;
      if (playerCount === 0) {
        const defaultCategory = db
          .prepare("SELECT id FROM player_categories ORDER BY sort_order DESC LIMIT 1")
          .get() as { id: number } | undefined;

        const fallbackCategoryId = defaultCategory?.id ?? 1;
        const insertPlayer = db.prepare(
          `INSERT INTO players (
            player_number, full_name, category_id, position, room_number,
            contact_phone, payment_method, payment_status, registered_at,
            claim_code_hash, claim_code_plain
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );

        INITIAL_PLAYERS_RAW.forEach((p, idx) => {
          const num = `NB3-${String(idx + 1).padStart(2, "0")}`;
          const claimCode = generateClaimCode();
          const normalizedPhone = normalizePhone(p.phone);
          insertPlayer.run(
            num,
            p.fullName.trim(),
            fallbackCategoryId,
            p.position.trim(),
            p.room.trim(),
            normalizedPhone,
            p.paymentMethod.trim(),
            p.paymentStatus.trim() || "Pending",
            p.registeredAt,
            hashClaimCode(claimCode),
            claimCode
          );
        });
      }
    }
  });

  tx();
}
