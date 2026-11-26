import React, { useEffect, useState } from "react";
import { CheckCircle2, Clock, KeyRound, Search, Upload, UserCheck, XCircle } from "lucide-react";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Badge, Input, Label, Textarea } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/api";
import { formatBDT } from "@/lib/utils";

interface LookupResult {
  id: number;
  playerNumber: string;
  fullName: string;
  position: string;
  roomNumber: string;
  photoUrl: string | null;
  categoryName: string;
  isClaimed: boolean;
  requiresPhoneLast4: boolean;
}

interface PlayerProfileData {
  player: {
    id: number;
    player_number: string;
    full_name: string;
    position: string;
    jersey_number: string;
    preferred_foot: string;
    room_number: string;
    additional_info: string;
    photo_url: string | null;
    auction_status: string;
    sold_price: number | null;
    sold_team_name: string | null;
    category_name: string;
    base_price: number;
  };
  changes: Array<{
    id: number;
    proposed_full_name: string | null;
    proposed_position: string | null;
    proposed_jersey_number: string | null;
    proposed_preferred_foot: string | null;
    proposed_additional_info: string | null;
    proposed_photo_url: string | null;
    status: "pending" | "approved" | "rejected";
    review_note: string;
    created_at: string;
  }>;
}

const POSITIONS = [
  "Goalkeeper (GK)",
  "Defender (DF)",
  "Midfielder (MF)",
  "Forward (FW)",
  "Striker (ST)",
  "Midfielder (MF), Forward (FW)",
  "Forward (FW), Striker (ST)",
];

