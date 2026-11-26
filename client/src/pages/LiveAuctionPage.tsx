import { useState } from "react";
import { Award, Clock, Flame, Gavel, Maximize2, Minimize2, Radio, Sparkles, Trophy, Users } from "lucide-react";
import { CountdownTimer } from "@/components/CountdownTimer";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuction } from "@/context/AuctionContext";
import { formatBDT } from "@/lib/utils";

export function LiveAuctionPage() {
  const { state, remainingSeconds, connected } = useAuction();
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const lot = state?.currentLot;
  const lastResult = state?.lastResult;

  return (
    <div className="min-h-[calc(100vh-4rem)] w-full px-4 sm:px-8 lg:px-10 py-6 space-y-6">
      {/* Broadcast Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary/30 bg-card/85 px-5 py-3.5 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl gradient-ember flex items-center justify-center shadow-lg">
            <Radio className="h-5 w-5 text-white animate-pulse" />
          </div>
          <div>
            <h1 className="font-display text-2xl sm:text-3xl tracking-wider leading-none">
              {state?.settings.auction_title || "YKSG NB-3 PLAYER AUCTION"} · <span className="text-primary">LIVE THEATRE</span>
            </h1>
            <p className="text-xs text-muted-foreground">Official Public Broadcast Feed · Spectators View Only</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Badge variant={lot?.status === "live" ? "destructive" : lot?.status === "paused" ? "default" : "secondary"}>
            {lot?.status === "live" ? "● LIVE BIDDING" : lot?.status === "paused" ? "⏸ PAUSED" : "STANDBY"}
          </Badge>
          <Badge variant={connected ? "success" : "destructive"}>{connected ? "Real-Time Sync" : "Reconnecting..."}</Badge>
          <Button size="sm" variant="outline" onClick={toggleFullscreen}>
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            <span className="hidden sm:inline">{isFullscreen ? "Exit Fullscreen" : "Projector Mode"}</span>
          </Button>
        </div>
      </div>

      {/* Main Broadcast Grid */}
      <div className="grid lg:grid-cols-12 gap-6">
        {/* Center Stage */}
        <div className="lg:col-span-8 space-y-6">
          {lot ? (
            <div className="relative overflow-hidden rounded-3xl border-2 border-primary/40 gradient-hero p-6 sm:p-8 shadow-glow">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_hsl(43_96%_56%_/_0.14),_transparent_55%)] pointer-events-none" />

              <div className="relative z-10 grid md:grid-cols-12 gap-6 items-center">
                {/* Player Photo & Identity */}
                <div className="md:col-span-5 flex flex-col items-center text-center space-y-3">
                  <div className="relative">
                    <PlayerAvatar
                      src={lot.photo_url}
                      name={lot.full_name}
                      size="xl"
                      className="rounded-2xl border-2 border-primary/60 shadow-2xl"
                    />
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full gradient-gold px-4 py-1 text-xs font-extrabold uppercase tracking-widest text-primary-foreground shadow-gold whitespace-nowrap">
                      {lot.player_number}
                    </span>
                  </div>
                  <div>
                    <Badge
                      className="text-xs px-3 py-1"
                      style={{
                        borderColor: lot.category_color || undefined,
                        color: lot.category_color || undefined,
                      }}
                    >
                      {lot.category_name_snapshot}
                    </Badge>
                  </div>
                </div>

                {/* Bid Info & Countdown */}
                <div className="md:col-span-7 space-y-5">
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-primary font-bold">On The Auction Block</div>
                    <h2 className="font-display text-5xl sm:text-6xl tracking-wide leading-none mt-1">
                      {lot.full_name}
                    </h2>
                    <div className="flex flex-wrap items-center gap-2 mt-2 text-sm text-muted-foreground">
                      <span className="font-semibold text-foreground">{lot.position}</span>
                      {lot.jersey_number && <span>· Jersey #{lot.jersey_number}</span>}
                      {lot.preferred_foot && <span>· {lot.preferred_foot} Foot</span>}
                      {lot.room_number && <span>· Room {lot.room_number}</span>}
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4 items-center rounded-2xl border border-border/80 bg-card/85 p-4">
                    <div className="space-y-2">
                      <div className="text-xs uppercase tracking-widest text-muted-foreground">
                        {lot.total_bids > 0 ? "Current Highest Bid" : "Starting Base Price"}
                      </div>
                      <div className="font-display text-5xl sm:text-6xl text-primary leading-none">
                        {formatBDT(lot.total_bids > 0 ? lot.current_highest_bid : lot.starting_price_snapshot)}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
                        <span>Base: {formatBDT(lot.starting_price_snapshot)}</span>
                        <span>·</span>
                        <span>Min Inc: +{formatBDT(lot.min_increment_snapshot)}</span>
                        <span>·</span>
                        <span>{lot.total_bids} Bids</span>
                      </div>
                    </div>

                    <div className="flex justify-center">
                      <CountdownTimer
                        remainingSeconds={remainingSeconds}
                        totalSeconds={lot.duration_seconds_snapshot}
                        isPaused={lot.status === "paused"}
                      />
                    </div>
                  </div>

                  {/* Highest Bidding Team Banner */}
                  <div className="rounded-2xl border border-primary/35 bg-secondary/70 p-4 flex items-center justify-between gap-4">
                    {lot.highest_bidder_team_id ? (
                      <>
                        <div className="flex items-center gap-3 min-w-0">
                          <PlayerAvatar src={lot.highest_team_logo} name={lot.highest_team_code || "TM"} size="md" />
                          <div className="min-w-0">
                            <div className="text-[11px] uppercase tracking-widest text-emerald-400 font-bold flex items-center gap-1">
                              <Flame className="h-3.5 w-3.5" /> Leading Bidder
                            </div>
                            <div className="font-display text-3xl tracking-wide truncate">{lot.highest_team_name}</div>
                          </div>
                        </div>
                        <Badge variant="success" className="text-xs px-3 py-1">
                          HOLDING LEAD
                        </Badge>
                      </>
                    ) : (
                      <div className="flex items-center gap-3 text-muted-foreground">
                        <Gavel className="h-5 w-5 text-primary" />
                        <span className="text-sm font-medium">
                          Waiting for opening bid at {formatBDT(lot.starting_price_snapshot)}...
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : lastResult ? (
            /* Dramatic Result Screen */
            <div
              className={`rounded-3xl border-2 p-8 sm:p-12 text-center space-y-6 shadow-2xl ${
                lastResult.outcome === "sold"
                  ? "border-emerald-500/60 bg-gradient-to-b from-emerald-950/60 to-card"
                  : "border-red-500/50 bg-gradient-to-b from-red-950/40 to-card"
              }`}
            >
              <div className="inline-flex items-center gap-2 rounded-full px-5 py-1.5 text-sm font-extrabold uppercase tracking-[0.25em] border border-current">
                <Sparkles className="h-4 w-4" />
                {lastResult.outcome === "sold" ? "HAMMER DOWN · SOLD!" : "LOT CLOSED · UNSOLD"}
              </div>
              <div className="flex flex-col items-center gap-4">
                <PlayerAvatar src={lastResult.playerPhoto} name={lastResult.playerName} size="lg" />
                <div>
                  <div className="text-sm font-bold text-primary">
                    {lastResult.playerNumber} · {lastResult.categoryName}
                  </div>
                  <h2 className="font-display text-5xl sm:text-6xl tracking-wide">{lastResult.playerName}</h2>
                  <p className="text-muted-foreground">{lastResult.position}</p>
                </div>
              </div>
              {lastResult.outcome === "sold" ? (
                <div className="inline-flex flex-col sm:flex-row items-center gap-4 rounded-2xl border border-emerald-500/40 bg-background/60 px-8 py-4">
                  <div className="text-left">
                    <div className="text-xs uppercase tracking-widest text-muted-foreground">Acquired By</div>
                    <div className="font-display text-3xl text-emerald-400">{lastResult.winningTeamName}</div>
                  </div>
                  <div className="hidden sm:block h-10 w-px bg-border" />
                  <div className="text-left">
                    <div className="text-xs uppercase tracking-widest text-muted-foreground">Final Price</div>
                    <div className="font-display text-4xl text-primary">{formatBDT(lastResult.winningBid)}</div>
                  </div>
                </div>
              ) : (
                <p className="text-lg text-red-300 font-medium">
                  No team placed a bid. Player remains eligible for re-auction.
                </p>
              )}
            </div>
          ) : (
            /* Waiting Lobby */
            <div className="rounded-3xl border border-border gradient-hero p-12 text-center space-y-4">
              <div className="h-16 w-16 rounded-2xl gradient-gold mx-auto flex items-center justify-center shadow-gold">
                <Trophy className="h-8 w-8 text-primary-foreground" />
              </div>
              <h2 className="font-display text-4xl sm:text-5xl tracking-wide">
                AUCTION STAGE <span className="text-primary">STANDBY</span>
              </h2>
              <p className="text-muted-foreground max-w-lg mx-auto">
                The administrator is preparing the next player lot. Stay tuned — bids, timers, and results will sync
                here automatically in real time.
              </p>
            </div>
          )}

          {/* Team Purse & Squad Counts */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 font-display text-2xl tracking-wide">
                <Users className="h-5 w-5 text-primary" />
                TEAM STANDINGS & REMAINING BUDGETS
              </CardTitle>
            </CardHeader>
            <CardContent className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
              {(state?.teams || []).map((t) => (
                <div key={t.id} className="rounded-xl border border-border/70 bg-background/60 p-3.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <PlayerAvatar src={t.logo_url} name={t.short_code} size="sm" />
                      <span className="font-bold text-sm truncate">{t.name}</span>
                    </div>
                    <Badge>{t.players_count}</Badge>
                  </div>
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="text-muted-foreground">Balance</span>
                    <span className="font-display text-xl text-primary">{formatBDT(t.current_balance)}</span>
                  </div>
                </div>
              ))}
              {(state?.teams.length || 0) === 0 && (
                <p className="text-sm text-muted-foreground col-span-full">No teams registered yet.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Broadcast Rail */}
        <div className="lg:col-span-4 space-y-6">
          {/* Current Lot Bid History */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between font-display text-2xl tracking-wide">
                <span className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" />
                  LIVE BID HISTORY
                </span>
                {lot && <Badge>{lot.total_bids} bids</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-72 overflow-y-auto">
              {lot && lot.bids.length > 0 ? (
                lot.bids.map((b, idx) => (
                  <div
                    key={b.id}
                    className={`flex items-center justify-between rounded-xl px-3 py-2.5 border ${
                      idx === 0 ? "border-primary/50 bg-primary/10" : "border-border/60 bg-background/50"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <PlayerAvatar src={b.team_logo} name={b.team_code} size="sm" className="h-8 w-8 text-[10px]" />
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate">{b.team_name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {new Date(b.created_at + "Z").toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                    <span className={`font-display text-2xl ${idx === 0 ? "text-primary" : "text-foreground"}`}>
                      {formatBDT(b.amount)}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">No bids placed on current lot yet.</p>
              )}
            </CardContent>
          </Card>

          {/* Recent Sold & Unsold */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 font-display text-2xl tracking-wide">
                <Award className="h-5 w-5 text-emerald-400" />
                RECENT SOLD PLAYERS
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-64 overflow-y-auto">
              {(state?.recentSold || []).map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-emerald-500/25 bg-emerald-950/20 px-3 py-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <PlayerAvatar src={p.photo_url} name={p.full_name} size="sm" className="h-9 w-9" />
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">{p.full_name}</div>
                      <div className="text-[11px] text-emerald-300 truncate">
                        {p.team_name} · {p.position}
                      </div>
                    </div>
                  </div>
                  <span className="font-display text-xl text-primary shrink-0">{formatBDT(p.sold_price)}</span>
                </div>
              ))}
              {(state?.recentSold.length || 0) === 0 && (
                <p className="text-sm text-muted-foreground text-center py-3">No sold players yet.</p>
              )}
            </CardContent>
          </Card>

          {/* Recent Unsold */}
          {(state?.recentUnsold.length || 0) > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="font-display text-xl tracking-wide text-red-300">RECENT UNSOLD</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {state!.recentUnsold.slice(0, 6).map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between text-xs rounded-lg border border-red-500/20 bg-red-950/20 px-3 py-2"
                  >
                    <span className="font-medium truncate">
                      {p.player_number} · {p.full_name}
                    </span>
                    <Badge variant="destructive">UNSOLD</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
