import React, { useState } from "react";
import { KeyRound, Plus, Trash2, Wallet } from "lucide-react";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Badge, Input, Label } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { apiRequest } from "@/lib/api";
import { formatBDT } from "@/lib/utils";

export interface AdminTeamRow {
  id: number;
  name: string;
  short_code: string;
  logo_url: string | null;
  manager_name: string;
  manager_username: string;
  initial_budget: number;
  current_balance: number;
  spent_amount: number;
  players_count: number;
  status: "active" | "inactive" | "suspended";
}

export function AdminTeamsTab({ teams, onRefresh }: { teams: AdminTeamRow[]; onRefresh: () => Promise<void> }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [shortCode, setShortCode] = useState("");
  const [managerName, setManagerName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [initialBudget, setInitialBudget] = useState("100000");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const [adjustTeamId, setAdjustTeamId] = useState<number | null>(null);
  const [adjustDelta, setAdjustDelta] = useState("10000");
  const [adjustReason, setAdjustReason] = useState("Admin budget adjustment");

  const [resetTeamId, setResetTeamId] = useState<number | null>(null);
  const [resetPwd, setResetPwd] = useState("");

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("name", name);
      fd.append("shortCode", shortCode);
      fd.append("managerName", managerName);
      fd.append("username", username);
      fd.append("password", password);
      fd.append("initialBudget", initialBudget);
      if (logoFile) fd.append("logo", logoFile);

      await apiRequest("/api/admin/teams", { method: "POST", body: fd, isFormData: true });
      toast({ variant: "success", title: "Team Created", description: `${name} is ready for bidding.` });
      setName("");
      setShortCode("");
      setManagerName("");
      setUsername("");
      setPassword("");
      setLogoFile(null);
      await onRefresh();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Create team failed",
        description: err instanceof Error ? err.message : "Error",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleAdjustBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustTeamId) return;
    try {
      await apiRequest(`/api/admin/teams/${adjustTeamId}/adjust-budget`, {
        method: "POST",
        body: JSON.stringify({ amountDelta: Number(adjustDelta), reason: adjustReason }),
      });
      toast({ variant: "success", title: "Budget Adjusted" });
      setAdjustTeamId(null);
      await onRefresh();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Adjustment failed",
        description: err instanceof Error ? err.message : "Error",
      });
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTeamId) return;
    try {
      await apiRequest(`/api/admin/teams/${resetTeamId}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ newPassword: resetPwd }),
      });
      toast({ variant: "success", title: "Manager Password Reset" });
      setResetTeamId(null);
      setResetPwd("");
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Reset failed",
        description: err instanceof Error ? err.message : "Error",
      });
    }
  };

  const handleDelete = async (teamId: number) => {
    try {
      await apiRequest(`/api/admin/teams/${teamId}`, { method: "DELETE" });
      toast({ variant: "success", title: "Team Deleted" });
      await onRefresh();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Error",
      });
    }
  };

  return (
    <div className="grid lg:grid-cols-12 gap-6">
      <Card className="lg:col-span-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" /> Create New Team
          </CardTitle>
          <CardDescription>Creates the team and its isolated Team Manager login</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateTeam} className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 space-y-1">
                <Label>Team Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="NB-3 Strikers" required />
              </div>
              <div className="space-y-1">
                <Label>Code</Label>
                <Input value={shortCode} onChange={(e) => setShortCode(e.target.value)} placeholder="STK" maxLength={8} required />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Manager Full Name</Label>
              <Input value={managerName} onChange={(e) => setManagerName(e.target.value)} placeholder="Manager Name" required />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Login Username</Label>
                <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="strikers_mgr" required />
              </div>
              <div className="space-y-1">
                <Label>Login Password</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 6 chars" required />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Initial Budget (BDT ৳)</Label>
              <Input type="number" value={initialBudget} onChange={(e) => setInitialBudget(e.target.value)} min={0} required />
            </div>
            <div className="space-y-1">
              <Label>Team Logo (optional)</Label>
              <Input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setLogoFile(e.target.files?.[0] || null)} />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Creating..." : "Create Team & Manager Account"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="lg:col-span-8 space-y-4">
        {adjustTeamId && (
          <Card className="border-primary/50">
            <CardHeader>
              <CardTitle className="text-base">Adjust Team Budget (Creates Ledger Transaction)</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAdjustBudget} className="grid sm:grid-cols-4 gap-2 items-end">
                <div className="space-y-1">
                  <Label>Delta (+ or - ৳)</Label>
                  <Input type="number" value={adjustDelta} onChange={(e) => setAdjustDelta(e.target.value)} required />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <Label>Reason</Label>
                  <Input value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} required />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" size="sm">Apply</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setAdjustTeamId(null)}>Cancel</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {resetTeamId && (
          <Card className="border-primary/50">
            <CardHeader>
              <CardTitle className="text-base">Reset Team Manager Password</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleResetPassword} className="flex flex-wrap gap-2 items-end">
                <div className="flex-1 min-w-[200px] space-y-1">
                  <Label>New Password</Label>
                  <Input type="password" value={resetPwd} onChange={(e) => setResetPwd(e.target.value)} minLength={6} required />
                </div>
                <Button type="submit" size="sm">Save Password</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setResetTeamId(null)}>Cancel</Button>
              </form>
            </CardContent>
          </Card>
        )}

        <div className="grid sm:grid-cols-2 gap-4">
          {teams.map((t) => (
            <Card key={t.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <PlayerAvatar src={t.logo_url} name={t.short_code} size="md" />
                  <div className="min-w-0">
                    <div className="font-bold truncate">{t.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Mgr: {t.manager_name} (@{t.manager_username})
                    </div>
                  </div>
                </div>
                <Badge variant={t.status === "active" ? "success" : "destructive"}>{t.status.toUpperCase()}</Badge>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs bg-background/60 rounded-xl p-3 border border-border/60">
                <div>
                  <div className="text-muted-foreground">Initial</div>
                  <div className="font-bold">{formatBDT(t.initial_budget)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Spent</div>
                  <div className="font-bold text-amber-400">{formatBDT(t.spent_amount)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Balance</div>
                  <div className="font-bold text-primary">{formatBDT(t.current_balance)}</div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <Badge variant="outline">{t.players_count} Players</Badge>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => setAdjustTeamId(t.id)}>
                    <Wallet className="h-3.5 w-3.5" /> Budget
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setResetTeamId(t.id)}>
                    <KeyRound className="h-3.5 w-3.5" /> Password
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => handleDelete(t.id)}>
                    <Trash2 className="h-4 w-4 text-red-400" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
          {teams.length === 0 && (
            <Card className="p-8 col-span-full text-center text-muted-foreground">
              No teams created yet. Add your participating tournament teams using the form.
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
