import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBDT } from "@/lib/utils";

export interface AdminOverviewData {
  stats: {
    totalTeams: number;
    totalPlayers: number;
    claimedPlayers: number;
    unclaimedPlayers: number;
    totalAuctioned: number;
    soldPlayers: number;
    unsoldPlayers: number;
    pendingProfileChanges: number;
    currentHighestBid: number;
    highestSoldPrice: number;
    totalAuctionSpending: number;
    remainingTotalBudget: number;
  };
  teamSpending: Array<{
    id: number;
    name: string;
    short_code: string;
    initial_budget: number;
    current_balance: number;
    spent_amount: number;
    squad_count: number;
  }>;
  categorySales: Array<{
    name: string;
    base_price: number;
    total_players: number;
    sold_count: number;
    total_revenue: number;
  }>;
}

export function AdminOverviewTab({ data }: { data: AdminOverviewData | null }) {
  if (!data) return <div className="text-sm text-muted-foreground">Loading overview metrics...</div>;

  const { stats, teamSpending, categorySales } = data;
  const kpis = [
    { label: "Total Teams", value: stats.totalTeams, accent: "text-primary" },
    { label: "Registered Players", value: stats.totalPlayers, accent: "text-foreground" },
    { label: "Claimed Profiles", value: stats.claimedPlayers, accent: "text-emerald-400" },
    { label: "Unclaimed Profiles", value: stats.unclaimedPlayers, accent: "text-amber-400" },
    { label: "Total Auctioned", value: stats.totalAuctioned, accent: "text-sky-400" },
    { label: "Sold Players", value: stats.soldPlayers, accent: "text-emerald-400" },
    { label: "Unsold Players", value: stats.unsoldPlayers, accent: "text-red-400" },
    { label: "Current / Top Bid", value: formatBDT(stats.currentHighestBid || stats.highestSoldPrice), accent: "text-primary" },
    { label: "Total Auction Spending", value: formatBDT(stats.totalAuctionSpending), accent: "text-amber-400" },
    { label: "Remaining Team Budget", value: formatBDT(stats.remainingTotalBudget), accent: "text-emerald-400" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map((k) => (
          <Card key={k.label} className="p-4">
            <div className="text-xs text-muted-foreground">{k.label}</div>
            <div className={`font-display text-3xl mt-1 ${k.accent}`}>{k.value}</div>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Team Spending vs Remaining Purse</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {teamSpending.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={teamSpending}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(230 25% 20%)" />
                  <XAxis dataKey="short_code" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0f1424", border: "1px solid #2b334e", borderRadius: 8 }}
                  />
                  <Bar dataKey="spent_amount" name="Spent (BDT)" fill="#F24E29" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="current_balance" name="Remaining (BDT)" fill="#FABD2F" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                Create teams to visualize spending analytics.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Category-Wise Player Distribution & Revenue</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categorySales}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(230 25% 20%)" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0f1424", border: "1px solid #2b334e", borderRadius: 8 }}
                />
                <Bar dataKey="total_players" name="Total Players" fill="#38BDF8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="sold_count" name="Sold" fill="#34D399" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
