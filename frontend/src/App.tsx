import React, { Suspense } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Outlet,
  useLocation,
} from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { DataProvider } from '@/contexts/DataContext';
import { SessionProvider } from '@/contexts/SessionContext';
import { SettingsProvider } from '@/contexts/SettingsContext';
import { ToastProvider } from '@/components/Toast';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import AdminRoute from '@/components/AdminRoute';
import Loader from '@/components/Loader';
import FloatingActionButton from '@/components/FloatingActionButton';
import ErrorBoundary from '@/components/ErrorBoundary';
import Breadcrumbs from '@/components/Breadcrumbs';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRegisterSW } from 'virtual:pwa-register/react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 1000 * 60,
    },
  },
});

const HomePage = React.lazy(() => import('@/pages/HomePage'));
const AuthPage = React.lazy(() => import('@/pages/AuthPage'));
const SettingsPage = React.lazy(() => import('@/pages/SettingsPage'));
const FlashcardSessionPage = React.lazy(() => import('@/pages/FlashcardSessionPage'));
const ChapterDetailPage = React.lazy(() => import('@/pages/ChapterDetailPage'));
const MCQSessionPage = React.lazy(() => import('@/pages/MCQSessionPage'));
const QuizResultsPage = React.lazy(() => import('@/pages/QuizResultsPage'));
const AdminReviewPage = React.lazy(() => import('@/pages/AdminReviewPage'));
const CramSheetsPage = React.lazy(() => import('@/pages/CramSheetsPage'));
const CramSheetEditorPage = React.lazy(() => import('@/pages/CramSheetEditorPage'));
const CustomTestBuilder = React.lazy(() => import('@/pages/CustomTestBuilder'));
const GeneratorPage = React.lazy(() => import('@/pages/GeneratorPage'));
const ProfilePage = React.lazy(() => import('@/pages/ProfilePage'));
const ForgotPasswordPage = React.lazy(() => import('@/pages/ForgotPasswordPage'));
const AdminUserManagementPage = React.lazy(() => import('@/pages/AdminUserManagementPage'));
const AdminAuditLogPage = React.lazy(() => import('@/pages/AdminAuditLogPage'));
const AdminOcrReviewPage = React.lazy(() => import('@/pages/AdminOcrReviewPage'));
const AdminContentViewerPage = React.lazy(() => import('@/pages/AdminContentViewerPage'));
const QuizHistoryPage = React.lazy(() => import('@/pages/QuizHistoryPage'));
const NotFoundPage = React.lazy(() => import('@/pages/NotFoundPage'));
const ChatPage = React.lazy(() => import('@/pages/ChatPage'));
const BookmarksPage = React.lazy(() => import('@/pages/BookmarksPage'));
const StatsPage = React.lazy(() => import('@/pages/StatsPage'));
const GoalsPage = React.lazy(() => import('@/pages/GoalsPage'));
const AchievementsPage = React.lazy(() => import('@/pages/AchievementsPage'));
const AdminMarrowExtractionPage = React.lazy(() => import('@/pages/AdminMarrowExtractionPage'));
const AdminMarrowApprovalPage = React.lazy(() => import('@/pages/AdminMarrowApprovalPage'));
const MarrowQBankPage = React.lazy(() => import('@/pages/MarrowQBankPage'));
const QuickFireGamePage = React.lazy(() => import('@/pages/QuickFireGamePage'));
const DDxGamePage = React.lazy(() => import('@/pages/DDxGamePage'));
const TagsPage = React.lazy(() => import('@/pages/TagsPage'));
const TagQuestionsPage = React.lazy(() => import('@/pages/TagQuestionsPage'));
const AdminContentManagementPage = React.lazy(() => import('@/pages/AdminContentManagementPage'));
const AdminTagManagementPage = React.lazy(() => import('@/pages/AdminTagManagementPage'));
const AdminAIConfigPage = React.lazy(() => import('@/pages/AdminAIConfigPage'));
const AdminAnalyticsDashboard = React.lazy(() => import('@/pages/AdminAnalyticsDashboard'));
const MockExamBuilder = React.lazy(() => import('@/pages/MockExamBuilder'));
const AdminSearchPage = React.lazy(() => import('@/pages/AdminSearchPage'));
const AdminToolsPage = React.lazy(() => import('@/pages/AdminToolsPage'));

const AppLayout: React.FC = () => {
  const location = useLocation();
  useRegisterSW({
    onNeedRefresh() {
      if (confirm('A new version of PediaQuiz is available. Reload?')) {
        window.location.reload();
      }
    },
    onOfflineReady() {
      console.log('PediaQuiz is ready to work offline.');
    },
  });
  
  return (
    <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-slate-900">
      <Header />
      <main className="flex-grow container mx-auto px-4 sm:px-6 lg:px-8 py-8 mb-20">
        {location.pathname !== '/' && <Breadcrumbs />}
        <Outlet />
      </main>
      <FloatingActionButton />
      <BottomNav />
    </div>
  );
};

