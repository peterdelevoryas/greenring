import { Suspense, lazy, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";

import { getSession } from "./lib/api";
import type { UserSummary } from "./lib/types";
import { useRealtime } from "./hooks/useRealtime";
import { ShellLayout } from "./components/ShellLayout";

const HomePage = lazy(async () => {
  const module = await import("./routes/HomePage");
  return { default: module.HomePage };
});

const LoginPage = lazy(async () => {
  const module = await import("./routes/LoginPage");
  return { default: module.LoginPage };
});

const PartyPage = lazy(async () => {
  const module = await import("./routes/PartyPage");
  return { default: module.PartyPage };
});

const RedeemInvitePage = lazy(async () => {
  const module = await import("./routes/RedeemInvitePage");
  return { default: module.RedeemInvitePage };
});

const SettingsPage = lazy(async () => {
  const module = await import("./routes/SettingsPage");
  return { default: module.SettingsPage };
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
      staleTime: 2_000,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

function AppShell() {
  const sessionQuery = useQuery({
    queryKey: ["session"],
    queryFn: getSession,
  });
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);

  useRealtime(Boolean(sessionQuery.data?.user), (timestamp) => {
    setLastEventAt(timestamp);
  });

  if (sessionQuery.isLoading) {
    return <LoadingScreen label="Starting dashboard..." />;
  }

  if (!sessionQuery.data?.user) {
    return (
      <Suspense fallback={<LoadingScreen label="Opening sign-in..." />}>
        <Routes>
          <Route path="/redeem" element={<RedeemInvitePage />} />
          <Route path="*" element={<LoginPage />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <AuthedRoutes currentUser={sessionQuery.data.user} lastEventAt={lastEventAt} />
  );
}

function AuthedRoutes({
  currentUser,
  lastEventAt,
}: {
  currentUser: UserSummary;
  lastEventAt: number | null;
}) {
  return (
    <ShellLayout currentUser={currentUser} lastEventAt={lastEventAt}>
      <Suspense fallback={<LoadingScreen label="Loading dashboard..." />}>
        <Routes>
          <Route path="/" element={<HomePage currentUser={currentUser} />} />
          <Route path="/party/:partyId" element={<PartyPage currentUser={currentUser} />} />
          <Route path="/settings" element={<SettingsPage currentUser={currentUser} />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/redeem" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </ShellLayout>
  );
}

function LoadingScreen({ label }: { label: string }) {
  return (
    <main className="loading-screen">
      <div className="loading-panel">
        <p className="eyebrow">Green Ring</p>
        <h1>{label}</h1>
        <p className="muted">
          Warming the roster, syncing presence, and dusting off the blades UI.
        </p>
      </div>
    </main>
  );
}
