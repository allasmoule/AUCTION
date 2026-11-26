import React, { useEffect, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { Badge, Input, Label } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { apiRequest } from "@/lib/api";
import { formatBDT } from "@/lib/utils";
import type { CategoryRow } from "./AdminPlayersTab";

export interface AuctionSettingsRow {
  auction_title: string;
  default_duration_seconds: number;
  default_starting_price: number;
  default_min_increment: number;
  anti_sniping_enabled: number;
  anti_sniping_threshold_seconds: number;
  anti_sniping_extension_seconds: number;
  auto_next_player: number;
  auto_pause_between_players: number;
  auto_pause_seconds: number;
  scheduled_start_at: string | null;
  auction_status: "draft" | "scheduled" | "live" | "paused" | "completed";
}

export function AdminSettingsTab({
  categories,
  settings,
  onRefresh,
}: {
  categories: CategoryRow[];
  settings: AuctionSettingsRow | null;
  onRefresh: () => Promise<void>;
}) {
  const { toast } = useToast();

  // Category editing state
  const [editingCat, setEditingCat] = useState<CategoryRow | null>(null);
  const [catName, setCatName] = useState("");
  const [basePrice, setBasePrice] = useState("5000");
  const [minIncrement, setMinIncrement] = useState("500");
  const [customDur, setCustomDur] = useState("");
  const [catDesc, setCatDesc] = useState("");
  const [catColor, setCatColor] = useState("#FABD2F");

  // Auction settings state
  const [title, setTitle] = useState("YKSG NB-3 PLAYER AUCTION");
  const [defaultDuration, setDefaultDuration] = useState("60");
  const [defaultStartPrice, setDefaultStartPrice] = useState("2000");
  const [defaultMinInc, setDefaultMinInc] = useState("500");
  const [antiSniping, setAntiSniping] = useState(true);
  const [snipeThreshold, setSnipeThreshold] = useState("10");
  const [snipeExtension, setSnipeExtension] = useState("15");
  const [autoNext, setAutoNext] = useState(false);
  const [autoPause, setAutoPause] = useState(true);
  const [autoPauseSec, setAutoPauseSec] = useState("8");
  const [scheduledStart, setScheduledStart] = useState("");
  const [auctionStatus, setAuctionStatus] = useState<"draft" | "scheduled" | "live" | "paused" | "completed">("draft");

  useEffect(() => {
    if (settings) {
      setTitle(settings.auction_title);
      setDefaultDuration(String(settings.default_duration_seconds));
      setDefaultStartPrice(String(settings.default_starting_price));
      setDefaultMinInc(String(settings.default_min_increment));
      setAntiSniping(Boolean(settings.anti_sniping_enabled));
      setSnipeThreshold(String(settings.anti_sniping_threshold_seconds));
      setSnipeExtension(String(settings.anti_sniping_extension_seconds));
      setAutoNext(Boolean(settings.auto_next_player));
      setAutoPause(Boolean(settings.auto_pause_between_players));
      setAutoPauseSec(String(settings.auto_pause_seconds));
      setScheduledStart(settings.scheduled_start_at || "");
      setAuctionStatus(settings.auction_status);
    }
  }, [settings]);

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        name: catName,
        basePrice: Number(basePrice),
        minIncrement: Number(minIncrement),
        customDurationSeconds: customDur ? Number(customDur) : null,
        description: catDesc,
        color: catColor,
        status: "active",
        sortOrder: editingCat ? editingCat.sort_order : categories.length + 1,
      };
      if (editingCat) {
        await apiRequest(`/api/admin/categories/${editingCat.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        toast({ variant: "success", title: "Category Updated" });
      } else {
        await apiRequest("/api/admin/categories", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast({ variant: "success", title: "Category Added" });
      }
      setEditingCat(null);
      setCatName("");
      setCatDesc("");
      setCustomDur("");
      await onRefresh();
    } catch (err) {
      toast({ variant: "destructive", title: "Category failed", description: err instanceof Error ? err.message : "Error" });
    }
  };

  const startEditCategory = (c: CategoryRow) => {
    setEditingCat(c);
    setCatName(c.name);
    setBasePrice(String(c.base_price));
    setMinIncrement(String(c.min_increment));
    setCustomDur(c.custom_duration_seconds ? String(c.custom_duration_seconds) : "");
    setCatDesc(c.description);
    setCatColor(c.color || "#FABD2F");
  };

  const deleteCategory = async (id: number) => {
    try {
      await apiRequest(`/api/admin/categories/${id}`, { method: "DELETE" });
      toast({ variant: "success", title: "Category Deleted" });
      await onRefresh();
    } catch (err) {
      toast({ variant: "destructive", title: "Delete failed", description: err instanceof Error ? err.message : "Error" });
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify({
          auctionTitle: title,
          defaultDurationSeconds: Number(defaultDuration),
          defaultStartingPrice: Number(defaultStartPrice),
          defaultMinIncrement: Number(defaultMinInc),
          antiSnipingEnabled: antiSniping,
          antiSnipingThresholdSeconds: Number(snipeThreshold),
          antiSnipingExtensionSeconds: Number(snipeExtension),
          autoNextPlayer: autoNext,
          autoPauseBetweenPlayers: autoPause,
          autoPauseSeconds: Number(autoPauseSec),
          scheduledStartAt: scheduledStart || null,
          auctionStatus,
        }),
      });
      toast({ variant: "success", title: "Auction Settings Saved" });
      await onRefresh();
    } catch (err) {
      toast({ variant: "destructive", title: "Settings failed", description: err instanceof Error ? err.message : "Error" });
    }
  };

  return (
    <div className="grid lg:grid-cols-12 gap-6">
      {/* Player Categories */}
      <div className="lg:col-span-6 space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Player Category & Pricing Settings</CardTitle>
            <CardDescription>
              Configure base prices, minimum increments, and optional category-specific timer durations. Historical
              completed auctions keep their snapshot prices.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              {categories.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/50 p-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: c.color }} />
                      <span className="font-bold">{c.name}</span>
                      <Badge variant="outline">Base {formatBDT(c.base_price)}</Badge>
                      <Badge variant="secondary">+{formatBDT(c.min_increment)}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {c.description || "No description"}
                      {c.custom_duration_seconds ? ` · Custom Timer: ${c.custom_duration_seconds}s` : ""}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => startEditCategory(c)}>
                      Edit
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => deleteCategory(c.id)}>
                      <Trash2 className="h-4 w-4 text-red-400" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={handleSaveCategory} className="space-y-3 pt-4 border-t border-border">
              <div className="text-sm font-bold">{editingCat ? `Editing ${editingCat.name}` : "Add Category"}</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Category Name</Label>
                  <Input value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="Category A+" required />
                </div>
                <div className="space-y-1">
                  <Label>Base Price (৳)</Label>
                  <Input type="number" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} min={0} required />
                </div>
                <div className="space-y-1">
                  <Label>Min Increment (৳)</Label>
                  <Input type="number" value={minIncrement} onChange={(e) => setMinIncrement(e.target.value)} min={1} required />
                </div>
                <div className="space-y-1">
                  <Label>Custom Duration (sec, optional)</Label>
                  <Input
                    type="number"
                    value={customDur}
                    onChange={(e) => setCustomDur(e.target.value)}
                    placeholder="Use default"
                    min={10}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Description</Label>
                  <Input value={catDesc} onChange={(e) => setCatDesc(e.target.value)} placeholder="Tier description" />
                </div>
                <div className="space-y-1">
                  <Label>Badge Color</Label>
                  <Input type="color" value={catColor} onChange={(e) => setCatColor(e.target.value)} className="h-10 p-1" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm">
                  <Plus className="h-4 w-4" /> {editingCat ? "Update Category" : "Add Category"}
                </Button>
                {editingCat && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditingCat(null)}>
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Global Auction Settings */}
      <div className="lg:col-span-6">
        <Card>
          <CardHeader>
            <CardTitle>Auction Configuration Settings</CardTitle>
            <CardDescription>Server-authoritative timer presets, anti-sniping, and automated flow</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div className="space-y-1">
                <Label>Auction Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
              </div>

              <div className="space-y-2">
                <Label>Default Player Auction Duration (Seconds)</Label>
                <div className="flex flex-wrap gap-2">
                  {[30, 45, 60, 90, 120].map((sec) => (
                    <Button
                      key={sec}
                      type="button"
                      size="sm"
                      variant={Number(defaultDuration) === sec ? "default" : "outline"}
                      onClick={() => setDefaultDuration(String(sec))}
                    >
                      {sec}s
                    </Button>
                  ))}
                  <Input
                    type="number"
                    min={10}
                    max={600}
                    value={defaultDuration}
                    onChange={(e) => setDefaultDuration(e.target.value)}
                    className="w-24 h-8"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Fallback Starting Price (৳)</Label>
                  <Input
                    type="number"
                    value={defaultStartPrice}
                    onChange={(e) => setDefaultStartPrice(e.target.value)}
                    min={0}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Fallback Min Increment (৳)</Label>
                  <Input
                    type="number"
                    value={defaultMinInc}
                    onChange={(e) => setDefaultMinInc(e.target.value)}
                    min={1}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-border/70 bg-background/50 p-3 space-y-3">
                <label className="flex items-center justify-between text-sm font-semibold cursor-pointer">
                  <span>Anti-Sniping Timer Extension</span>
                  <input
                    type="checkbox"
                    checked={antiSniping}
                    onChange={(e) => setAntiSniping(e.target.checked)}
                    className="h-4 w-4 accent-primary"
                  />
                </label>
                {antiSniping && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Trigger Under (sec)</Label>
                      <Input type="number" value={snipeThreshold} onChange={(e) => setSnipeThreshold(e.target.value)} min={1} />
                    </div>
                    <div className="space-y-1">
                      <Label>Extend To (sec)</Label>
                      <Input type="number" value={snipeExtension} onChange={(e) => setSnipeExtension(e.target.value)} min={1} />
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-border/70 bg-background/50 p-3 space-y-3">
                <label className="flex items-center justify-between text-sm font-semibold cursor-pointer">
                  <span>Automatic Next-Player Selection (from Queue)</span>
                  <input
                    type="checkbox"
                    checked={autoNext}
                    onChange={(e) => setAutoNext(e.target.checked)}
                    className="h-4 w-4 accent-primary"
                  />
                </label>
                <label className="flex items-center justify-between text-sm font-semibold cursor-pointer">
                  <span>Auto-Pause Cooldown Between Players</span>
                  <input
                    type="checkbox"
                    checked={autoPause}
                    onChange={(e) => setAutoPause(e.target.checked)}
                    className="h-4 w-4 accent-primary"
                  />
                </label>
                {autoPause && (
                  <div className="space-y-1">
                    <Label>Cooldown Duration (seconds)</Label>
                    <Input type="number" value={autoPauseSec} onChange={(e) => setAutoPauseSec(e.target.value)} min={0} />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Scheduled Start Date & Time</Label>
                  <Input
                    type="datetime-local"
                    value={scheduledStart}
                    onChange={(e) => setScheduledStart(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Auction Status</Label>
                  <select
                    value={auctionStatus}
                    onChange={(e) =>
                      setAuctionStatus(e.target.value as "draft" | "scheduled" | "live" | "paused" | "completed")
                    }
                    className="flex h-10 w-full rounded-lg border border-border bg-background/70 px-3 text-sm"
                  >
                    <option value="draft">Draft</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="live">Live</option>
                    <option value="paused">Paused</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>

              <Button type="submit" className="w-full">
                <Save className="h-4 w-4" /> Save Auction Configuration
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
