import { useState } from 'react';
import { Header } from '@/components/layout/Header';
import { Navigation } from '@/components/layout/Navigation';
import { CountingView } from '@/components/counting/CountingView';
import { ProductsView } from '@/components/products/ProductsView';
import { SessionsView } from '@/components/sessions/SessionsView';
import { ReportsView } from '@/components/reports/ReportsView';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('counting');

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <Navigation activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="container py-4">
        {activeTab === 'counting' && <CountingView />}
        {activeTab === 'products' && <ProductsView />}
        {activeTab === 'sessions' && <SessionsView />}
        {activeTab === 'reports' && <ReportsView />}
      </main>
    </div>
  );
}
