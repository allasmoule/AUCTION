import React, { useCallback, useEffect, useState } from "react";
import { Bell, CheckCircle2, Gavel, History, Receipt, ShieldAlert, Users, Wallet } from "lucide-react";
import { CountdownTimer } from "@/components/CountdownTimer";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Badge, Input } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { useAuction } from "@/context/AuctionContext";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/api";
import { formatBDT } from "@/lib/utils";

interface TeamDashboardData {
  team: {
    id: number;
    name: string;
    short_code: string;
    logo_url: string | null;
    manager_name: string;
    initial_budget: number;
    current_balance: number;
    spent_amount: number;
    status: string;
  };
  squad: Array<{
    id: number;
    player_number: string;
    full_name: string;
    position: string;
    jersey_number: string;
    preferred_foot: string;
    photo_url: string | null;
    sold_price: number;
    category_name: string;
  }>;
  bids: Array<{
    id: number;
    amount: number;
    is_winning: number;
    created_at: string;
    player_number: string;
    player_name: string;
    position: string;
    lot_status: string;
  }>;
  transactions: Array<{
    id: number;
    type: string;
    amount_delta: number;
    balance_after: number;
    description: string;
    created_at: string;
  }>;
  notifications: Array<{
    id: number;
    type: string;
    title: string;
    message: string;
    is_read: number;
    created_at: string;
  }>;
  auctionHistory: Array<{
    id: number;
    player_number: string;
    player_name: string;
    position: string;
    category_name_snapshot: string;
    starting_price_snapshot: number;
    winning_bid: number | null;
    winning_team_name: string | null;
    status: string;
    ended_at: string | null;
  }>;
}

