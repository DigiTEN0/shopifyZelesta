import React, { useState, useCallback, createContext, useContext } from 'react';
import { Frame, Navigation, Toast } from '@shopify/polaris';
import DashboardPage from './pages/Dashboard.jsx';
import BundleSettingsPage from './pages/BundleSettings.jsx';
import WidgetCustomisationPage from './pages/WidgetCustomisation.jsx';
import PopupsPage from './pages/Popups.jsx';
import LeadsPage from './pages/Leads.jsx';
import AnalyticsPage from './pages/Analytics.jsx';
import VisitorExplorerPage from './pages/VisitorExplorer.jsx';

const PAGES = [
  { id: 'dashboard', label: 'Dashboard', component: DashboardPage },
  { id: 'stealth', label: 'Visitor Explorer', component: VisitorExplorerPage },
  { id: 'settings', label: 'Bundle Settings', component: BundleSettingsPage },
  { id: 'customise', label: 'Widget Customisation', component: WidgetCustomisationPage },
  { id: 'popups', label: 'Pop-up & Leads', component: PopupsPage },
  { id: 'leads', label: 'Leads', component: LeadsPage },
  { id: 'analytics', label: 'Analytics', component: AnalyticsPage },
];

// Lightweight toast bus so any page can surface a confirmation.
const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

export default function App() {
  const [page, setPage] = useState(initialPage());
  const [toast, setToast] = useState(null);

  const showToast = useCallback((content, error = false) => {
    setToast({ content, error });
  }, []);

  const navigation = (
    <Navigation location={page}>
      <div style={{ padding: '18px 16px 8px', display: 'flex', alignItems: 'center', gap: 9 }}>
        <span style={{
          width: 26, height: 26, borderRadius: 8, flex: '0 0 auto',
          background: '#1c1917', color: '#fff', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontWeight: 800, fontSize: 15,
        }}>B</span>
        <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em', color: '#1c1917' }}>
          Bundle<span style={{ color: '#b08968' }}>Boost</span>
        </span>
      </div>
      <Navigation.Section
        items={PAGES.map((p) => ({
          label: p.label,
          selected: page === p.id,
          onClick: () => {
            setPage(p.id);
            try {
              window.history.replaceState(null, '', `/${p.id === 'dashboard' ? '' : p.id}${window.location.search}`);
            } catch (e) {}
          },
        }))}
      />
    </Navigation>
  );

  const Active = PAGES.find((p) => p.id === page)?.component || DashboardPage;

  return (
    <ToastContext.Provider value={showToast}>
      <Frame navigation={navigation}>
        <Active goTo={setPage} />
        {toast && (
          <Toast
            content={toast.content}
            error={toast.error}
            onDismiss={() => setToast(null)}
            duration={3500}
          />
        )}
      </Frame>
    </ToastContext.Provider>
  );
}

function initialPage() {
  const path = window.location.pathname.replace(/^\//, '');
  const known = ['dashboard', 'stealth', 'settings', 'customise', 'popups', 'leads', 'analytics'];
  return known.includes(path) ? path : 'dashboard';
}
