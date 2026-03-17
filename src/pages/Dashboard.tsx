import { useState, Suspense, lazy } from 'react';
import { Header } from '@/components/layout/Header';
import { Navigation } from '@/components/layout/Navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { AuditExecutionView } from '@/components/audit/AuditExecutionView';
import { DashboardHome } from '@/components/dashboard/DashboardHome';

// Lazy loading - cada view é carregada apenas quando necessária
const CountingView = lazy(() => import('@/components/counting/CountingView').then(m => ({ default: m.CountingView })));
const ProductsView = lazy(() => import('@/components/products/ProductsView').then(m => ({ default: m.ProductsView })));
const CategoriesView = lazy(() => import('@/components/categories/CategoriesView').then(m => ({ default: m.CategoriesView })));
const SessionsView = lazy(() => import('@/components/sessions/SessionsView').then(m => ({ default: m.SessionsView })));
const ReportsView = lazy(() => import('@/components/reports/ReportsView').then(m => ({ default: m.ReportsView })));
const ReconciliationView = lazy(() => import('@/components/reconciliation/ReconciliationView').then(m => ({ default: m.ReconciliationView })));
const StockEntriesView = lazy(() => import('@/components/stock/StockEntriesView').then(m => ({ default: m.StockEntriesView })));
const StockExitsView = lazy(() => import('@/components/stock/StockExitsView').then(m => ({ default: m.StockExitsView })));
const StockAlertsView = lazy(() => import('@/components/stock/StockAlertsView').then(m => ({ default: m.StockAlertsView })));
const WarehouseMapView = lazy(() => import('@/components/warehouse/WarehouseMapView').then(m => ({ default: m.WarehouseMapView })));
const DamagesView = lazy(() => import('@/components/damages/DamagesView').then(m => ({ default: m.DamagesView })));
const SettingsView = lazy(() => import('@/components/settings/SettingsView').then(m => ({ default: m.SettingsView })));
const RecentProductsView = lazy(() => import('@/components/products/RecentProductsView').then(m => ({ default: m.RecentProductsView })));
const ERPReconciliationView = lazy(() => import('@/components/erp/ERPReconciliationView').then(m => ({ default: m.ERPReconciliationView })));
const PurchaseOrdersView = lazy(() => import('@/components/purchases/PurchaseOrdersView').then(m => ({ default: m.PurchaseOrdersView })));
const RoutesView = lazy(() => import('@/components/routes/RoutesView').then(m => ({ default: m.RoutesView })));
const PendingSalesView = lazy(() => import('@/components/sales/PendingSalesView').then(m => ({ default: m.PendingSalesView })));

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

  // If executing an audit, show the execution view
  if (activeAuditId) {
    return (
      <div className="min-h-screen bg-background">
        <Header onNavigateToProducts={handleNavigateToProducts} activeTab={activeTab} onTabChange={setActiveTab} />
        <main className="container py-4">
          <AuditExecutionView
            auditId={activeAuditId}
            onComplete={handleAuditComplete}
            onBack={handleAuditBack}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header onNavigateToProducts={handleNavigateToProducts} activeTab={activeTab} onTabChange={setActiveTab} />
      <Navigation activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="container py-4">
        <Suspense fallback={<ViewLoader />}>
          {activeTab === 'counting' && <CountingView />}
          {activeTab === 'products' && <ProductsView />}
          {activeTab === 'categories' && <CategoriesView />}
          {activeTab === 'sessions' && <SessionsView />}
          {activeTab === 'entries' && <StockEntriesView />}
          {activeTab === 'exits' && <StockExitsView />}
          {activeTab === 'alerts' && <StockAlertsView />}
          {activeTab === 'damages' && <DamagesView />}
          {activeTab === 'reconciliation' && <ReconciliationView />}
          {activeTab === 'erp' && <ERPReconciliationView />}
          {activeTab === 'purchases' && <PurchaseOrdersView />}
          {activeTab === 'routes' && <RoutesView />}
          {activeTab === 'pending-sales' && <PendingSalesView />}
          {activeTab === 'warehouse' && <WarehouseMapView onStartAudit={handleStartAudit} />}
          {activeTab === 'reports' && <ReportsView onStartAudit={handleStartAudit} />}
          {activeTab === 'recent' && <RecentProductsView />}
          {activeTab === 'settings' && <SettingsView />}
        </Suspense>
      </main>
    </div>
  );
}
