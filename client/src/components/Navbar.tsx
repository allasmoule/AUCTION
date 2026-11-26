import { LogOut, Radio, Shield, Trophy, UserCheck, Users, Volume2, VolumeX } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { useAuction } from "@/context/AuctionContext";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

export function Navbar() {
  const { user, logout } = useAuth();
  const { state, connected, soundEnabled, toggleSound } = useAuction();
  const location = useLocation();
  const navigate = useNavigate();

  const isLive = state?.currentLot?.status === "live";

  const navLinks = [
    { to: "/", label: "Overview", icon: Trophy },
    { to: "/live", label: "Live Theatre", icon: Radio, badge: isLive ? "LIVE" : undefined },
    { to: "/player/claim", label: "Player Claim", icon: UserCheck },
  ];

  if (user?.role === "team_manager") {
    navLinks.push({ to: "/team", label: "Team Console", icon: Users });
  } else if (user?.role === "super_admin") {
    navLinks.push({ to: "/admin/dashboard", label: "Admin Panel", icon: Shield });
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-background/85 backdrop-blur-xl">
      <div className="w-full px-4 sm:px-8 h-16 flex items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-3 group shrink-0">
          <img
            src="/logo.png"
            alt="YKSG NB-3 Crest"
            className="h-11 w-11 object-contain drop-shadow-[0_0_12px_rgba(250,189,47,0.35)]"
          />
          <div>
            <div className="font-display text-2xl tracking-wider leading-none text-foreground group-hover:text-primary transition-colors">
              YKSG <span className="text-primary">NB-3</span>
            </div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Player Auction 2026
            </div>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/15 text-primary border border-primary/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
                {item.badge && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-500/20 border border-red-500/50 px-1.5 py-0.5 text-[10px] font-bold text-red-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-ping" />
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleSound}
            title={soundEnabled ? "Mute auction sound effects" : "Enable auction sound effects"}
            className="h-9 w-9 rounded-lg border border-border bg-secondary/50 flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
          >
            {soundEnabled ? <Volume2 className="h-4 w-4 text-primary" /> : <VolumeX className="h-4 w-4" />}
          </button>

          <Badge variant={connected ? "success" : "destructive"} className="hidden sm:inline-flex">
            <span className={cn("h-1.5 w-1.5 rounded-full", connected ? "bg-emerald-400" : "bg-red-400")} />
            {connected ? "Sync ON" : "Offline"}
          </Badge>

          {user ? (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  navigate(
                    user.role === "super_admin"
                      ? "/admin/dashboard"
                      : user.role === "team_manager"
                        ? "/team"
                        : "/player/claim"
                  )
                }
              >
                {user.displayName}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                title="Sign out"
                onClick={() => {
                  logout();
                  navigate("/");
                }}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" asChild>
                <Link to="/team/login">Team Login</Link>
              </Button>
              <Button size="sm" asChild>
                <Link to="/admin">Admin</Link>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile bottom/secondary nav */}
      <div className="flex md:hidden border-t border-border/60 px-2 py-1.5 gap-1 overflow-x-auto">
        {navLinks.map((item) => {
          const Icon = item.icon;
          const active = location.pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap",
                active ? "bg-primary/15 text-primary" : "text-muted-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </header>
  );
}
