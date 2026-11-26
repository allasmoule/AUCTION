import type { NextFunction, Request, Response } from "express";
import { getDb } from "../db/database.js";
import { verifyJwt } from "../utils/security.js";

export interface AuthenticatedUser {
  id: number;
  username: string;
  role: "super_admin" | "team_manager" | "player";
  displayName: string;
  teamId: number | null;
  playerId: number | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const token = authHeader.slice(7).trim();
  try {
    const payload = verifyJwt(token);
    const db = getDb();
    const user = db
      .prepare(
        `SELECT id, username, role, display_name, team_id, player_id, is_active
         FROM users WHERE id = ?`
      )
      .get(payload.userId) as
      | {
          id: number;
          username: string;
          role: "super_admin" | "team_manager" | "player";
          display_name: string;
          team_id: number | null;
          player_id: number | null;
          is_active: number;
        }
      | undefined;

    if (!user || !user.is_active) {
      res.status(401).json({ error: "Account is inactive or no longer exists" });
      return;
    }

    req.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      displayName: user.display_name,
      teamId: user.team_id,
      playerId: user.player_id,
    };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireRole(...roles: Array<"super_admin" | "team_manager" | "player">) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "Insufficient permissions for this action" });
      return;
    }
    next();
  };
}