export function PlayerClaimPage() {
  const { user, setSession, login } = useAuth();
  const { toast } = useToast();

  // Lookup & Claim state
  const [playerNumber, setPlayerNumber] = useState("");
  const [foundPlayer, setFoundPlayer] = useState<LookupResult | null>(null);
  const [claimMethod, setClaimMethod] = useState<"phone" | "code">("phone");
  const [fullPhone, setFullPhone] = useState("");
  const [claimCode, setClaimCode] = useState("");
  const [phoneLast4, setPhoneLast4] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // Logged-in player state
  const [profileData, setProfileData] = useState<PlayerProfileData | null>(null);
  const [fullName, setFullName] = useState("");
  const [position, setPosition] = useState("");
  const [jerseyNumber, setJerseyNumber] = useState("");
  const [preferredFoot, setPreferredFoot] = useState("");
  const [additionalInfo, setAdditionalInfo] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const loadMyProfile = async () => {
    try {
      const data = await apiRequest<PlayerProfileData>("/api/player-claim/me");
      setProfileData(data);
      setFullName(data.player.full_name || "");
      setPosition(data.player.position || "");
      setJerseyNumber(data.player.jersey_number || "");
      setPreferredFoot(data.player.preferred_foot || "");
      setAdditionalInfo(data.player.additional_info || "");
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (user?.role === "player") {
      loadMyProfile();
    }
  }, [user]);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const data = await apiRequest<{ player: LookupResult }>("/api/player-claim/lookup", {
        method: "POST",
        body: JSON.stringify({ playerNumber }),
      });
      setFoundPlayer(data.player);
    } catch (err) {
      setFoundPlayer(null);
      toast({
        variant: "destructive",
        title: "Lookup failed",
        description: err instanceof Error ? err.message : "Player not found",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!foundPlayer) return;
    setBusy(true);
    try {
      const endpoint = claimMethod === "phone" ? "/api/player-claim/claim-by-phone" : "/api/player-claim/claim";
      const payload =
        claimMethod === "phone"
          ? {
              playerNumber: foundPlayer.playerNumber,
              phone: fullPhone,
              password: password || undefined,
            }
          : {
              playerNumber: foundPlayer.playerNumber,
              claimCode,
              phoneLast4,
              username,
              password,
            };

      const data = await apiRequest<{
        token: string;
        user: { id: number; username: string; role: "player"; displayName: string; playerId: number };
      }>(endpoint, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setSession(data.token, data.user);
      toast({
        variant: "success",
        title: "Profile Claimed!",
        description: "Account opened! You can now upload your photo and view your base price.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Verification failed",
        description: err instanceof Error ? err.message : "Could not claim profile",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleAlreadyClaimedLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(loginUsername, loginPassword, "player");
      toast({ variant: "success", title: "Signed in to Player Portal" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Login failed",
        description: err instanceof Error ? err.message : "Invalid credentials",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("fullName", fullName);
      fd.append("position", position);
      fd.append("jerseyNumber", jerseyNumber);
      fd.append("preferredFoot", preferredFoot);
      fd.append("additionalInfo", additionalInfo);
      if (photoFile) {
        fd.append("photo", photoFile);
      }
      const res = await apiRequest<{ message: string }>("/api/player-claim/profile-update", {
        method: "POST",
        body: fd,
        isFormData: true,
      });
      toast({ variant: "success", title: "Submitted for Approval", description: res.message });
      setPhotoFile(null);
      setPhotoPreview(null);
      await loadMyProfile();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: err instanceof Error ? err.message : "Could not submit profile update",
      });
    } finally {
      setBusy(false);
    }
  };

  // Logged in Player Profile Management View
  if (user?.role === "player" && profileData) {
    const p = profileData.player;
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Badge className="mb-2">PLAYER PORTAL · {p.player_number}</Badge>
            <h1 className="font-display text-4xl tracking-wide">
              MY PLAYER <span className="text-primary">PROFILE</span>
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={p.auction_status === "sold" ? "success" : "secondary"}>
              {p.auction_status.toUpperCase()}
              {p.sold_team_name ? ` · ${p.sold_team_name} (${formatBDT(p.sold_price)})` : ""}
            </Badge>
          </div>
        </div>

        <div className="grid lg:grid-cols-12 gap-6">
          {/* Current Card */}
          <Card className="lg:col-span-5">
            <CardHeader>
              <CardTitle>Official Auction Card</CardTitle>
              <CardDescription>Displayed on the Live Auction Theatre</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center text-center space-y-4">
              <PlayerAvatar src={photoPreview || profileData.changes.find((c) => c.status === "pending" && c.proposed_photo_url)?.proposed_photo_url || p.photo_url} name={p.full_name} size="xl" />
              <div>
                <div className="text-xs font-bold text-primary">
                  {p.player_number} · {p.category_name}
                </div>
                <div className="font-display text-4xl tracking-wide mt-1">{p.full_name}</div>
                <div className="text-sm text-muted-foreground">{p.position}</div>
              </div>
              <div className="w-full rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Auction Base Price</span>
                <span className="font-display text-3xl text-primary">{formatBDT(p.base_price)}</span>
              </div>
              <div className="w-full grid grid-cols-3 gap-2 pt-3 border-t border-border/60 text-xs">
                <div>
                  <div className="text-muted-foreground">Jersey</div>
                  <div className="font-bold">{p.jersey_number || "-"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Foot</div>
                  <div className="font-bold">{p.preferred_foot || "-"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Room</div>
                  <div className="font-bold">{p.room_number || "-"}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Edit Form */}
          <Card className="lg:col-span-7">
            <CardHeader>
              <CardTitle>Update Playing Position & Photo</CardTitle>
              <CardDescription>
                Changes are reviewed and approved by the tournament Admin before appearing live.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleProfileUpdate} className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Full Name</Label>
                    <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Playing Position</Label>
                    <select
                      value={position}
                      onChange={(e) => setPosition(e.target.value)}
                      className="flex h-10 w-full rounded-lg border border-border bg-background/70 px-3 text-sm"
                    >
                      {!POSITIONS.includes(position) && position && <option value={position}>{position}</option>}
                      {POSITIONS.map((pos) => (
                        <option key={pos} value={pos}>
                          {pos}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Preferred Jersey Number</Label>
                    <Input
                      value={jerseyNumber}
                      onChange={(e) => setJerseyNumber(e.target.value)}
                      placeholder="e.g. 10"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Preferred Foot</Label>
                    <select
                      value={preferredFoot}
                      onChange={(e) => setPreferredFoot(e.target.value)}
                      className="flex h-10 w-full rounded-lg border border-border bg-background/70 px-3 text-sm"
                    >
                      <option value="">Select foot</option>
                      <option value="Right">Right</option>
                      <option value="Left">Left</option>
                      <option value="Both">Both</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Additional Information / Bio</Label>
                  <Textarea
                    value={additionalInfo}
                    onChange={(e) => setAdditionalInfo(e.target.value)}
                    placeholder="Playing style, previous tournaments, strengths..."
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Upload Player Photograph (JPG, PNG, WEBP · max 5MB)</Label>
                  <label className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border hover:border-primary/50 bg-background/50 p-4 cursor-pointer transition-colors">
                    <Upload className="h-5 w-5 text-primary" />
                    <span className="text-sm font-medium">
                      {photoFile ? photoFile.name : "Choose a photo from your device"}
                    </span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        setPhotoFile(file);
                        setPhotoPreview(file ? URL.createObjectURL(file) : null);
                      }}
                    />
                  </label>
                </div>

                <Button type="submit" size="lg" className="w-full" disabled={busy}>
                  {busy ? "Submitting..." : "Submit Changes for Admin Approval"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Submission History */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profile Change Requests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {profileData.changes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No profile updates submitted yet.</p>
            ) : (
              profileData.changes.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/50 px-4 py-3 text-sm"
                >
                  <div className="space-y-0.5">
                    <div className="font-semibold">
                      {c.proposed_position || "Photo / Info Update"}{" "}
                      {c.proposed_jersey_number ? `· #${c.proposed_jersey_number}` : ""}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Submitted {new Date(c.created_at + "Z").toLocaleString()}
                      {c.review_note ? ` · Note: ${c.review_note}` : ""}
                    </div>
                  </div>
                  <Badge
                    variant={
                      c.status === "approved" ? "success" : c.status === "rejected" ? "destructive" : "default"
                    }
                  >
                    {c.status === "approved" && <CheckCircle2 className="h-3 w-3" />}
                    {c.status === "rejected" && <XCircle className="h-3 w-3" />}
                    {c.status === "pending" && <Clock className="h-3 w-3" />}
                    {c.status.toUpperCase()}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Unauthenticated Player Claim Lookup & Mobile Number Open View
  return (
    <div className="max-w-xl mx-auto px-4 py-10 space-y-6">
      <div className="text-center space-y-2">
        <Badge>PLAYER PORTAL</Badge>
        <h1 className="font-display text-5xl tracking-wide">
          CLAIM YOUR <span className="text-primary">PLAYER CARD</span>
        </h1>
        <p className="text-muted-foreground text-sm">
          Enter your Player Number (e.g. <code className="text-primary">NB3-01</code>) and your registered Mobile Number
          to open your account.
        </p>
      </div>

      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-primary" />
            Find & Open Your Player Account
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <form onSubmit={handleLookup} className="flex gap-2">
            <Input
              value={playerNumber}
              onChange={(e) => setPlayerNumber(e.target.value)}
              placeholder="Enter Player Number (e.g. NB3-01)"
              required
            />
            <Button type="submit" disabled={busy}>
              <Search className="h-4 w-4" />
              Find
            </Button>
          </form>

          {foundPlayer && (
            <div className="rounded-2xl border border-primary/40 bg-background/60 p-4 space-y-4">
              <div className="flex items-center gap-4">
                <PlayerAvatar src={foundPlayer.photoUrl} name={foundPlayer.fullName} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-primary">
                    {foundPlayer.playerNumber} · {foundPlayer.categoryName}
                  </div>
                  <div className="font-display text-2xl">{foundPlayer.fullName}</div>
                  <div className="text-xs text-muted-foreground">
                    {foundPlayer.position} {foundPlayer.roomNumber ? `· Room ${foundPlayer.roomNumber}` : ""}
                  </div>
                </div>
                <Badge variant={foundPlayer.isClaimed ? "success" : "default"}>
                  {foundPlayer.isClaimed ? "CLAIMED" : "OPEN"}
                </Badge>
              </div>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  try {
                    const data = await apiRequest<{
                      token: string;
                      user: { id: number; username: string; role: "player"; displayName: string; playerId: number };
                    }>("/api/player-claim/claim-by-phone", {
                      method: "POST",
                      body: JSON.stringify({
                        playerNumber: foundPlayer.playerNumber,
                        phone: fullPhone,
                      }),
                    });
                    setSession(data.token, data.user);
                    toast({
                      variant: "success",
                      title: "Account Opened!",
                      description: "You can now upload your photo and view your base price.",
                    });
                  } catch (err) {
                    toast({
                      variant: "destructive",
                      title: "Mobile number did not match",
                      description: err instanceof Error ? err.message : "Could not open account",
                    });
                  } finally {
                    setBusy(false);
                  }
                }}
                className="space-y-3 pt-2 border-t border-border/60"
              >
                <div className="space-y-1">
                  <Label>Mobile Number</Label>
                  <Input
                    value={fullPhone}
                    onChange={(e) => setFullPhone(e.target.value)}
                    placeholder="01XXXXXXXXX"
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  <KeyRound className="h-4 w-4" />
                  {busy ? "Opening..." : "Open Player Account"}
                </Button>
              </form>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
