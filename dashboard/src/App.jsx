import React, { useState, useCallback, createContext, useContext } from 'react';
import { Frame, Navigation, Toast } from '@shopify/polaris';
import DashboardPage from './pages/Dashboard.jsx';
import BundleSettingsPage from './pages/BundleSettings.jsx';
import WidgetCustomisationPage from './pages/WidgetCustomisation.jsx';
import AnalyticsPage from './pages/Analytics.jsx';
import BillingPage from './pages/Billing.jsx';

const PAGES = [
  { id: 'dashboard', label: 'Dashboard', component: DashboardPage },
  { id: 'settings', label: 'Bundle Settings', component: BundleSettingsPage },
  { id: 'customise', label: 'Widget Customisation', component: WidgetCustomisationPage },
  { id: 'analytics', label: 'Analytics', component: AnalyticsPage },
  { id: 'billing', label: 'Billing', component: BillingPage },
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
  const known = ['dashboard', 'settings', 'customise', 'analytics', 'billing'];
  return known.includes(path) ? path : 'dashboard';
}
