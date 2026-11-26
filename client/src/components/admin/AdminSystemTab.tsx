import { useEffect, useState } from "react";
import { Database, Download, RotateCcw, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { apiRequest, getStoredToken } from "@/lib/api";

interface UserRow {
  id: number;
  username: string;
  role: string;
  display_name: string;
  team_name: string | null;
  player_number: string | null;
  is_active: number;
  created_at: string;
}

interface LogRow {
  id: number;
  actor_username: string;
  actor_role: string;
  action: string;
  entity_type: string;
  details_json: string;
  created_at: string;
}

interface BackupRow {
  filename: string;
  size: number;
  createdAt: string;
}

export function AdminSystemTab({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [backups, setBackups] = useState<BackupRow[]>([]);
  const [busy, setBusy] = useState(false);

  const loadAll = async () => {
    try {
      const [u, l, b] = await Promise.all([
        apiRequest<{ users: UserRow[] }>("/api/admin/users"),
        apiRequest<{ logs: LogRow[] }>("/api/admin/audit-logs"),
        apiRequest<{ backups: BackupRow[] }>("/api/admin/backups"),
      ]);
      setUsers(u.users);
      setLogs(l.logs);
      setBackups(b.backups);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const toggleUser = async (id: number) => {
    try {
      await apiRequest(`/api/admin/users/${id}/toggle`, { method: "PUT" });
      toast({ variant: "success", title: "User status updated" });
      await loadAll();
    } catch (err) {
      toast({ variant: "destructive", title: "Failed", description: err instanceof Error ? err.message : "Error" });
    }
  };

  const createBackup = async () => {
    setBusy(true);
    try {
      const res = await apiRequest<{ backup: { filename: string } }>("/api/admin/backups/create", { method: "POST" });
      toast({ variant: "success", title: "Backup Created", description: res.backup.filename });
      await loadAll();
    } catch (err) {
      toast({ variant: "destructive", title: "Backup failed", description: err instanceof Error ? err.message : "Error" });
    } finally {
      setBusy(false);
    }
  };

  const restoreBackup = async (filename: string) => {
    if (!confirm(`Restore database from ${filename}? A safety backup will be created first.`)) return;
    setBusy(true);
    try {
      await apiRequest(`/api/admin/backups/${encodeURIComponent(filename)}/restore`, { method: "POST" });
      toast({ variant: "success", title: "Database Restored", description: filename });
      await loadAll();
      await onRefresh();
    } catch (err) {
      toast({ variant: "destructive", title: "Restore failed", description: err instanceof Error ? err.message : "Error" });
    } finally {
      setBusy(false);
    }
  };

  const downloadBackup = async (filename: string) => {
    const token = getStoredToken();
    const res = await fetch(`/api/admin/backups/${encodeURIComponent(filename)}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Backups */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" /> SQLite Database Backups & Restore
            </CardTitle>
            <CardDescription>Automatic periodic backups plus manual snapshot and one-click restore</CardDescription>
          </div>
          <Button onClick={createBackup} disabled={busy}>
            Create Backup Now
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {backups.map((b) => (
            <div
              key={b.filename}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/50 px-4 py-2.5 text-sm"
            >
              <div>
                <div className="font-mono text-xs font-semibold">{b.filename}</div>
                <div className="text-xs text-muted-foreground">
                  {(b.size / 1024).toFixed(1)} KB · {new Date(b.createdAt).toLocaleString()}
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => downloadBackup(b.filename)}>
                  <Download className="h-3.5 w-3.5" /> Download
                </Button>
                <Button size="sm" variant="ember" disabled={busy} onClick={() => restoreBackup(b.filename)}>
                  <RotateCcw className="h-3.5 w-3.5" /> Restore
                </Button>
              </div>
            </div>
          ))}
          {backups.length === 0 && <p className="text-sm text-muted-foreground">No backups created yet.</p>}
        </CardContent>
      </Card>

      {/* User Accounts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" /> System Users ({users.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 pr-4">Username</th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Display Name</th>
                <th className="py-2 pr-4">Linked Entity</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-border/50">
                  <td className="py-2 pr-4 font-mono text-xs">{u.username}</td>
                  <td className="py-2 pr-4">
                    <Badge variant="outline">{u.role}</Badge>
                  </td>
                  <td className="py-2 pr-4">{u.display_name}</td>
                  <td className="py-2 pr-4 text-xs text-muted-foreground">
                    {u.team_name || u.player_number || "System"}
                  </td>
                  <td className="py-2 pr-4">
                    <Badge variant={u.is_active ? "success" : "destructive"}>
                      {u.is_active ? "ACTIVE" : "DISABLED"}
                    </Badge>
                  </td>
                  <td className="py-2 text-right">
                    {u.role !== "super_admin" && (
                      <Button size="sm" variant="outline" onClick={() => toggleUser(u.id)}>
                        {u.is_active ? "Disable" : "Enable"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Audit Activity Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audit Activity Logs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 max-h-80 overflow-y-auto">
          {logs.map((l) => (
            <div key={l.id} className="flex flex-wrap justify-between gap-2 text-xs border-b border-border/40 py-2">
              <div>
                <Badge variant="secondary" className="mr-2">
                  {l.action}
                </Badge>
                <span className="font-semibold">{l.actor_username}</span>{" "}
                <span className="text-muted-foreground">({l.actor_role})</span>{" "}
                <span className="text-muted-foreground">{l.details_json}</span>
              </div>
              <span className="text-muted-foreground">{new Date(l.created_at + "Z").toLocaleString()}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
