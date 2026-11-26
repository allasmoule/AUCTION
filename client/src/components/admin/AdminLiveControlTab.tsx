import { useState } from "react";
import { CheckCircle, Clock, Gavel, ListPlus, Pause, Play, RotateCcw, Search, Trash2, XCircle } from "lucide-react";
import { CountdownTimer } from "@/components/CountdownTimer";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Badge, Input } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { useAuction } from "@/context/AuctionContext";
import { apiRequest } from "@/lib/api";
import { formatBDT } from "@/lib/utils";

export interface AdminPlayerRow {
  id: number;
  player_number: string;
  full_name: string;
  category_id: number;
  category_name: string;
  base_price: number;
  min_increment: number;
  position: string;
  jersey_number: string;
  preferred_foot: string;
  room_number: string;
  contact_phone: string;
  payment_method: string;
  payment_status: string;
  additional_info: string;
  photo_url: string | null;
  claim_code_plain: string | null;
  is_claimed: number;
  claimed_username: string | null;
  auction_status: string;
  sold_price: number | null;
  sold_team_name: string | null;
}

export function AdminLiveControlTab({
  players,
  onRefresh,
}: {
  players: AdminPlayerRow[];
  onRefresh: () => Promise<void>;
}) {
  const { state, remainingSeconds } = useAuction();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  const lot = state?.currentLot;

  const callAction = async (url: string, body?: Record<string, unknown>, successMsg?: string) => {
    setBusy(true);
    try {
      await apiRequest(url, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
      if (successMsg) toast({ variant: "success", title: successMsg });
      await onRefresh();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Action failed",
        description: err instanceof Error ? err.message : "Error",
      });
    } finally {
      setBusy(false);
    }
  };

  const eligiblePlayers = players.filter((p) => {
    const matchesSearch =
      !search.trim() ||
      p.full_name.toLowerCase().includes(search.toLowerCase()) ||
      p.player_number.toLowerCase().includes(search.toLowerCase());
    return matchesSearch;
  });

  return (
    <div className="grid lg:grid-cols-12 gap-6">
      {/* Active Lot Controls */}
      <div className="lg:col-span-7 space-y-6">
        <Card className="border-primary/40">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="font-display text-3xl tracking-wide">LIVE AUCTION CONTROLLER</CardTitle>
              <CardDescription>Control timer, pause/resume, or manually settle the current player</CardDescription>
            </div>
            {lot && (
              <CountdownTimer
                compact
                remainingSeconds={remainingSeconds}
                totalSeconds={lot.duration_seconds_snapshot}
                isPaused={lot.status === "paused"}
              />
            )}
          </CardHeader>
          <CardContent className="space-y-5">
            {lot ? (
              <>
                <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-background/60 p-4">
                  <PlayerAvatar src={lot.photo_url} name={lot.full_name} size="lg" />
                  <div className="flex-1 min-w-[200px] space-y-1">
                    <div className="text-xs font-bold text-primary">
                      {lot.player_number} · {lot.category_name_snapshot}
                    </div>
                    <div className="font-display text-3xl">{lot.full_name}</div>
                    <div className="text-sm text-muted-foreground">{lot.position}</div>
                    <div className="flex flex-wrap gap-4 pt-2 text-sm">
                      <span>
                        Base: <strong>{formatBDT(lot.starting_price_snapshot)}</strong>
                      </span>
                      <span>
                        Highest:{" "}
                        <strong className="text-primary">
                          {formatBDT(lot.total_bids > 0 ? lot.current_highest_bid : lot.starting_price_snapshot)}
                        </strong>
                      </span>
                      <span>
                        Leader: <strong>{lot.highest_team_name || "None"}</strong>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {lot.status === "live" ? (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => callAction("/api/admin/auction/pause", undefined, "Auction Paused")}
                    >
                      <Pause className="h-4 w-4" /> Pause Timer
                    </Button>
                  ) : (
                    <Button
                      variant="default"
                      disabled={busy}
                      onClick={() => callAction("/api/admin/auction/resume", undefined, "Auction Resumed")}
                    >
                      <Play className="h-4 w-4" /> Resume Timer
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => callAction("/api/admin/auction/extend", { seconds: 15 }, "Added +15s")}
                  >
                    <Clock className="h-4 w-4" /> +15 Seconds
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => callAction("/api/admin/auction/extend", { seconds: 30 }, "Added +30s")}
                  >
                    <Clock className="h-4 w-4" /> +30 Seconds
                  </Button>

                  <Button
                    variant="success"
                    disabled={busy || lot.total_bids === 0}
                    onClick={() => callAction("/api/admin/auction/mark-sold", undefined, "Marked SOLD")}
                  >
                    <CheckCircle className="h-4 w-4" /> Mark SOLD
                  </Button>

                  <Button
                    variant="destructive"
                    disabled={busy}
                    onClick={() => callAction("/api/admin/auction/mark-unsold", undefined, "Marked UNSOLD")}
                  >
                    <XCircle className="h-4 w-4" /> Mark UNSOLD
                  </Button>
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center space-y-3">
                <Gavel className="h-8 w-8 text-primary mx-auto" />
                <div className="font-display text-2xl">STAGE IS READY</div>
                <p className="text-sm text-muted-foreground">
                  Select a player from the pool on the right and click <strong>Start Lot</strong>, or start the next
                  queued player.
                </p>
                {state && state.queue.length > 0 && (
                  <Button
                    disabled={busy}
                    onClick={() =>
                      callAction(
                        "/api/admin/auction/start-player",
                        { playerId: state.queue[0].player_id },
                        `Started ${state.queue[0].full_name}`
                      )
                    }
                  >
                    <Play className="h-4 w-4" /> Start Next Queued: {state.queue[0].full_name}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Queue */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Queued Lots ({state?.queue.length || 0})</CardTitle>
              <CardDescription>Auto-next plays through this queue in order</CardDescription>
            </div>
            {(state?.queue.length || 0) > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => callAction("/api/admin/auction/clear-queue", undefined, "Queue cleared")}
              >
                <Trash2 className="h-3.5 w-3.5" /> Clear Queue
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-2 max-h-60 overflow-y-auto">
            {(state?.queue || []).map((q, i) => (
              <div
                key={q.auction_player_id}
                className="flex items-center justify-between rounded-xl border border-border/60 bg-background/50 px-3 py-2 text-sm"
              >
                <span>
                  <strong className="text-primary">#{i + 1}</strong> {q.player_number} · {q.full_name} ({q.category_name})
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={Boolean(lot) || busy}
                  onClick={() =>
                    callAction("/api/admin/auction/start-player", { playerId: q.player_id }, `Started ${q.full_name}`)
                  }
                >
                  Start Now
                </Button>
              </div>
            ))}
            {(state?.queue.length || 0) === 0 && (
              <p className="text-sm text-muted-foreground">No players queued. Use &quot;Queue&quot; or &quot;Queue All Unauctioned&quot;.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Player Pool Picker */}
      <Card className="lg:col-span-5">
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">Auction Player Pool</CardTitle>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => {
                const ids = players.filter((p) => p.auction_status === "unauctioned").map((p) => p.id);
                if (ids.length === 0) {
                  toast({ title: "No unauctioned players to queue" });
                  return;
                }
                callAction("/api/admin/auction/queue", { playerIds: ids }, `Queued ${ids.length} players`);
              }}
            >
              <ListPlus className="h-3.5 w-3.5" /> Queue All Unauctioned
            </Button>
          </div>
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter player..."
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-2 max-h-[560px] overflow-y-auto">
          {eligiblePlayers.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-border/70 bg-background/50 p-2.5 text-sm"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <PlayerAvatar src={p.photo_url} name={p.full_name} size="sm" />
                <div className="min-w-0">
                  <div className="font-semibold truncate">
                    {p.player_number} · {p.full_name}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {p.category_name} ({formatBDT(p.base_price)}) · {p.position}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {(p.auction_status === "unauctioned" || p.auction_status === "unsold") && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => callAction("/api/admin/auction/queue", { playerIds: [p.id] }, `Queued ${p.full_name}`)}
                    >
                      Queue
                    </Button>
                    <Button
                      size="sm"
                      disabled={Boolean(lot) || busy}
                      onClick={() =>
                        callAction("/api/admin/auction/start-player", { playerId: p.id }, `Started ${p.full_name}`)
                      }
                    >
                      Start
                    </Button>
                  </>
                )}
                {p.auction_status === "queued" && <Badge>QUEUED</Badge>}
                {p.auction_status === "live" && <Badge variant="ember">LIVE</Badge>}
                {p.auction_status === "sold" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    title="Refund & Re-auction"
                    disabled={busy}
                    onClick={() =>
                      callAction("/api/admin/auction/reauction", { playerId: p.id }, `Reset ${p.full_name}`)
                    }
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
