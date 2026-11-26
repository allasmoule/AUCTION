import { useCallback, useEffect, useState } from "react";
import { BarChart3, FileBarChart, Gavel, Settings, Shield, UserCheck, Users } from "lucide-react";
import { AdminLiveControlTab, type AdminPlayerRow } from "@/components/admin/AdminLiveControlTab";
import { AdminOverviewTab, type AdminOverviewData } from "@/components/admin/AdminOverviewTab";
import { AdminPlayersTab, type CategoryRow, type ProfileChangeRow } from "@/components/admin/AdminPlayersTab";
import { AdminReportsTab } from "@/components/admin/AdminReportsTab";
import { AdminSettingsTab, type AuctionSettingsRow } from "@/components/admin/AdminSettingsTab";
import { AdminSystemTab } from "@/components/admin/AdminSystemTab";
import { AdminTeamsTab, type AdminTeamRow } from "@/components/admin/AdminTeamsTab";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { useAuction } from "@/context/AuctionContext";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/api";

type AdminTab = "overview" | "live" | "players" | "teams" | "settings" | "reports" | "system";

export function AdminDashboardPage() {
  const { user } = useAuth();
  const { state } = useAuction();
  const [tab, setTab] = useState<AdminTab>("overview");

  const [overview, setOverview] = useState<AdminOverviewData | null>(null);
  const [players, setPlayers] = useState<AdminPlayerRow[]>([]);
  const [teams, setTeams] = useState<AdminTeamRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [profileChanges, setProfileChanges] = useState<ProfileChangeRow[]>([]);
  const [settings, setSettings] = useState<AuctionSettingsRow | null>(null);

  const loadAdminData = useCallback(async () => {
    try {
      const [ov, pl, tm, cat, chg, st] = await Promise.all([
        apiRequest<AdminOverviewData>("/api/admin/overview"),
        apiRequest<{ players: AdminPlayerRow[] }>("/api/admin/players"),
        apiRequest<{ teams: AdminTeamRow[] }>("/api/admin/teams"),
        apiRequest<{ categories: CategoryRow[] }>("/api/admin/categories"),
        apiRequest<{ changes: ProfileChangeRow[] }>("/api/admin/profile-changes"),
        apiRequest<{ settings: AuctionSettingsRow }>("/api/admin/settings"),
      ]);
      setOverview(ov);
      setPlayers(pl.players);
      setTeams(tm.teams);
      setCategories(cat.categories);
      setProfileChanges(chg.changes);
      setSettings(st.settings);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (user?.role === "super_admin") {
      loadAdminData();
    }
  }, [user, loadAdminData, state?.currentLot?.total_bids, state?.recentSold.length, state?.recentUnsold.length]);

  const pendingApprovals = profileChanges.filter((c) => c.status === "pending").length;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Badge className="mb-1.5">SUPER ADMIN CONTROL CENTER</Badge>
          <h1 className="font-display text-4xl sm:text-5xl tracking-wide">
            YKSG NB-3 <span className="text-primary">ADMINISTRATION</span>
          </h1>
        </div>
        {pendingApprovals > 0 && (
          <Button variant="ember" size="sm" onClick={() => setTab("players")}>
            {pendingApprovals} Pending Profile Approval{pendingApprovals > 1 ? "s" : ""}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {[
          { id: "overview" as const, label: "Overview", icon: BarChart3 },
          { id: "live" as const, label: "Live Control", icon: Gavel },
          { id: "players" as const, label: `Players (${players.length})`, icon: UserCheck },
          { id: "teams" as const, label: `Teams (${teams.length})`, icon: Users },
          { id: "settings" as const, label: "Categories & Settings", icon: Settings },
          { id: "reports" as const, label: "Reports & Exports", icon: FileBarChart },
          { id: "system" as const, label: "Users, Logs & Backups", icon: Shield },
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

      {tab === "overview" && <AdminOverviewTab data={overview} />}
      {tab === "live" && <AdminLiveControlTab players={players} onRefresh={loadAdminData} />}
      {tab === "players" && (
        <AdminPlayersTab
          players={players}
          categories={categories}
          profileChanges={profileChanges}
          onRefresh={loadAdminData}
        />
      )}
      {tab === "teams" && <AdminTeamsTab teams={teams} onRefresh={loadAdminData} />}
      {tab === "settings" && (
        <AdminSettingsTab categories={categories} settings={settings} onRefresh={loadAdminData} />
      )}
      {tab === "reports" && <AdminReportsTab />}
      {tab === "system" && <AdminSystemTab onRefresh={loadAdminData} />}
    </div>
  );
}
