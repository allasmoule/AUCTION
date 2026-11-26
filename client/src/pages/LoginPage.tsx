import React, { useEffect, useState } from "react";
import { Lock, Shield, UserCheck, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/context/AuthContext";

export function LoginPage({ defaultRole = "team_manager" }: { defaultRole?: "super_admin" | "team_manager" | "player" }) {
  const { user, login } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [role, setRole] = useState<"super_admin" | "team_manager" | "player">(defaultRole);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setRole(defaultRole);
  }, [defaultRole]);

  useEffect(() => {
    if (user) {
      if (user.role === "super_admin") navigate("/admin/dashboard", { replace: true });
      else if (user.role === "team_manager") navigate("/team", { replace: true });
      else navigate("/player/claim", { replace: true });
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const loggedIn = await login(username.trim(), password, role);
      toast({ variant: "success", title: "Welcome back", description: `Signed in as ${loggedIn.displayName}` });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Login failed",
        description: err instanceof Error ? err.message : "Invalid credentials",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-5rem)] flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md border-primary/30 shadow-glow">
        <CardHeader className="text-center space-y-2">
          <div className="h-12 w-12 rounded-2xl gradient-gold mx-auto flex items-center justify-center shadow-gold">
            <Lock className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="font-display text-4xl tracking-wider">YKSG NB-3 SIGN IN</CardTitle>
          <CardDescription>Select your account portal and enter your credentials</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-3 gap-2 rounded-xl bg-background/70 p-1 border border-border">
            {[
              { id: "team_manager" as const, label: "Team", icon: Users },
              { id: "player" as const, label: "Player", icon: UserCheck },
              { id: "super_admin" as const, label: "Admin", icon: Shield },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setRole(item.id)}
                  className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition-all ${
                    role === item.id
                      ? "gradient-gold text-primary-foreground shadow"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              );
            })}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="login-username">Username</Label>
              <Input
                id="login-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={
                  role === "super_admin"
                    ? "Admin username"
                    : role === "team_manager"
                      ? "Team manager username"
                      : "Claimed player username"
                }
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="login-password">Password</Label>
              <Input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={submitting}>
              {submitting ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          {role === "player" && (
            <div className="text-center text-xs text-muted-foreground pt-2 border-t border-border/60">
              Haven&apos;t claimed your player card yet?{" "}
              <button
                type="button"
                onClick={() => navigate("/player/claim")}
                className="text-primary font-semibold hover:underline"
              >
                Open Player Claim Portal
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
