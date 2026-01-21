import { useState } from 'react';
import { Header } from '@/components/layout/Header';
import { Navigation } from '@/components/layout/Navigation';
import { CountingView } from '@/components/counting/CountingView';
import { ProductsView } from '@/components/products/ProductsView';
import { CategoriesView } from '@/components/categories/CategoriesView';
import { SessionsView } from '@/components/sessions/SessionsView';
import { ReportsView } from '@/components/reports/ReportsView';
import { ReconciliationView } from '@/components/reconciliation/ReconciliationView';
import { StockEntriesView } from '@/components/stock/StockEntriesView';
import { StockExitsView } from '@/components/stock/StockExitsView';
import { StockAlertsPanel } from '@/components/stock/StockAlertsPanel';
import { StockAlertsView } from '@/components/stock/StockAlertsView';
import { WarehouseMapView } from '@/components/warehouse/WarehouseMapView';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('counting');

  const handleNavigateToProducts = () => {
    setActiveTab('products');
  };

  return (
    <div className="min-h-screen bg-background">
      <Header onNavigateToProducts={handleNavigateToProducts} />
      <Navigation activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="container py-4">
        {/* Stock Alerts Panel - shown on counting tab */}
        {activeTab === 'counting' && (
          <div className="mb-4">
            <StockAlertsPanel onNavigateToProduct={handleNavigateToProducts} maxItems={5} />
          </div>
        )}
        
        {activeTab === 'counting' && <CountingView />}
        {activeTab === 'products' && <ProductsView />}
        {activeTab === 'categories' && <CategoriesView />}
        {activeTab === 'sessions' && <SessionsView />}
        {activeTab === 'entries' && <StockEntriesView />}
        {activeTab === 'exits' && <StockExitsView />}
        {activeTab === 'alerts' && <StockAlertsView />}
        {activeTab === 'reconciliation' && <ReconciliationView />}
        {activeTab === 'warehouse' && <WarehouseMapView />}
        {activeTab === 'reports' && <ReportsView />}
      </main>
    </div>
  );
}
