import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Award,
  Clock,
  Gavel,
  Phone,
  Radio,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserCheck,
  Users,
  X,
  Zap,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Badge, Input, Label } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { useAuction } from "@/context/AuctionContext";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/api";
import { formatBDT, formatTimer } from "@/lib/utils";

interface PublicPlayer {
  id: number;
  player_number: string;
  full_name: string;
  position: string;
  jersey_number: string;
  room_number: string;
  photo_url: string | null;
  is_claimed: number;
  auction_status: string;
  sold_price: number | null;
  category_name: string;
  base_price: number;
  category_color: string | null;
  sold_team_name: string | null;
  sold_team_code: string | null;
}

interface PublicCategory {
  id: number;
  name: string;
  base_price: number;
  min_increment: number;
  description: string;
  color: string;
}

export function HomePage() {
  const { state, remainingSeconds } = useAuction();
  const { setSession } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [players, setPlayers] = useState<PublicPlayer[]>([]);
  const [categories, setCategories] = useState<PublicCategory[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [positionFilter, setPositionFilter] = useState<string>("all");

  // Quick Claim Modal state
  const [claimTarget, setClaimTarget] = useState<PublicPlayer | null>(null);
  const [claimPhone, setClaimPhone] = useState("");
  const [claiming, setClaiming] = useState(false);

  const handleQuickClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimTarget) return;
    setClaiming(true);
    try {
      const data = await apiRequest<{
        token: string;
        user: { id: number; username: string; role: "player"; displayName: string; playerId: number };
      }>("/api/player-claim/claim-by-phone", {
        method: "POST",
        body: JSON.stringify({
          playerNumber: claimTarget.player_number,
          phone: claimPhone,
        }),
      });
      setSession(data.token, data.user);
      toast({
        variant: "success",
        title: `Welcome, ${claimTarget.full_name}!`,
        description: "Account opened. You can change your photo and view your base price.",
      });
      setClaimTarget(null);
      setClaimPhone("");
      navigate("/player/claim");
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Mobile number did not match",
        description: err instanceof Error ? err.message : "Please enter your registered mobile number.",
      });
    } finally {
      setClaiming(false);
    }
  };

  useEffect(() => {
    apiRequest<{ players: PublicPlayer[] }>("/api/public/players")
      .then((d) => setPlayers(d.players))
      .catch(() => {});
    apiRequest<{ categories: PublicCategory[] }>("/api/public/categories")
      .then((d) => setCategories(d.categories))
      .catch(() => {});
  }, [state?.recentSold.length, state?.recentUnsold.length]);

  const filteredPlayers = useMemo(() => {
    return players.filter((p) => {
      const q = search.trim().toLowerCase();
      const matchesQ =
        !q ||
        p.full_name.toLowerCase().includes(q) ||
        p.player_number.toLowerCase().includes(q) ||
        p.position.toLowerCase().includes(q) ||
        p.room_number.toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || p.auction_status === statusFilter;
      const matchesPos =
        positionFilter === "all" || p.position.toLowerCase().includes(positionFilter.toLowerCase());
      return matchesQ && matchesStatus && matchesPos;
    });
  }, [players, search, statusFilter, positionFilter]);

  const lot = state?.currentLot;
  const soldCount = players.filter((p) => p.auction_status === "sold").length;
  const claimedCount = players.filter((p) => p.is_claimed).length;
  const totalSpent = (state?.teams || []).reduce((sum, t) => sum + (t.spent_amount || 0), 0);

  return (
    <div className="w-full">
      {/* FULL-SCREEN HERO SECTION */}
      <section className="relative w-full min-h-[calc(100vh-4rem)] flex flex-col justify-between overflow-hidden gradient-hero border-b border-primary/25">
        {/* Decorative stadium spotlights */}
        <div className="absolute -top-32 left-1/4 h-96 w-96 rounded-full bg-primary/15 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 h-96 w-96 rounded-full bg-accent/15 blur-[130px] pointer-events-none" />

        <div className="w-full px-4 sm:px-8 lg:px-12 py-10 lg:py-16 my-auto relative z-10">
          <div className="grid lg:grid-cols-12 gap-10 items-center">
            {/* Left Hero Copy */}
            <div className="lg:col-span-7 space-y-6">
              <div className="flex items-center gap-4">
                <img
                  src="/logo.png"
                  alt="YKSG NB-3 Official Crest"
                  className="h-16 w-16 sm:h-20 sm:w-20 object-contain drop-shadow-[0_0_24px_rgba(250,189,47,0.4)] shrink-0"
                />
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.22em] text-primary">
                  <Trophy className="h-4 w-4" />
                  YKSG NB-3 Tournament · Official Auction Arena 2026
                </div>
              </div>

              <h1 className="font-display text-6xl sm:text-7xl xl:text-8xl tracking-wide leading-[0.92] text-foreground">
                YKSG NB-3 <br />
                <span className="text-primary drop-shadow-[0_0_30px_rgba(250,189,47,0.35)]">
                  PLAYER AUCTION
                </span>
              </h1>

              <p className="text-muted-foreground text-base sm:text-xl max-w-2xl leading-relaxed">
                Real-time football player auction broadcast, squad management, and verified player registration
                system. Built for live stadium screens, team managers, and tournament officials.
              </p>

              <div className="flex flex-wrap gap-3 pt-2">
                <Button size="lg" className="h-14 px-7 text-base" asChild>
                  <Link to="/live">
                    <Radio className="h-5 w-5" />
                    Enter Live Auction Theatre
                  </Link>
                </Button>
                <Button size="lg" variant="outline" className="h-14 px-6 text-base" asChild>
                  <Link to="/player/claim">
                    <UserCheck className="h-5 w-5" />
                    Claim Your Player Card
                  </Link>
                </Button>
                <Button size="lg" variant="secondary" className="h-14 px-6 text-base" asChild>
                  <Link to="/team/login">
                    <Users className="h-5 w-5" />
                    Team Manager Console
                  </Link>
                </Button>
              </div>

              {/* Hero Live Metrics Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 max-w-2xl">
                <div className="rounded-xl border border-border/80 bg-card/60 backdrop-blur p-3.5">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Players</div>
                  <div className="font-display text-3xl text-foreground">{players.length}</div>
                </div>
                <div className="rounded-xl border border-border/80 bg-card/60 backdrop-blur p-3.5">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Claimed</div>
                  <div className="font-display text-3xl text-emerald-400">{claimedCount}</div>
                </div>
                <div className="rounded-xl border border-border/80 bg-card/60 backdrop-blur p-3.5">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Teams</div>
                  <div className="font-display text-3xl text-primary">{state?.teams.length || 0}</div>
                </div>
                <div className="rounded-xl border border-border/80 bg-card/60 backdrop-blur p-3.5">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Sold / Spent</div>
                  <div className="font-display text-3xl text-amber-400">
                    {soldCount} <span className="text-lg text-muted-foreground">/ {formatBDT(totalSpent)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Hero Spotlight Card */}
            <div className="lg:col-span-5">
              {lot ? (
                <Link
                  to="/live"
                  className="block rounded-3xl border-2 border-primary/50 bg-card/90 p-6 sm:p-8 shadow-gold hover:border-primary transition-all"
                >
                  <div className="flex items-center justify-between mb-5">
                    <Badge variant={lot.status === "live" ? "destructive" : "default"} className="px-3 py-1">
                      <span className="h-2 w-2 rounded-full bg-current animate-ping" />
                      {lot.status === "live" ? "LIVE ON THE BLOCK" : "AUCTION PAUSED"}
                    </Badge>
                    <span className="font-display text-3xl text-primary">{formatTimer(remainingSeconds)}</span>
                  </div>
                  <div className="flex flex-col sm:flex-row items-center gap-6">
                    <PlayerAvatar src={lot.photo_url} name={lot.full_name} size="lg" className="h-32 w-32" />
                    <div className="min-w-0 flex-1 text-center sm:text-left">
                      <div className="text-xs font-bold text-primary uppercase tracking-widest">
                        {lot.player_number} · {lot.category_name_snapshot}
                      </div>
                      <div className="font-display text-4xl tracking-wide truncate mt-1">{lot.full_name}</div>
                      <div className="text-sm text-muted-foreground">{lot.position}</div>
                      <div className="mt-4 flex items-baseline justify-between border-t border-border/60 pt-3">
                        <span className="text-xs text-muted-foreground uppercase">
                          {lot.total_bids > 0 ? "Highest Bid" : "Base Price"}
                        </span>
                        <span className="font-display text-4xl text-primary">
                          {formatBDT(lot.total_bids > 0 ? lot.current_highest_bid : lot.starting_price_snapshot)}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              ) : (
                <div className="rounded-3xl border border-primary/30 bg-card/85 backdrop-blur-xl p-6 sm:p-8 shadow-2xl space-y-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary">
                      <Sparkles className="h-4 w-4" />
                      Auction Floor Status
                    </div>
                    <Badge variant="outline">{(state?.settings.auction_status || "draft").toUpperCase()}</Badge>
                  </div>

                  <div className="rounded-2xl border border-border/80 bg-background/60 p-5 space-y-3">
                    <div className="font-display text-3xl tracking-wide">
                      READY FOR <span className="text-primary">KICKOFF</span>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      All {players.length} registered players are loaded into the auction database. Players can claim
                      their profiles and upload photos before the live bidding begins.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Link
                      to="/live"
                      className="rounded-xl border border-primary/40 bg-primary/10 p-4 hover:bg-primary/20 transition-colors"
                    >
                      <Radio className="h-5 w-5 text-primary mb-2" />
                      <div className="font-bold text-sm">Live Theatre</div>
                      <div className="text-xs text-muted-foreground">Projector & LED mode</div>
                    </Link>
                    <Link
                      to="/admin"
                      className="rounded-xl border border-border bg-secondary/50 p-4 hover:border-primary/40 transition-colors"
                    >
                      <Shield className="h-5 w-5 text-primary mb-2" />
                      <div className="font-bold text-sm">Admin Control</div>
                      <div className="text-xs text-muted-foreground">Manage teams & lots</div>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Feature Strip inside Hero */}
        <div className="w-full border-t border-border/60 bg-background/60 backdrop-blur-md px-4 sm:px-8 lg:px-12 py-4 relative z-10">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-xs sm:text-sm">
            <div className="flex items-center gap-2.5 text-muted-foreground">
              <Zap className="h-4 w-4 text-primary shrink-0" />
              <span>Real-time Socket.IO bidding sync</span>
            </div>
            <div className="flex items-center gap-2.5 text-muted-foreground">
              <Clock className="h-4 w-4 text-primary shrink-0" />
              <span>Server-controlled anti-sniping timer</span>
            </div>
            <div className="flex items-center gap-2.5 text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
              <span>Atomic SQLite transaction protection</span>
            </div>
            <div className="flex items-center gap-2.5 text-muted-foreground">
              <Award className="h-4 w-4 text-primary shrink-0" />
              <span>Verified one-time player claims</span>
            </div>
          </div>
        </div>
      </section>

      {/* MAIN FULL-WIDTH CONTENT SECTIONS */}
      <div className="w-full px-4 sm:px-8 lg:px-12 py-12 space-y-14">
        {/* Category Pricing Tiers */}
        {categories.length > 0 && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="font-display text-4xl tracking-wide">
                  AUCTION <span className="text-primary">CATEGORY TIERS</span>
                </h2>
                <p className="text-sm text-muted-foreground">
                  Base starting prices and minimum bid increments configured by tournament administration
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {categories.map((c) => (
                <Card key={c.id} className="p-5 border-border/80 hover:border-primary/40 transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: c.color }} />
                    <span className="text-xs text-muted-foreground">+{formatBDT(c.min_increment)} inc</span>
                  </div>
                  <div className="font-display text-2xl tracking-wide">{c.name}</div>
                  <div className="font-display text-4xl text-primary mt-1">{formatBDT(c.base_price)}</div>
                  <div className="text-xs text-muted-foreground mt-2 line-clamp-2">{c.description}</div>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Role Portals */}
        <section className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            {
              title: "Live Auction Theatre",
              desc: "Full-screen broadcast view for projectors, LED displays, and spectators.",
              to: "/live",
              icon: Gavel,
              cta: "Open Theatre",
            },
            {
              title: "Team Manager Console",
              desc: "Place bids, track squad positions, and monitor remaining purse balance.",
              to: "/team/login",
              icon: Users,
              cta: "Team Login",
            },
            {
              title: "Player Claim Portal",
              desc: "Claim your profile with your Player Number & one-time verification code.",
              to: "/player/claim",
              icon: UserCheck,
              cta: "Claim Profile",
            },
            {
              title: "Admin Control Center",
              desc: "Control live lots, approve player photos, configure settings & export reports.",
              to: "/admin",
              icon: Shield,
              cta: "Admin Login",
            },
          ].map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.to} className="hover:border-primary/40 transition-colors flex flex-col justify-between">
                <CardHeader>
                  <div className="h-11 w-11 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary mb-2">
                    <Icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-lg">{card.title}</CardTitle>
                  <p className="text-xs text-muted-foreground leading-relaxed">{card.desc}</p>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" size="sm" className="w-full justify-between" asChild>
                    <Link to={card.to}>
                      <span>{card.cta}</span>
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </section>

        {/* Teams Standings */}
        {state && state.teams.length > 0 && (
          <section className="space-y-4">
            <div>
              <h2 className="font-display text-4xl tracking-wide">
                TEAMS <span className="text-primary">BUDGET & SQUAD</span>
              </h2>
              <p className="text-sm text-muted-foreground">Live financial purse and acquired squad count</p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {state.teams.map((t) => {
                const pct = t.initial_budget > 0 ? Math.round((t.current_balance / t.initial_budget) * 100) : 0;
                return (
                  <Card key={t.id} className="p-5 space-y-3">
                    <div className="flex items-center gap-3">
                      <PlayerAvatar src={t.logo_url} name={t.short_code} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="font-bold truncate">{t.name}</div>
                        <div className="text-xs text-muted-foreground">Mgr: {t.manager_name}</div>
                      </div>
                      <Badge>{t.players_count} Players</Badge>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Remaining Purse</span>
                        <span className="font-bold text-primary">{formatBDT(t.current_balance)}</span>
                      </div>
                      <div className="h-2.5 w-full rounded-full bg-secondary overflow-hidden">
                        <div className="h-full gradient-gold transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        {/* Registered Player Roster */}
        <section className="space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-4xl tracking-wide">
                REGISTERED <span className="text-primary">PLAYERS ({filteredPlayers.length})</span>
              </h2>
              <p className="text-sm text-muted-foreground">Official YKSG NB-3 Tournament Auction Pool</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {["all", "GK", "DF", "MF", "FW", "ST"].map((pos) => (
                <Button
                  key={pos}
                  size="sm"
                  variant={positionFilter === pos ? "default" : "outline"}
                  onClick={() => setPositionFilter(pos)}
                >
                  {pos === "all" ? "All Positions" : pos}
                </Button>
              ))}
              <div className="relative w-64">
                <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, #number, room..."
                  className="pl-9"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-10 rounded-lg border border-border bg-background/70 px-3 text-sm"
              >
                <option value="all">All Statuses</option>
                <option value="unauctioned">Unauctioned</option>
                <option value="queued">Queued</option>
                <option value="sold">Sold</option>
                <option value="unsold">Unsold</option>
              </select>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredPlayers.map((p) => (
              <Card key={p.id} className="p-4 flex items-center gap-4 hover:border-primary/40 transition-all">
                <PlayerAvatar src={p.photo_url} name={p.full_name} size="md" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-primary">{p.player_number}</span>
                    <Badge
                      variant={
                        p.auction_status === "sold"
                          ? "success"
                          : p.auction_status === "unsold"
                            ? "destructive"
                            : p.auction_status === "live"
                              ? "ember"
                              : "secondary"
                      }
                    >
                      {p.auction_status.toUpperCase()}
                    </Badge>
                  </div>
                  <div className="font-bold truncate">{p.full_name}</div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-muted-foreground truncate">
                      {p.position} {p.room_number ? `· Room ${p.room_number}` : ""}
                    </div>
                    {p.is_claimed ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2.5 text-[11px] border-emerald-500/40 text-emerald-300 shrink-0"
                        onClick={() => {
                          setClaimTarget(p);
                          setClaimPhone("");
                        }}
                      >
                        Claimed
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="h-6 px-2.5 text-[11px] shrink-0"
                        onClick={() => {
                          setClaimTarget(p);
                          setClaimPhone("");
                        }}
                      >
                        Claim
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-border/50">
                    <span className="text-muted-foreground">{p.category_name}</span>
                    {p.auction_status === "sold" && p.sold_team_name ? (
                      <span className="font-semibold text-emerald-400">
                        {p.sold_team_code} · {formatBDT(p.sold_price)}
                      </span>
                    ) : (
                      <span className="font-semibold text-primary">Base {formatBDT(p.base_price)}</span>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      </div>

      {/* Quick Claim Modal (Phone Number Verification) */}
      {claimTarget && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-md border-primary/40 shadow-glow">
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <PlayerAvatar src={claimTarget.photo_url} name={claimTarget.full_name} size="md" />
                <div>
                  <div className="text-xs font-bold text-primary">
                    {claimTarget.player_number} · {claimTarget.category_name}
                  </div>
                  <CardTitle className="font-display text-3xl tracking-wide">{claimTarget.full_name}</CardTitle>
                  <div className="text-xs text-muted-foreground">
                    {claimTarget.position} ·{" "}
                    <span className="text-primary font-semibold">Base Price {formatBDT(claimTarget.base_price)}</span>
                  </div>
                </div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => setClaimTarget(null)}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleQuickClaim} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="claim-phone">Mobile Number</Label>
                  <div className="relative">
                    <Phone className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
                    <Input
                      id="claim-phone"
                      value={claimPhone}
                      onChange={(e) => setClaimPhone(e.target.value)}
                      placeholder="01XXXXXXXXX"
                      className="pl-9"
                      required
                      autoFocus
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setClaimTarget(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1" disabled={claiming}>
                    {claiming ? "Opening..." : "Open Account"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
