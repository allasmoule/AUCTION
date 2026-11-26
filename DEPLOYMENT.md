# YKSG NB-3 Player Auction — GitHub to Hostinger Node.js Deployment Guide

## 1. Architecture Summary
- **Single-Origin Production Server**: `npm run build` compiles the React Vite frontend into `server/public/` and compiles the Express + Socket.IO + SQLite backend into `server/dist/`.
- **Persistent Storage (`DATA_DIR`)**: All SQLite database files (`auction.db`), uploaded player/team images (`uploads/`), and automatic backups (`backups/`) live inside `DATA_DIR` (outside `server/dist/` and excluded from Git).

## 2. Environment Variables (Configure in Hostinger hPanel)
Copy `.env.example` values into Hostinger's Node.js Environment Variables panel:

```env
NODE_ENV=production
PORT=4000
JWT_SECRET=<generate-a-64-char-random-secret>
JWT_EXPIRES_IN=12h
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<strong-production-password>
ADMIN_DISPLAY_NAME=YKSG NB-3 Super Admin
DATA_DIR=/home/<hostinger-user>/yksg-nb3-data
BACKUP_INTERVAL_MINUTES=60
BACKUP_RETENTION_COUNT=24
```

> **Important**: Set `DATA_DIR` to a persistent directory **outside** the Git deployment directory so re-deploys from GitHub never overwrite `auction.db` or uploaded photos.

## 3. Hostinger Node.js App Setup (GitHub One-Click Deploy)
1. Push this repository to GitHub (`git push`).
2. In Hostinger **hPanel → Websites → Add Website → Node.js Web App**:
   - Connect your GitHub repository (`allasmoule/AUCTION`) and branch (`main`).
   - **Node.js version**: 20.x or 22.x
   - **Build command**: `npm install && npm run build`
   - **Start command**: `npm start` (or entry file `app.js`)
   - On first start, the app automatically initializes SQLite (`auction.db`), creates all 13 tables, creates the `super_admin` user, and seeds the 5 categories + 27 YKSG NB-3 players!
3. Or for **Direct ZIP / Folder Upload**: run `npm run package:hostinger` locally and upload `yksg-nb3-hostinger-deploy.zip` (which includes `app.js`, compiled `server/dist`, compiled `server/public`, `package.json`, and a consistent snapshot of `data/auction.db` + `uploads/`).
4. Ensure SSL/HTTPS is enabled for your domain. Socket.IO automatically uses WebSockets (`wss://`) with polling fallback.

## 4. Application URLs
- `/` — Public Tournament Hub & Registered Roster
- `/live` — Public Live Auction Broadcast Theatre (Projector/LED friendly)
- `/team/login` & `/team` — Team Manager Login & Bidding Console
- `/player/claim` — Player Claim Portal (One-Time Claim Code + Phone Verification)
- `/admin` & `/admin/dashboard` — Super Admin Control Center
