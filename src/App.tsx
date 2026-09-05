import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/hooks/useAuth";
import { RealtimeSyncProvider } from "@/hooks/useRealtimeSync";
import Index from "./pages/Index";
import InstallApp from "./pages/InstallApp";
import NotFound from "./pages/NotFound";
import { lazy, Suspense } from "react";

const ScannerApp = lazy(() => import("./pages/ScannerApp"));
const OAuthConsent = lazy(() => import("./pages/OAuthConsent"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000, // 2 minutos - dados ficam frescos por 2min
      gcTime: 5 * 60 * 1000, // 5 minutos - garbage collection
      refetchOnWindowFocus: false, // Desabilitar refresh automático ao focar janela
      retry: 1, // Apenas 1 retry em caso de erro
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <AuthProvider>
        <RealtimeSyncProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/install" element={<InstallApp />} />
                <Route
                  path="/.lovable/oauth/consent"
                  element={
                    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">A carregar…</div>}>
                      <OAuthConsent />
                    </Suspense>
                  }
                />
                <Route
                  path="/scanner"
                  element={
                    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">A carregar…</div>}>
                      <ScannerApp />
                    </Suspense>
                  }
                />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </RealtimeSyncProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
