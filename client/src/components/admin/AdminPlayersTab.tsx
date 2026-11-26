import React, { useMemo, useState } from "react";
import { Check, Copy, Edit3, FileSpreadsheet, KeyRound, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Badge, Input, Label } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { apiRequest } from "@/lib/api";
import { formatBDT } from "@/lib/utils";
import type { AdminPlayerRow } from "./AdminLiveControlTab";

export interface CategoryRow {
  id: number;
  name: string;
  base_price: number;
  min_increment: number;
  custom_duration_seconds: number | null;
  description: string;
  color: string;
  status: "active" | "inactive";
  sort_order: number;
}

export interface ProfileChangeRow {
  id: number;
  player_id: number;
  player_number: string;
  current_name: string;
  current_position: string;
  current_photo_url: string | null;
  submitted_by_username: string;
  proposed_full_name: string | null;
  proposed_position: string | null;
  proposed_jersey_number: string | null;
  proposed_preferred_foot: string | null;
  proposed_additional_info: string | null;
  proposed_photo_url: string | null;
  status: "pending" | "approved" | "rejected";
  review_note: string;
  created_at: string;
}

export function AdminPlayersTab({
  players,
  categories,
  profileChanges,
  onRefresh,
}: {
  players: AdminPlayerRow[];
  categories: CategoryRow[];
  profileChanges: ProfileChangeRow[];
  onRefresh: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [subView, setSubView] = useState<"list" | "approvals" | "import">("list");
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [claimFilter, setClaimFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Add / Edit form
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [playerNumber, setPlayerNumber] = useState("");
  const [fullName, setFullName] = useState("");
  const [categoryId, setCategoryId] = useState(String(categories[0]?.id || 1));
  const [position, setPosition] = useState("Midfielder (MF)");
  const [jerseyNumber, setJerseyNumber] = useState("");
  const [preferredFoot, setPreferredFoot] = useState("");
  const [roomNumber, setRoomNumber] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Hand Cash");
  const [paymentStatus, setPaymentStatus] = useState("Pending");
  const [additionalInfo, setAdditionalInfo] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  const [importFile, setImportFile] = useState<File | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkCategoryId, setBulkCategoryId] = useState(String(categories[0]?.id || 1));
  const [busy, setBusy] = useState(false);

  const handleInlineCategoryChange = async (playerId: number, nextCatId: number) => {
    try {
      await apiRequest("/api/admin/players/bulk-category", {
        method: "PATCH",
        body: JSON.stringify({ playerIds: [playerId], categoryId: nextCatId }),
      });
      const cat = categories.find((c) => c.id === nextCatId);
      toast({
        variant: "success",
        title: "Category Updated",
        description: cat ? `Assigned ${cat.name} (${formatBDT(cat.base_price)})` : undefined,
      });
      await onRefresh();
    } catch (err) {
      toast({ variant: "destructive", title: "Update failed", description: err instanceof Error ? err.message : "Error" });
    }
  };

  const handleBulkCategoryApply = async () => {
    if (selectedIds.length === 0) return;
    setBusy(true);
    try {
      await apiRequest("/api/admin/players/bulk-category", {
        method: "PATCH",
        body: JSON.stringify({ playerIds: selectedIds, categoryId: Number(bulkCategoryId) }),
      });
      toast({
        variant: "success",
        title: "Bulk Category Updated",
        description: `Updated ${selectedIds.length} player(s).`,
      });
      setSelectedIds([]);
      await onRefresh();
    } catch (err) {
      toast({ variant: "destructive", title: "Bulk update failed", description: err instanceof Error ? err.message : "Error" });
    } finally {
      setBusy(false);
    }
  };

  const openAddForm = () => {
    setEditingId(null);
    setPlayerNumber(`NB3-${String(players.length + 1).padStart(2, "0")}`);
    setFullName("");
    setCategoryId(String(categories[0]?.id || 1));
    setPosition("Midfielder (MF)");
    setJerseyNumber("");
    setPreferredFoot("");
    setRoomNumber("");
    setContactPhone("");
    setPaymentMethod("Hand Cash");
    setPaymentStatus("Pending");
    setAdditionalInfo("");
    setPhotoFile(null);
    setShowForm(true);
  };

  const openEditForm = (p: AdminPlayerRow) => {
    setEditingId(p.id);
    setPlayerNumber(p.player_number);
    setFullName(p.full_name);
    setCategoryId(String(p.category_id));
    setPosition(p.position);
    setJerseyNumber(p.jersey_number || "");
    setPreferredFoot(p.preferred_foot || "");
    setRoomNumber(p.room_number || "");
    setContactPhone(p.contact_phone || "");
    setPaymentMethod(p.payment_method || "");
    setPaymentStatus(p.payment_status || "");
    setAdditionalInfo(p.additional_info || "");
    setPhotoFile(null);
    setShowForm(true);
  };

  const handleSavePlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("playerNumber", playerNumber);
      fd.append("fullName", fullName);
      fd.append("categoryId", categoryId);
      fd.append("position", position);
      fd.append("jerseyNumber", jerseyNumber);
      fd.append("preferredFoot", preferredFoot);
      fd.append("roomNumber", roomNumber);
      fd.append("contactPhone", contactPhone);
      fd.append("paymentMethod", paymentMethod);
      fd.append("paymentStatus", paymentStatus);
      fd.append("additionalInfo", additionalInfo);
      if (photoFile) fd.append("photo", photoFile);

      if (editingId) {
        await apiRequest(`/api/admin/players/${editingId}`, { method: "PUT", body: fd, isFormData: true });
        toast({ variant: "success", title: "Player Updated" });
      } else {
        const res = await apiRequest<{ claimCode: string }>("/api/admin/players", {
          method: "POST",
          body: fd,
          isFormData: true,
        });
        toast({
          variant: "success",
          title: "Player Added",
          description: `Claim Code: ${res.claimCode}`,
        });
      }
      setShowForm(false);
      await onRefresh();
    } catch (err) {
      toast({ variant: "destructive", title: "Save failed", description: err instanceof Error ? err.message : "Error" });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await apiRequest(`/api/admin/players/${id}`, { method: "DELETE" });
      toast({ variant: "success", title: "Player Deleted" });
      await onRefresh();
    } catch (err) {
      toast({ variant: "destructive", title: "Delete failed", description: err instanceof Error ? err.message : "Error" });
    }
  };

  const handleRegenCode = async (id: number) => {
    try {
      const res = await apiRequest<{ claimCode: string }>(`/api/admin/players/${id}/regenerate-claim-code`, {
        method: "POST",
      });
      toast({ variant: "success", title: "New Claim Code Generated", description: `Code: ${res.claimCode}` });
      await onRefresh();
    } catch (err) {
      toast({ variant: "destructive", title: "Failed", description: err instanceof Error ? err.message : "Error" });
    }
  };

  const handleBulkImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", importFile);
      const res = await apiRequest<{ imported: number; skipped: number }>("/api/admin/players/import", {
        method: "POST",
        body: fd,
        isFormData: true,
      });
      toast({
        variant: "success",
        title: "Import Complete",
        description: `Imported ${res.imported} players (${res.skipped} skipped).`,
      });
      setImportFile(null);
      setSubView("list");
      await onRefresh();
    } catch (err) {
      toast({ variant: "destructive", title: "Import failed", description: err instanceof Error ? err.message : "Error" });
    } finally {
      setBusy(false);
    }
  };

  const handleReviewChange = async (changeId: number, decision: "approved" | "rejected") => {
    try {
      await apiRequest(`/api/admin/profile-changes/${changeId}/review`, {
        method: "POST",
        body: JSON.stringify({ decision }),
      });
      toast({ variant: "success", title: `Profile change ${decision}` });
      await onRefresh();
    } catch (err) {
      toast({ variant: "destructive", title: "Review failed", description: err instanceof Error ? err.message : "Error" });
    }
  };

  const filtered = useMemo(() => {
    return players.filter((p) => {
      const q = search.trim().toLowerCase();
      const matchQ =
        !q ||
        p.full_name.toLowerCase().includes(q) ||
        p.player_number.toLowerCase().includes(q) ||
        p.room_number.toLowerCase().includes(q) ||
        p.contact_phone.includes(q);
      const matchCat = catFilter === "all" || String(p.category_id) === catFilter;
      const matchClaim =
        claimFilter === "all" || (claimFilter === "claimed" ? p.is_claimed === 1 : p.is_claimed === 0);
      const matchStatus = statusFilter === "all" || p.auction_status === statusFilter;
      return matchQ && matchCat && matchClaim && matchStatus;
    });
  }, [players, search, catFilter, claimFilter, statusFilter]);

  const pendingApprovalsCount = profileChanges.filter((c) => c.status === "pending").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={subView === "list" ? "default" : "outline"} onClick={() => setSubView("list")}>
            All Players ({players.length})
          </Button>
          <Button
            size="sm"
            variant={subView === "approvals" ? "default" : "outline"}
            onClick={() => setSubView("approvals")}
          >
            Profile Approvals {pendingApprovalsCount > 0 ? `(${pendingApprovalsCount})` : ""}
          </Button>
          <Button size="sm" variant={subView === "import" ? "default" : "outline"} onClick={() => setSubView("import")}>
            <FileSpreadsheet className="h-4 w-4" /> Bulk CSV / Excel Import
          </Button>
        </div>
        <Button size="sm" onClick={openAddForm}>
          <Plus className="h-4 w-4" /> Add Player
        </Button>
      </div>

      {/* Add / Edit Player Form */}
      {showForm && (
        <Card className="border-primary/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{editingId ? "Edit Player" : "Add Individual Player"}</CardTitle>
            <Button size="icon" variant="ghost" onClick={() => setShowForm(false)}>
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSavePlayer} className="grid sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Player Number</Label>
                <Input value={playerNumber} onChange={(e) => setPlayerNumber(e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label>Full Name</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label>Category</Label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="flex h-10 w-full rounded-lg border border-border bg-background/70 px-3 text-sm"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({formatBDT(c.base_price)})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Playing Position</Label>
                <Input value={position} onChange={(e) => setPosition(e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label>Room / Unit</Label>
                <Input value={roomNumber} onChange={(e) => setRoomNumber(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Contact Phone</Label>
                <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Payment Method</Label>
                <Input value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Payment Status</Label>
                <Input value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Photo (optional)</Label>
                <Input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
                />
              </div>
              <div className="sm:col-span-3 flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? "Saving..." : editingId ? "Update Player" : "Create Player"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {subView === "import" && (
        <Card>
          <CardHeader>
            <CardTitle>Bulk Import Players (CSV / Excel .xlsx)</CardTitle>
            <CardDescription>
              Columns supported: <code>Player Number</code>, <code>Full Name</code>, <code>Category</code>,{" "}
              <code>Position</code>, <code>Room</code>, <code>Phone</code>, <code>Payment Method</code>,{" "}
              <code>Payment Status</code>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleBulkImport} className="flex flex-wrap items-center gap-3">
              <Input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                className="max-w-md"
                required
              />
              <Button type="submit" disabled={!importFile || busy}>
                {busy ? "Importing..." : "Upload & Import Players"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {subView === "approvals" && (
        <Card>
          <CardHeader>
            <CardTitle>Player Profile Change Requests</CardTitle>
            <CardDescription>Approve or reject updates submitted via the Player Claim Portal</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {profileChanges.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border border-border/80 bg-background/60 p-4 flex flex-wrap items-center justify-between gap-4"
              >
                <div className="flex items-center gap-4">
                  <PlayerAvatar src={c.proposed_photo_url || c.current_photo_url} name={c.current_name} size="md" />
                  <div className="space-y-1 text-sm">
                    <div className="font-bold">
                      {c.player_number} · {c.current_name}
                      {c.proposed_full_name && c.proposed_full_name !== c.current_name && (
                        <span className="text-primary"> → {c.proposed_full_name}</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Position: {c.current_position} →{" "}
                      <strong className="text-foreground">{c.proposed_position || c.current_position}</strong>
                      {c.proposed_jersey_number && ` · Jersey #${c.proposed_jersey_number}`}
                      {c.proposed_preferred_foot && ` · ${c.proposed_preferred_foot} Foot`}
                    </div>
                    {c.proposed_additional_info && (
                      <div className="text-xs text-muted-foreground">Bio: {c.proposed_additional_info}</div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {c.status === "pending" ? (
                    <>
                      <Button size="sm" variant="success" onClick={() => handleReviewChange(c.id, "approved")}>
                        <Check className="h-4 w-4" /> Approve
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => handleReviewChange(c.id, "rejected")}>
                        <X className="h-4 w-4" /> Reject
                      </Button>
                    </>
                  ) : (
                    <Badge variant={c.status === "approved" ? "success" : "destructive"}>
                      {c.status.toUpperCase()}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
            {profileChanges.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">No profile change requests yet.</p>
            )}
          </CardContent>
        </Card>
      )}

      {subView === "list" && (
        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, #number, room, phone..."
                  className="pl-9"
                />
              </div>
              <select
                value={catFilter}
                onChange={(e) => setCatFilter(e.target.value)}
                className="h-10 rounded-lg border border-border bg-background/70 px-3 text-sm"
              >
                <option value="all">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select
                value={claimFilter}
                onChange={(e) => setClaimFilter(e.target.value)}
                className="h-10 rounded-lg border border-border bg-background/70 px-3 text-sm"
              >
                <option value="all">All Claims</option>
                <option value="claimed">Claimed</option>
                <option value="unclaimed">Unclaimed</option>
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-10 rounded-lg border border-border bg-background/70 px-3 text-sm"
              >
                <option value="all">All Auction Status</option>
                <option value="unauctioned">Unauctioned</option>
                <option value="queued">Queued</option>
                <option value="live">Live</option>
                <option value="sold">Sold</option>
                <option value="unsold">Unsold</option>
              </select>
            </div>

            {selectedIds.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/40 bg-primary/10 px-4 py-2.5 text-sm">
                <span className="font-semibold text-primary">{selectedIds.length} player(s) selected</span>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={bulkCategoryId}
                    onChange={(e) => setBulkCategoryId(e.target.value)}
                    className="h-9 rounded-lg border border-border bg-background px-3 text-sm"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        {c.name} ({formatBDT(c.base_price)})
                      </option>
                    ))}
                  </select>
                  <Button size="sm" onClick={handleBulkCategoryApply} disabled={busy}>
                    Assign Category
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>
                    Clear
                  </Button>
                </div>
              </div>
            )}
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3 w-8">
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && filtered.every((p) => selectedIds.includes(p.id))}
                      onChange={(e) =>
                        setSelectedIds(e.target.checked ? filtered.map((p) => p.id) : [])
                      }
                      className="h-4 w-4 accent-primary"
                    />
                  </th>
                  <th className="py-2 pr-3">Player</th>
                  <th className="py-2 pr-3">Category (Quick Select)</th>
                  <th className="py-2 pr-3">Position</th>
                  <th className="py-2 pr-3">Contact / Room</th>
                  <th className="py-2 pr-3">Claim Status & Code</th>
                  <th className="py-2 pr-3">Auction</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-b border-border/50">
                    <td className="py-2.5 pr-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(p.id)}
                        onChange={(e) =>
                          setSelectedIds((prev) =>
                            e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id)
                          )
                        }
                        className="h-4 w-4 accent-primary"
                      />
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2.5">
                        <PlayerAvatar src={p.photo_url} name={p.full_name} size="sm" />
                        <div>
                          <div className="font-semibold">{p.full_name}</div>
                          <div className="text-xs text-primary font-bold">{p.player_number}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 pr-3">
                      <select
                        value={String(p.category_id)}
                        disabled={p.auction_status === "live"}
                        onChange={(e) => handleInlineCategoryChange(p.id, Number(e.target.value))}
                        className="h-9 rounded-lg border border-border bg-background/80 px-2.5 text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={String(c.id)}>
                            {c.name} · {formatBDT(c.base_price)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2.5 pr-3 text-xs">{p.position}</td>
                    <td className="py-2.5 pr-3 text-xs">
                      <div>{p.contact_phone || "-"}</div>
                      <div className="text-muted-foreground">
                        Room: {p.room_number || "-"} · {p.payment_status || p.payment_method}
                      </div>
                    </td>
                    <td className="py-2.5 pr-3">
                      {p.is_claimed ? (
                        <Badge variant="success">CLAIMED (@{p.claimed_username})</Badge>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline">
                            <KeyRound className="h-3 w-3 text-primary" />
                            {p.claim_code_plain || "HASHED"}
                          </Badge>
                          {p.claim_code_plain && (
                            <button
                              title="Copy claim code"
                              onClick={() => {
                                navigator.clipboard.writeText(p.claim_code_plain || "");
                                toast({ title: "Claim code copied", description: `${p.player_number}: ${p.claim_code_plain}` });
                              }}
                              className="text-muted-foreground hover:text-primary"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            title="Regenerate claim code"
                            onClick={() => handleRegenCode(p.id)}
                            className="text-muted-foreground hover:text-primary"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 pr-3">
                      <Badge
                        variant={
                          p.auction_status === "sold"
                            ? "success"
                            : p.auction_status === "unsold"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {p.auction_status.toUpperCase()}
                      </Badge>
                      {p.sold_team_name && (
                        <div className="text-xs text-emerald-400 mt-0.5">
                          {p.sold_team_name} ({formatBDT(p.sold_price)})
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 text-right whitespace-nowrap">
                      <Button size="icon" variant="ghost" onClick={() => openEditForm(p)}>
                        <Edit3 className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => handleDelete(p.id)}>
                        <Trash2 className="h-4 w-4 text-red-400" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
