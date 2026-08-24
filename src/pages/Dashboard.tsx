import { useState, Suspense, lazy } from 'react';
import { APP_VERSION, APP_BUILD_DATE } from '@/version';
import { Header } from '@/components/layout/Header';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { AuditExecutionView } from '@/components/audit/AuditExecutionView';
import { DashboardHome } from '@/components/dashboard/DashboardHome';

// Lazy loading - cada view é carregada apenas quando necessária
const CountingView = lazy(() => import('@/components/counting/CountingView').then(m => ({ default: m.CountingView })));
const ProductsView = lazy(() => import('@/components/products/ProductsView').then(m => ({ default: m.ProductsView })));
const CategoriesView = lazy(() => import('@/components/categories/CategoriesView').then(m => ({ default: m.CategoriesView })));
const SessionsView = lazy(() => import('@/components/sessions/SessionsView').then(m => ({ default: m.SessionsView })));
const ReportsView = lazy(() => import('@/components/reports/ReportsView').then(m => ({ default: m.ReportsView })));

const StockEntriesView = lazy(() => import('@/components/stock/StockEntriesView').then(m => ({ default: m.StockEntriesView })));
const StockExitsView = lazy(() => import('@/components/stock/StockExitsView').then(m => ({ default: m.StockExitsView })));
const ScannerPickingAdminView = lazy(() => import('@/components/stock/ScannerPickingAdminView').then(m => ({ default: m.ScannerPickingAdminView })));
const StockAlertsView = lazy(() => import('@/components/stock/StockAlertsView').then(m => ({ default: m.StockAlertsView })));
const WarehouseMapView = lazy(() => import('@/components/warehouse/WarehouseMapView').then(m => ({ default: m.WarehouseMapView })));
const DamagesView = lazy(() => import('@/components/damages/DamagesView').then(m => ({ default: m.DamagesView })));
const SettingsView = lazy(() => import('@/components/settings/SettingsView').then(m => ({ default: m.SettingsView })));
const RecentProductsView = lazy(() => import('@/components/products/RecentProductsView').then(m => ({ default: m.RecentProductsView })));
const SeparationNotesView = lazy(() => import('@/components/logistics/SeparationNotesView').then(m => ({ default: m.SeparationNotesView })));
const RouteOptimizationView = lazy(() => import('@/components/logistics/RouteOptimizationView').then(m => ({ default: m.RouteOptimizationView })));


// Loading skeleton component
function ViewLoader() {
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('home');
  const [activeAuditId, setActiveAuditId] = useState<string | null>(null);

  const handleNavigateToProducts = () => {
    setActiveTab('products');
  };

  const handleStartAudit = (auditId: string) => {
    setActiveAuditId(auditId);
  };

  const handleAuditComplete = () => {
    setActiveAuditId(null);
  };

  const handleAuditBack = () => {
    setActiveAuditId(null);
  };

  // If executing an audit, show the execution view (full screen, no shell chrome distractions)
  if (activeAuditId) {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-background">
          <AppSidebar activeTab={activeTab} onTabChange={setActiveTab} />
          <SidebarInset className="flex flex-col min-w-0">
            <Header onNavigateToProducts={handleNavigateToProducts} activeTab={activeTab} onTabChange={setActiveTab} />
            <main className="flex-1 px-4 md:px-6 lg:px-8 py-6">
              <AuditExecutionView
                auditId={activeAuditId}
                onComplete={handleAuditComplete}
                onBack={handleAuditBack}
              />
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar activeTab={activeTab} onTabChange={setActiveTab} />
        <SidebarInset className="flex flex-col min-w-0">
          <Header onNavigateToProducts={handleNavigateToProducts} activeTab={activeTab} onTabChange={setActiveTab} />
          <main className="flex-1 px-4 md:px-6 lg:px-8 py-6">
            <Suspense fallback={<ViewLoader />}>
              {activeTab === 'home' && <DashboardHome onNavigate={setActiveTab} />}
              {activeTab === 'counting' && <CountingView />}
              {activeTab === 'products' && <ProductsView />}
              {activeTab === 'categories' && <CategoriesView />}
              {activeTab === 'sessions' && <SessionsView />}
              {activeTab === 'entries' && <StockEntriesView />}
              {activeTab === 'exits' && <StockExitsView />}
              {activeTab === 'alerts' && <StockAlertsView />}
              {activeTab === 'scanner-picking' && <ScannerPickingAdminView />}
              {activeTab === 'damages' && <DamagesView />}
              {activeTab === 'warehouse' && <WarehouseMapView onStartAudit={handleStartAudit} />}
              {activeTab === 'reports' && <ReportsView onStartAudit={handleStartAudit} />}
              {activeTab === 'recent' && <RecentProductsView />}
              {activeTab === 'separation-notes' && <SeparationNotesView />}
              {activeTab === 'route-optimization' && (
                <RouteOptimizationView onSendToSeparation={() => setActiveTab('separation-notes')} />
              )}
              {activeTab === 'settings' && <SettingsView />}

            </Suspense>
          </main>
          <footer className="border-t border-border-subtle py-3 text-center">
            <p className="text-xs text-muted-foreground">
              Versão {APP_VERSION} • {APP_BUILD_DATE}
            </p>
          </footer>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
