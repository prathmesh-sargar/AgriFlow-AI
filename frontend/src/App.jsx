import React, { useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { LandingPage } from './components/LandingPage';
import { Marketplace } from './components/Marketplace';
import { FarmerPortal } from './components/FarmerPortal';
import { BuyerPortal } from './components/BuyerPortal';
import { TransporterPortal } from './components/TransporterPortal';
import { AIDecisionHub } from './components/AIDecisionHub';
import { BlockchainExplorer } from './components/BlockchainExplorer';
import { AdminDashboard } from './components/AdminDashboard';
import { AuthModal } from './components/AuthModal';
import { LanguageProvider, useTranslation } from './services/LanguageContext';
import { useAppStore } from './services/useAppStore';
import { api } from './services/api';

function AppContent() {
  const { currentLang, t } = useTranslation();

  // Zustand Store selectors
  const darkMode = useAppStore((state) => state.darkMode);
  const currentUser = useAppStore((state) => state.currentUser);
  const currentTab = useAppStore((state) => state.currentTab);
  const setCurrentTab = useAppStore((state) => state.setCurrentTab);
  const quickAccounts = useAppStore((state) => state.quickAccounts);
  const authModalOpen = useAppStore((state) => state.authModalOpen);
  const authModalMode = useAppStore((state) => state.authModalMode);
  const openAuthModal = useAppStore((state) => state.openAuthModal);
  const closeAuthModal = useAppStore((state) => state.closeAuthModal);
  const crops = useAppStore((state) => state.crops);
  const orders = useAppStore((state) => state.orders);
  const bookings = useAppStore((state) => state.bookings);
  const initApp = useAppStore((state) => state.initApp);
  const refreshData = useAppStore((state) => state.refreshData);
  const loginSuccess = useAppStore((state) => state.loginSuccess);
  const quickLogin = useAppStore((state) => state.quickLogin);

  // Initialize accounts & restore token on mount
  useEffect(() => {
    initApp();
  }, [initApp]);

  const handleRoleSelectFromLanding = async (acc) => {
    await quickLogin(acc);
  };

  return (
    <div className={`min-h-screen flex flex-col font-sans transition-colors duration-200 ${
      darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
    }`}>
      {/* Top Navbar */}
      <Navbar />

      {/* Main Content Render */}
      <main className="flex-1 pt-20 sm:pt-24">
        {currentTab === 'home' && (
          <LandingPage
            onNavigate={setCurrentTab}
            onOpenAuth={(mode) => openAuthModal(mode)}
            quickAccounts={quickAccounts}
            onSelectRole={handleRoleSelectFromLanding}
            darkMode={darkMode}
          />
        )}

        {currentTab === 'marketplace' && (
          <div className={`min-h-[85vh] ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
            <Marketplace
              crops={crops}
              user={currentUser}
              onOrderSuccess={refreshData}
              onBookingSuccess={refreshData}
              api={api}
              darkMode={darkMode}
            />
          </div>
        )}

        {currentTab === 'farmer-portal' && (
          <div className={`min-h-[85vh] ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
            <FarmerPortal
              crops={crops}
              bookings={bookings}
              user={currentUser}
              onCropAdded={refreshData}
              onBookingConfirmed={refreshData}
              api={api}
              darkMode={darkMode}
            />
          </div>
        )}

        {currentTab === 'buyer-portal' && (
          <div className={`min-h-[85vh] ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
            <BuyerPortal
              orders={orders}
              bookings={bookings}
              user={currentUser}
              darkMode={darkMode}
            />
          </div>
        )}

        {currentTab === 'transporter-portal' && (
          <div className={`min-h-[85vh] ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
            <TransporterPortal
              orders={orders}
              user={currentUser}
              onOrderUpdated={refreshData}
              api={api}
              darkMode={darkMode}
            />
          </div>
        )}

        {currentTab === 'ai-hub' && (
          <div className={`min-h-[85vh] ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
            <AIDecisionHub 
              api={api} 
              darkMode={darkMode}
            />
          </div>
        )}

        {currentTab === 'blockchain' && (
          <div className={`min-h-[85vh] ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
            <BlockchainExplorer 
              api={api} 
              darkMode={darkMode}
            />
          </div>
        )}

        {currentTab === 'admin' && (
          <div className={`min-h-[85vh] ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
            <AdminDashboard 
              api={api} 
              darkMode={darkMode}
            />
          </div>
        )}
      </main>

      {/* Auth Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={closeAuthModal}
        initialMode={authModalMode}
        onAuthSuccess={loginSuccess}
        quickAccounts={quickAccounts}
        onQuickLogin={quickLogin}
        api={api}
        t={{
          authModalTitleLogin: t('signIn'),
          authModalTitleReg: t('register'),
          authModalSubLogin: 'Enter your credentials or choose a quick demo account below.',
          authModalSubReg: 'Register as a Farmer, Buyer, or Transporter.',
          emailLabel: 'Email Address',
          passwordLabel: 'Password',
          fullNameLabel: 'Full Name',
          roleLabel: 'Select Account Role',
          phoneLabel: 'Phone Number',
          cityLabel: 'City / District',
          loginBtn: t('signIn'),
          registerBtn: t('register'),
          orQuickLogin: 'Or 1-Click Demo Login As:',
          signIn: t('signIn'),
          register: t('register')
        }}
      />

      {/* Modern Clean Footer */}
      <footer className={`border-t py-12 text-xs transition-colors ${
        darkMode ? 'bg-slate-950 border-slate-900 text-slate-400' : 'bg-white border-slate-200 text-slate-500'
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 pb-8 border-b border-slate-200/60 dark:border-slate-800/60">
            <div className="space-y-1">
              <div className="font-extrabold text-sm tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>AgriFlow</span>
                <span className="text-emerald-600 font-semibold text-xs bg-emerald-500/10 px-1 py-0.5 rounded">AI</span>
              </div>
              <p className="text-xs text-slate-500 max-w-sm">
                Autonomous multi-agent intelligence and cryptographic provenance for India's agricultural supply chain.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-6 text-xs font-semibold">
              <button onClick={() => setCurrentTab('home')} className="hover:text-emerald-600 transition-colors cursor-pointer">{t('navHome')}</button>
              <button onClick={() => setCurrentTab('marketplace')} className="hover:text-emerald-600 transition-colors cursor-pointer">{t('navMarketplace')}</button>
              <button onClick={() => setCurrentTab('ai-hub')} className="hover:text-emerald-600 transition-colors cursor-pointer">{t('navAIDecision')}</button>
              <button onClick={() => setCurrentTab('blockchain')} className="hover:text-emerald-600 transition-colors cursor-pointer">{t('navLedger')}</button>
              <button onClick={() => setCurrentTab('admin')} className="hover:text-emerald-600 transition-colors cursor-pointer">{t('navAdmin')}</button>
            </div>
          </div>

          <div className="pt-6 flex flex-col sm:flex-row justify-between items-center text-[11px] text-slate-400 gap-3">
            <div>
              Department of Computer Science & Engineering (Data Science) • DYPCET Kolhapur
            </div>
            <div>
              © 2026 AgriFlow AI • B.Tech Academic Capstone
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AppContent />
    </LanguageProvider>
  );
}
