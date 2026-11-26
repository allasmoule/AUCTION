import React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { ToastProvider } from "@/components/ui/toast";
import { AuctionProvider } from "@/context/AuctionContext";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { AdminDashboardPage } from "@/pages/AdminDashboardPage";
import { HomePage } from "@/pages/HomePage";
import { LiveAuctionPage } from "@/pages/LiveAuctionPage";
import { LoginPage } from "@/pages/LoginPage";
import { PlayerClaimPage } from "@/pages/PlayerClaimPage";
import { TeamDashboardPage } from "@/pages/TeamDashboardPage";

function ProtectedRoute({
  allowedRole,
  redirectTo,
  children,
}: {
  allowedRole: "super_admin" | "team_manager" | "player";
  redirectTo: string;
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="p-12 text-center text-muted-foreground">Verifying session...</div>;
  }
  if (!user || user.role !== allowedRole) {
    return <Navigate to={redirectTo} replace />;
  }
  return <>{children}</>;
}

function AdminEntryRoute() {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-12 text-center text-muted-foreground">Loading...</div>;
  if (user?.role === "super_admin") return <Navigate to="/admin/dashboard" replace />;
  return <LoginPage defaultRole="super_admin" />;
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AuctionProvider>
          <BrowserRouter>
            <div className="min-h-screen flex flex-col">
              <Navbar />
              <main className="flex-1">
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/live" element={<LiveAuctionPage />} />
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/team/login" element={<LoginPage defaultRole="team_manager" />} />
                  <Route path="/admin" element={<AdminEntryRoute />} />
                  <Route path="/player/claim" element={<PlayerClaimPage />} />
                  <Route
                    path="/team"
                    element={
                      <ProtectedRoute allowedRole="team_manager" redirectTo="/team/login">
                        <TeamDashboardPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/dashboard"
                    element={
                      <ProtectedRoute allowedRole="super_admin" redirectTo="/admin">
                        <AdminDashboardPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </main>
            </div>
          </BrowserRouter>
        </AuctionProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
