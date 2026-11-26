# YKSG NB-3 Player Auction Management System

Full-stack real-time Football Player Auction Management System built with React, TypeScript, Tailwind CSS, Node.js, Express, SQLite, and Socket.IO.

## Features
- **Public Live Auction Theatre** (`/live`): Projector-friendly real-time broadcast display with server-authoritative countdown timer, leading team spotlight, and live bid ticker.
- **Team Manager Console** (`/team/login`, `/team`): Authenticated real-time bidding, quick-increment controls, budget utilization bar, squad tracker, and immutable financial ledger.
- **Player Claim Portal** (`/player/claim`): Mobile-number verification to open player cards, view auction base price, upload photographs, and update playing positions.
- **Super Admin Control Center** (`/admin`): Live lot controller, team & budget management, player management + CSV/Excel bulk import + profile change approvals, category & timer settings, CSV/PDF exports, audit logs, and automated SQLite backups.

## Quick Start
1. Copy `.env.example` to `.env` and configure `ADMIN_PASSWORD` and `JWT_SECRET`.
2. Install dependencies:
   ```bash
   npm install && npm --prefix server install && npm --prefix client install
   ```
3. Run development servers:
   ```bash
   npm run dev
   ```
4. Build & run production:
   ```bash
   npm run build && npm start
   ```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for GitHub-to-Hostinger Node.js deployment instructions.
