import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { useToast } from "@/components/ui/toast";
import { apiRequest } from "@/lib/api";
import { soundEngine } from "@/lib/sound";
import { formatBDT } from "@/lib/utils";
import { useAuth } from "./AuthContext";

export interface BidRecord {
  id: number;
  amount: number;
  created_at: string;
  team_id: number;
  team_name: string;
  team_code: string;
  team_logo: string | null;
}

export interface CurrentLot {
  id: number;
  player_id: number;
  player_number: string;
  full_name: string;
  position: string;
  jersey_number: string;
  preferred_foot: string;
  room_number: string;
  photo_url: string | null;
  additional_info: string;
  category_name_snapshot: string;
  category_color: string | null;
  starting_price_snapshot: number;
  min_increment_snapshot: number;
  duration_seconds_snapshot: number;
  status: "live" | "paused";
  current_highest_bid: number;
  highest_bidder_team_id: number | null;
  highest_team_name: string | null;
  highest_team_code: string | null;
  highest_team_logo: string | null;
  total_bids: number;
  timer_ends_at: number | null;
  remaining_seconds: number;
  next_minimum_bid: number;
  bids: BidRecord[];
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

export interface TeamSummary {
  id: number;
  name: string;
  short_code: string;
  logo_url: string | null;
  manager_name: string;
  initial_budget: number;
  current_balance: number;
  spent_amount: number;
  players_count: number;
  status: string;
}

export interface PublicAuctionState {
  serverNow: number;
  settings: {
    auction_title: string;
    default_duration_seconds: number;
    default_starting_price: number;
    default_min_increment: number;
    anti_sniping_enabled: number;
    anti_sniping_threshold_seconds: number;
    anti_sniping_extension_seconds: number;
    auto_next_player: number;
    auto_pause_between_players: number;
    auto_pause_seconds: number;
    auction_status: string;
  };
  currentLot: CurrentLot | null;
  lastResult: LastAuctionResult | null;
  queue: Array<{
    auction_player_id: number;
    player_id: number;
    player_number: string;
    full_name: string;
    position: string;
    photo_url: string | null;
    category_name: string;
    category_color: string | null;
    starting_price_snapshot: number;
  }>;
  teams: TeamSummary[];
  recentSold: Array<{
    id: number;
    player_number: string;
    full_name: string;
    position: string;
    photo_url: string | null;
    sold_price: number;
    category_name: string;
    team_name: string;
    team_code: string;
    team_logo: string | null;
  }>;
  recentUnsold: Array<{
    id: number;
    player_number: string;
    full_name: string;
    position: string;
    photo_url: string | null;
    category_name: string;
    starting_price_snapshot: number;
  }>;
  recentActivity: Array<{
    id: number;
    amount: number;
    created_at: string;
    player_name: string;
    player_number: string;
    team_name: string;
    team_code: string;
  }>;
}

interface AuctionContextValue {
  state: PublicAuctionState | null;
  remainingSeconds: number;
  connected: boolean;
  soundEnabled: boolean;
  toggleSound: () => void;
  refreshState: () => Promise<void>;
}

const AuctionContext = createContext<AuctionContextValue>({
  state: null,
  remainingSeconds: 0,
  connected: false,
  soundEnabled: false,
  toggleSound: () => {},
  refreshState: async () => {},
});

export function AuctionProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth();
  const { toast } = useToast();
  const [state, setState] = useState<PublicAuctionState | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [connected, setConnected] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  const refreshState = async () => {
    try {
      const data = await apiRequest<PublicAuctionState>("/api/public/state");
      setState(data);
      setRemainingSeconds(data.currentLot?.remaining_seconds ?? 0);
    } catch {
      // ignore transient error
    }
  };

  useEffect(() => {
    refreshState();
  }, []);

  useEffect(() => {
    const socket = io({
      auth: { token: token || undefined },
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("auction:state", (nextState: PublicAuctionState) => {
      setState(nextState);
      if (nextState.currentLot) {
        setRemainingSeconds(nextState.currentLot.remaining_seconds);
      } else {
        setRemainingSeconds(0);
      }
    });

    socket.on("auction:tick", (tick: { remainingSeconds: number }) => {
      setRemainingSeconds(tick.remainingSeconds);
      if (tick.remainingSeconds > 0 && tick.remainingSeconds <= 5) {
        soundEngine.playTick();
      }
    });

    socket.on("auction:bid_placed", (payload: { teamName: string; amount: number; extended?: boolean }) => {
      soundEngine.playBid();
      if (payload.extended) {
        toast({
          title: "Anti-Sniping Extension!",
          description: `Late bid by ${payload.teamName} (${formatBDT(payload.amount)}) extended the clock.`,
        });
      }
    });

    socket.on("auction:result", (result: LastAuctionResult) => {
      if (result.outcome === "sold") {
        soundEngine.playSold();
        toast({
          variant: "success",
          title: `SOLD! ${result.playerName}`,
          description: `Acquired by ${result.winningTeamName} for ${formatBDT(result.winningBid)}`,
        });
      } else {
        soundEngine.playUnsold();
        toast({
          variant: "destructive",
          title: `UNSOLD: ${result.playerName}`,
          description: "No bids placed before timer expired.",
        });
      }
    });

    socket.on("notification:new", (notif: { type: string; title: string; message: string; recipient_team_id?: number | null }) => {
      if (notif.type === "outbid" && user?.teamId && notif.recipient_team_id === user.teamId) {
        toast({
          variant: "destructive",
          title: notif.title,
          description: notif.message,
        });
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [token, user?.teamId, toast]);

  const toggleSound = () => {
    const next = !soundEnabled;
    soundEngine.enabled = next;
    setSoundEnabled(next);
  };

  return (
    <AuctionContext.Provider value={{ state, remainingSeconds, connected, soundEnabled, toggleSound, refreshState }}>
      {children}
    </AuctionContext.Provider>
  );
}

export function useAuction() {
  return useContext(AuctionContext);
}
