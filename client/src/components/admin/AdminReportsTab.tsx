import { useEffect, useState } from "react";
import { Download, FileText } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest, getStoredToken } from "@/lib/api";
import { formatBDT } from "@/lib/utils";

interface ReportsResponse {
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
    total_bids: number;
    started_at: string | null;
    ended_at: string | null;
    bids: Array<{ id: number; team_name: string; amount: number; created_at: string }>;
  }>;
  teamReports: Array<{
    id: number;
    name: string;
    short_code: string;
    initial_budget: number;
    total_spending: number;
    current_balance: number;
    players: Array<{ id: number; player_number: string; full_name: string; position: string; sold_price: number }>;
  }>;
  categorySales: Array<{
    name: string;
    base_price: number;
    total_players: number;
    sold_count: number;
    unsold_count: number;
    total_spent: number;
  }>;
}

export function AdminReportsTab() {
  const [reports, setReports] = useState<ReportsResponse | null>(null);

  useEffect(() => {
    apiRequest<ReportsResponse>("/api/admin/reports")
      .then(setReports)
      .catch(() => {});
  }, []);

  const downloadExport = async (type: "csv" | "pdf") => {
    const token = getStoredToken();
    const res = await fetch(`/api/admin/reports/export.${type}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `yksg-nb3-auction-report.${type}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!reports) return <div className="text-sm text-muted-foreground">Loading auction reports...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-3xl tracking-wide">AUCTION HISTORY & REPORTS</h2>
          <p className="text-sm text-muted-foreground">Complete financial, team-wise, and category-wise summaries</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => downloadExport("csv")}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          <Button onClick={() => downloadExport("pdf")}>
            <FileText className="h-4 w-4" /> Export PDF
          </Button>
        </div>
      </div>

      {/* Category Sales */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Category-Wise Sales Summary</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 pr-4">Category</th>
                <th className="py-2 pr-4">Current Base Price</th>
                <th className="py-2 pr-4">Total Players</th>
                <th className="py-2 pr-4">Sold</th>
                <th className="py-2 pr-4">Unsold</th>
                <th className="py-2">Total Revenue</th>
              </tr>
            </thead>
            <tbody>
              {reports.categorySales.map((c) => (
                <tr key={c.name} className="border-b border-border/50">
                  <td className="py-2.5 pr-4 font-semibold">{c.name}</td>
                  <td className="py-2.5 pr-4">{formatBDT(c.base_price)}</td>
                  <td className="py-2.5 pr-4">{c.total_players}</td>
                  <td className="py-2.5 pr-4 text-emerald-400">{c.sold_count}</td>
                  <td className="py-2.5 pr-4 text-red-400">{c.unsold_count}</td>
                  <td className="py-2.5 font-display text-lg text-primary">{formatBDT(c.total_spent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Team-wise Spending & Squads */}
      <div className="grid md:grid-cols-2 gap-4">
        {reports.teamReports.map((t) => (
          <Card key={t.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  {t.name} ({t.short_code})
                </CardTitle>
                <Badge>{t.players.length} Players</Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                Budget: {formatBDT(t.initial_budget)} · Spent: {formatBDT(t.total_spending)} · Remaining:{" "}
                <strong className="text-primary">{formatBDT(t.current_balance)}</strong>
              </div>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {t.players.map((p) => (
                <div key={p.id} className="flex justify-between text-xs rounded-lg bg-background/60 px-3 py-2 border border-border/60">
                  <span>
                    {p.player_number} · <strong>{p.full_name}</strong> ({p.position})
                  </span>
                  <span className="font-bold text-emerald-400">{formatBDT(p.sold_price)}</span>
                </div>
              ))}
              {t.players.length === 0 && <p className="text-xs text-muted-foreground">No players purchased.</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Complete Auction History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Complete Lot & Bid History</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {reports.auctionHistory.map((h) => (
            <div key={h.id} className="rounded-xl border border-border/70 bg-background/50 p-3.5 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-bold">
                    {h.player_number} · {h.player_name}
                  </span>{" "}
                  <span className="text-xs text-muted-foreground">
                    ({h.category_name_snapshot} · Base {formatBDT(h.starting_price_snapshot)})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={h.status === "sold" ? "success" : "destructive"}>{h.status.toUpperCase()}</Badge>
                  {h.winning_team_name && (
                    <span className="text-sm font-bold text-primary">
                      {h.winning_team_name} · {formatBDT(h.winning_bid)}
                    </span>
                  )}
                </div>
              </div>
              {h.bids.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {h.bids.map((b) => (
                    <Badge key={b.id} variant="outline" className="text-[11px]">
                      {b.team_name}: {formatBDT(b.amount)}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          ))}
          {reports.auctionHistory.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No completed auction lots yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