const AppContent: React.FC = () => {
  return (
    <Suspense fallback={<Loader fullScreen message="Loading page..." />}>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        
        <Route element={<AdminRoute requiredRole="student"><AppLayout /></AdminRoute>}>
            <Route path="/" element={<HomePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/flashcards/:topicId/:chapterId" element={<FlashcardSessionPage />} />
            <Route path="/chapters/:topicId/:chapterId" element={<ChapterDetailPage />} />
            <Route path="/session/:mode/:sessionId" element={<MCQSessionPage />} />
            <Route path="/results/:resultId" element={<QuizResultsPage />} />
            <Route path="/cram-sheets" element={<CramSheetsPage />} />
            <Route path="/cram-sheets/:sheetId" element={<CramSheetEditorPage />} />
            <Route path="/custom-test-builder" element={<CustomTestBuilder />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/history" element={<QuizHistoryPage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/bookmarks" element={<BookmarksPage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/goals" element={<GoalsPage />} />
            <Route path="/achievements" element={<AchievementsPage />} />
            <Route path="/marrow-qbank" element={<MarrowQBankPage />} />
            <Route path="/quick-fire-game" element={<QuickFireGamePage />} />
            <Route path="/ddx-game" element={<DDxGamePage />} />
            <Route path="/tags" element={<TagsPage />} />
            <Route path="/tags/:tagName" element={<TagQuestionsPage />} />
            <Route path="/mock-exam-builder" element={<MockExamBuilder />} />
            
            <Route path="/generator" element={<AdminRoute requiredRole="faculty"><GeneratorPage /></AdminRoute>} />
            <Route path="/admin/review" element={<AdminRoute requiredRole="faculty"><AdminReviewPage /></AdminRoute>} />
            <Route path="/admin/ocr-review/:jobId" element={<AdminRoute requiredRole="faculty"><AdminOcrReviewPage /></AdminRoute>} />
            <Route path="/admin/content-review/:jobId" element={<AdminRoute requiredRole="faculty"><AdminContentViewerPage /></AdminRoute>} />
            <Route path="/admin/marrow-extract/:jobId" element={<AdminRoute requiredRole="faculty"><AdminMarrowExtractionPage /></AdminRoute>} />
            <Route path="/admin/marrow-approve/:jobId" element={<AdminRoute requiredRole="faculty"><AdminMarrowApprovalPage /></AdminRoute>} />
            <Route path="/admin/users" element={<AdminRoute requiredRole="admin"><AdminUserManagementPage /></AdminRoute>} />
            <Route path="/admin/logs" element={<AdminRoute requiredRole="admin"><AdminAuditLogPage /></AdminRoute>} />
            <Route path="/admin/content-management" element={<AdminRoute requiredRole="admin"><AdminContentManagementPage /></AdminRoute>} />
            <Route path="/admin/tag-management" element={<AdminRoute requiredRole="admin"><AdminTagManagementPage /></AdminRoute>} />
            <Route path="/admin/ai-config" element={<AdminRoute requiredRole="admin"><AdminAIConfigPage /></AdminRoute>} />
            <Route path="/admin/analytics" element={<AdminRoute requiredRole="admin"><AdminAnalyticsDashboard /></AdminRoute>} />
            <Route path="/admin/search" element={<AdminRoute requiredRole="admin"><AdminSearchPage /></AdminRoute>} />
            <Route path="/admin/tools" element={<AdminRoute requiredRole="admin"><AdminToolsPage /></AdminRoute>} />
        </Route>
        
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
};

const App: React.FC = () => {
  try {
    console.log('[DEBUG] App.tsx: Top-level render initiated.');
    return (
      <ErrorBoundary>
        <ToastProvider>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <SettingsProvider>
                <DataProvider>
                  <SessionProvider>
                    <Router>
                      <AppContent />
                    </Router>
                  </SessionProvider>
                </DataProvider>
              </SettingsProvider>
            </AuthProvider>
          </QueryClientProvider>
        </ToastProvider>
      </ErrorBoundary>
    );
  } catch (error) {
    console.error('[DEBUG] App.tsx: A CATASTROPHIC SYNCHRONOUS ERROR occurred during initial render!', error);
    return (
        <div style={{ padding: '2rem', fontFamily: 'monospace', color: '#e53e3e', backgroundColor: '#fff5f5' }}>
            <h1>Application Failed to Start</h1>
            <p>A critical error occurred during the application's startup phase. Please check the developer console for details.</p>
            <pre style={{ marginTop: '1rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {(error as Error).message}\n\n{(error as Error).stack}
            </pre>
        </div>
    );
  }
};

export default App;