export function TeamDashboardPage() {
  const { user } = useAuth();
  const { state, remainingSeconds } = useAuction();
  const { toast } = useToast();

  const [data, setData] = useState<TeamDashboardData | null>(null);
  const [tab, setTab] = useState<"bid" | "squad" | "bids" | "ledger" | "history" | "notifications">("bid");
  const [customAmount, setCustomAmount] = useState("");
  const [placingBid, setPlacingBid] = useState(false);

  const loadDashboard = useCallback(async () => {
    try {
      const res = await apiRequest<TeamDashboardData>("/api/team/dashboard");
      setData(res);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (user?.role === "team_manager") {
      loadDashboard();
    }
  }, [user, loadDashboard, state?.currentLot?.total_bids, state?.recentSold.length]);

  const lot = state?.currentLot;
  const team = data?.team;

  useEffect(() => {
    if (lot) {
      setCustomAmount(String(lot.next_minimum_bid));
    }
  }, [lot?.id, lot?.next_minimum_bid]);

  const submitBid = async (amount: number) => {
    setPlacingBid(true);
    try {
      await apiRequest("/api/team/bid", {
        method: "POST",
        body: JSON.stringify({ amount }),
      });
      toast({
        variant: "success",
        title: "Bid Accepted!",
        description: `Placed ${formatBDT(amount)} for ${lot?.full_name}`,
      });
      await loadDashboard();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Bid Rejected",
        description: err instanceof Error ? err.message : "Could not place bid",
      });
    } finally {
      setPlacingBid(false);
    }
  };

  const handleMarkNotificationsRead = async () => {
    await apiRequest("/api/team/notifications/read", { method: "POST" });
    await loadDashboard();
  };

  if (!data || !team) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 text-center text-muted-foreground">
        Loading Team Manager Console...
      </div>
    );
  }

  const spentPct = team.initial_budget > 0 ? Math.min(100, Math.round((team.spent_amount / team.initial_budget) * 100)) : 0;
  const remainPct = 100 - spentPct;
  const isHoldingLead = lot?.highest_bidder_team_id === team.id;
  const unreadCount = data.notifications.filter((n) => !n.is_read).length;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {/* Team Header & Budget Progress Bar */}
      <Card className="border-primary/30 shadow-glow">
        <CardContent className="p-6">
          <div className="grid lg:grid-cols-12 gap-6 items-center">
            <div className="lg:col-span-5 flex items-center gap-4">
              <PlayerAvatar src={team.logo_url} name={team.short_code} size="lg" />
              <div>
                <div className="flex items-center gap-2">
                  <Badge>{team.short_code}</Badge>
                  <Badge variant={team.status === "active" ? "success" : "destructive"}>
                    {team.status.toUpperCase()}
                  </Badge>
                </div>
                <h1 className="font-display text-4xl tracking-wide mt-1">{team.name}</h1>
                <p className="text-sm text-muted-foreground">Manager: {team.manager_name}</p>
              </div>
            </div>

            <div className="lg:col-span-7 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-background/60 border border-border/70 p-3">
                  <div className="text-xs text-muted-foreground">Initial Budget</div>
                  <div className="font-display text-2xl sm:text-3xl">{formatBDT(team.initial_budget)}</div>
                </div>
                <div className="rounded-xl bg-background/60 border border-border/70 p-3">
                  <div className="text-xs text-muted-foreground">Spent Amount</div>
                  <div className="font-display text-2xl sm:text-3xl text-amber-400">{formatBDT(team.spent_amount)}</div>
                </div>
                <div className="rounded-xl bg-primary/10 border border-primary/40 p-3">
                  <div className="text-xs text-primary font-semibold">Remaining Balance</div>
                  <div className="font-display text-2xl sm:text-3xl text-primary">{formatBDT(team.current_balance)}</div>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Budget Utilization ({spentPct}% spent)</span>
                  <span>
                    {remainPct}% remaining · {data.squad.length} Players Acquired
                  </span>
                </div>
                <div className="h-3 w-full rounded-full bg-secondary overflow-hidden flex">
                  <div className="h-full bg-amber-500 transition-all" style={{ width: `${spentPct}%` }} />
                  <div className="h-full gradient-gold transition-all" style={{ width: `${remainPct}%` }} />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {[
          { id: "bid" as const, label: "Live Bidding Floor", icon: Gavel },
          { id: "squad" as const, label: `My Squad (${data.squad.length})`, icon: Users },
          { id: "bids" as const, label: `My Bids (${data.bids.length})`, icon: History },
          { id: "ledger" as const, label: "Financial Ledger", icon: Wallet },
          { id: "history" as const, label: "Auction History", icon: Receipt },
          {
            id: "notifications" as const,
            label: `Notifications${unreadCount ? ` (${unreadCount})` : ""}`,
            icon: Bell,
          },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Button
              key={item.id}
              size="sm"
              variant={tab === item.id ? "default" : "outline"}
              onClick={() => setTab(item.id)}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Button>
          );
        })}
      </div>

      {/* TAB: LIVE BIDDING */}
      {tab === "bid" && (
        <div className="grid lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8">
            {lot ? (
              <Card className="border-primary/40 overflow-hidden">
                <CardHeader className="bg-primary/5 border-b border-border/60 flex flex-row items-center justify-between">
                  <div>
                    <Badge variant={lot.status === "live" ? "destructive" : "default"}>
                      {lot.status === "live" ? "● LIVE BIDDING OPEN" : "⏸ AUCTION PAUSED"}
                    </Badge>
                    <CardTitle className="font-display text-3xl tracking-wide mt-1">
                      {lot.player_number} · {lot.full_name}
                    </CardTitle>
                    <CardDescription>
                      {lot.category_name_snapshot} · {lot.position}
                    </CardDescription>
                  </div>
                  <CountdownTimer
                    compact
                    remainingSeconds={remainingSeconds}
                    totalSeconds={lot.duration_seconds_snapshot}
                    isPaused={lot.status === "paused"}
                  />
                </CardHeader>

                <CardContent className="p-6 space-y-6">
                  <div className="grid sm:grid-cols-12 gap-6 items-center">
                    <div className="sm:col-span-4 flex justify-center">
                      <PlayerAvatar src={lot.photo_url} name={lot.full_name} size="lg" className="h-40 w-40" />
                    </div>
                    <div className="sm:col-span-8 space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl bg-background/60 p-3.5 border border-border">
                          <div className="text-xs text-muted-foreground">
                            {lot.total_bids > 0 ? "Current Highest Bid" : "Starting Price"}
                          </div>
                          <div className="font-display text-4xl text-primary">
                            {formatBDT(lot.total_bids > 0 ? lot.current_highest_bid : lot.starting_price_snapshot)}
                          </div>
                        </div>
                        <div className="rounded-xl bg-background/60 p-3.5 border border-border">
                          <div className="text-xs text-muted-foreground">Leading Team</div>
                          <div className="font-display text-2xl truncate mt-1">
                            {lot.highest_team_name || "No Bids Yet"}
                          </div>
                          <div className="text-xs text-muted-foreground">{lot.total_bids} total bids</div>
                        </div>
                      </div>

                      {isHoldingLead ? (
                        <div className="rounded-xl border border-emerald-500/50 bg-emerald-950/40 p-4 flex items-center gap-3 text-emerald-300">
                          <CheckCircle2 className="h-5 w-5 shrink-0" />
                          <div className="text-sm font-semibold">
                            Your team currently holds the highest bid! Wait for other teams or timer expiry.
                          </div>
                        </div>
                      ) : lot.status !== "live" ? (
                        <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 flex items-center gap-3 text-amber-300">
                          <ShieldAlert className="h-5 w-5 shrink-0" />
                          <div className="text-sm font-semibold">Bidding is currently paused by Admin.</div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            Quick Bid Actions (Min valid: {formatBDT(lot.next_minimum_bid)})
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {[0, lot.min_increment_snapshot, lot.min_increment_snapshot * 2, lot.min_increment_snapshot * 4].map(
                              (extra, i) => {
                                const bidVal = lot.next_minimum_bid + extra;
                                const canAfford = team.current_balance >= bidVal && team.status === "active";
                                return (
                                  <Button
                                    key={i}
                                    variant={i === 0 ? "default" : "outline"}
                                    disabled={!canAfford || placingBid}
                                    onClick={() => submitBid(bidVal)}
                                    className="font-display text-xl tracking-wide h-12"
                                  >
                                    {formatBDT(bidVal)}
                                  </Button>
                                );
                              }
                            )}
                          </div>

                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              submitBid(Number(customAmount));
                            }}
                            className="flex gap-2 pt-1"
                          >
                            <Input
                              type="number"
                              min={lot.next_minimum_bid}
                              max={team.current_balance}
                              value={customAmount}
                              onChange={(e) => setCustomAmount(e.target.value)}
                              placeholder="Custom bid amount"
                            />
                            <Button
                              type="submit"
                              variant="ember"
                              disabled={placingBid || Number(customAmount) > team.current_balance || team.status !== "active"}
                            >
                              Place Custom Bid
                            </Button>
                          </form>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="p-10 text-center space-y-2">
                <Gavel className="h-10 w-10 text-primary mx-auto" />
                <h3 className="font-display text-3xl">NO PLAYER CURRENTLY ON THE BLOCK</h3>
                <p className="text-sm text-muted-foreground">
                  The Admin has not started the next player lot yet. This panel updates automatically when bidding opens.
                </p>
              </Card>
            )}
          </div>

          <Card className="lg:col-span-4">
            <CardHeader>
              <CardTitle className="font-display text-2xl">LIVE LOT BID FEED</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-96 overflow-y-auto">
              {lot && lot.bids.length > 0 ? (
                lot.bids.map((b) => (
                  <div
                    key={b.id}
                    className={`flex items-center justify-between rounded-xl px-3 py-2 border text-sm ${
                      b.team_id === team.id ? "border-primary/50 bg-primary/10" : "border-border/60 bg-background/50"
                    }`}
                  >
                    <span className="font-semibold truncate">{b.team_name}</span>
                    <span className="font-display text-xl text-primary">{formatBDT(b.amount)}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No bids on current player yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB: SQUAD */}
      {tab === "squad" && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.squad.map((p) => (
            <Card key={p.id} className="p-4 flex items-center gap-4">
              <PlayerAvatar src={p.photo_url} name={p.full_name} size="md" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-primary">
                  {p.player_number} · {p.category_name}
                </div>
                <div className="font-bold truncate">{p.full_name}</div>
                <div className="text-xs text-muted-foreground">{p.position}</div>
                <div className="font-display text-xl text-emerald-400 mt-1">{formatBDT(p.sold_price)}</div>
              </div>
            </Card>
          ))}
          {data.squad.length === 0 && (
            <Card className="p-8 col-span-full text-center text-muted-foreground">
              You have not purchased any players yet.
            </Card>
          )}
        </div>
      )}

      {/* TAB: MY BIDS */}
      {tab === "bids" && (
        <Card>
          <CardHeader>
            <CardTitle>Team Bidding History</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-4">Player</th>
                  <th className="py-2 pr-4">Position</th>
                  <th className="py-2 pr-4">Bid Amount</th>
                  <th className="py-2 pr-4">Result</th>
                  <th className="py-2">Time</th>
                </tr>
              </thead>
              <tbody>
                {data.bids.map((b) => (
                  <tr key={b.id} className="border-b border-border/50">
                    <td className="py-2.5 pr-4 font-medium">
                      {b.player_number} · {b.player_name}
                    </td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{b.position}</td>
                    <td className="py-2.5 pr-4 font-display text-lg text-primary">{formatBDT(b.amount)}</td>
                    <td className="py-2.5 pr-4">
                      {b.is_winning ? (
                        <Badge variant="success">WINNING BID</Badge>
                      ) : (
                        <Badge variant="secondary">{b.lot_status.toUpperCase()}</Badge>
                      )}
                    </td>
                    <td className="py-2.5 text-xs text-muted-foreground">
                      {new Date(b.created_at + "Z").toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.bids.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">No bids yet.</p>}
          </CardContent>
        </Card>
      )}

      {/* TAB: LEDGER */}
      {tab === "ledger" && (
        <Card>
          <CardHeader>
            <CardTitle>Immutable Financial Transaction Ledger</CardTitle>
            <CardDescription>All budget allocations, winning bids, and refunds verified by database transactions</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Description</th>
                  <th className="py-2 pr-4">Change</th>
                  <th className="py-2 pr-4">Balance After</th>
                  <th className="py-2">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {data.transactions.map((tx) => (
                  <tr key={tx.id} className="border-b border-border/50">
                    <td className="py-2.5 pr-4">
                      <Badge variant="outline">{tx.type.replace("_", " ").toUpperCase()}</Badge>
                    </td>
                    <td className="py-2.5 pr-4">{tx.description}</td>
                    <td
                      className={`py-2.5 pr-4 font-bold ${
                        tx.amount_delta >= 0 ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {tx.amount_delta >= 0 ? "+" : ""}
                      {formatBDT(tx.amount_delta)}
                    </td>
                    <td className="py-2.5 pr-4 font-semibold">{formatBDT(tx.balance_after)}</td>
                    <td className="py-2.5 text-xs text-muted-foreground">
                      {new Date(tx.created_at + "Z").toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* TAB: AUCTION HISTORY */}
      {tab === "history" && (
        <Card>
          <CardHeader>
            <CardTitle>Completed Auction Lots</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-4">Player</th>
                  <th className="py-2 pr-4">Category</th>
                  <th className="py-2 pr-4">Base</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Winning Team</th>
                  <th className="py-2">Final Price</th>
                </tr>
              </thead>
              <tbody>
                {data.auctionHistory.map((h) => (
                  <tr key={h.id} className="border-b border-border/50">
                    <td className="py-2.5 pr-4 font-medium">
                      {h.player_number} · {h.player_name}
                    </td>
                    <td className="py-2.5 pr-4">{h.category_name_snapshot}</td>
                    <td className="py-2.5 pr-4">{formatBDT(h.starting_price_snapshot)}</td>
                    <td className="py-2.5 pr-4">
                      <Badge variant={h.status === "sold" ? "success" : "destructive"}>{h.status.toUpperCase()}</Badge>
                    </td>
                    <td className="py-2.5 pr-4">{h.winning_team_name || "-"}</td>
                    <td className="py-2.5 font-display text-lg text-primary">
                      {h.winning_bid ? formatBDT(h.winning_bid) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* TAB: NOTIFICATIONS */}
      {tab === "notifications" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Team Notifications</CardTitle>
            <Button size="sm" variant="outline" onClick={handleMarkNotificationsRead}>
              Mark all read
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.notifications.map((n) => (
              <div
                key={n.id}
                className={`rounded-xl border p-3 ${
                  n.is_read ? "border-border/60 bg-background/40" : "border-primary/40 bg-primary/10"
                }`}
              >
                <div className="flex justify-between text-sm font-semibold">
                  <span>{n.title}</span>
                  <span className="text-xs text-muted-foreground">{new Date(n.created_at + "Z").toLocaleString()}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{n.message}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
