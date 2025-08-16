// workspaces/frontend/src/App.tsx
import React, { Suspense } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Outlet,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { DataProvider } from "./contexts/DataContext";
import { ToastProvider } from "./components/Toast";
import Header from "./components/Header";
import BottomNav from "./components/BottomNav";
import AdminRoute from "./components/AdminRoute";
import Loader from "./components/Loader";
import FloatingActionButton from "./components/FloatingActionButton";
import ErrorBoundary from "./components/ErrorBoundary";

const HomePage = React.lazy(() => import("./pages/HomePage"));
const AuthPage = React.lazy(() => import("./pages/AuthPage"));
const SettingsPage = React.lazy(() => import("./pages/SettingsPage"));
const FlashcardSessionPage = React.lazy(() => import("./pages/FlashcardSessionPage"));
const ChapterDetailPage = React.lazy(() => import("./pages/ChapterDetailPage"));
const CustomTestBuilder = React.lazy(() => import("./pages/CustomTestBuilder"));
const ChatPage = React.lazy(() => import("./pages/ChatPage"));
const MarrowQBankPage = React.lazy(() => import("./pages/MarrowQBankPage"));
const AdminReviewPage = React.lazy(() => import("./pages/AdminReviewPage"));
const AdminMarrowPage = React.lazy(() => import("./pages/AdminMarrowPage"));
const LogScreenPage = React.lazy(() => import("./pages/LogScreenPage"));
const StatsPage = React.lazy(() => import("./pages/StatsPage"));
const AdminCompletedJobsPage = React.lazy(() => import("./pages/AdminCompletedJobsPage"));
const BookmarksPage = React.lazy(() => import("./pages/BookmarksPage"));
const GeneratorPage = React.lazy(() => import("./pages/GeneratorPage"));
const MCQSessionPage = React.lazy(() => import("./pages/MCQSessionPage"));
const SearchResultsPage = React.lazy(() => import("./pages/SearchResultsPage"));
const TagsPage = React.lazy(() => import("./pages/TagsPage"));
const TagQuestionsPage = React.lazy(() => import("./pages/TagQuestionsPage"));
const ChapterNotesEditPage = React.lazy(() => import("./pages/ChapterNotesEditPage"));
const QuizResultsPage = React.lazy(() => import("./pages/QuizResultsPage")); 
const GoalsPage = React.lazy(() => import("./pages/GoalsPage"));


const AppLayout: React.FC = () => (
  <div className="flex flex-col min-h-screen bg-neutral-100 dark:bg-neutral-900">
    <Header />
    <main className="flex-grow container mx-auto px-4 sm:px-6 lg:px-8 py-8 mb-20">
      <Outlet />
    </main>
    <FloatingActionButton />
    <BottomNav />
  </div>
);

const AppContent: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) return <Loader message="Authenticating..." />;

  return (
    <Suspense fallback={<Loader message="Loading page..." />}>
        <Routes>
        <Route
            path="/auth"
            element={!user ? <AuthPage /> : <Navigate to="/" replace />}
        />

        <Route element={user ? <AppLayout /> : <Navigate to="/auth" replace />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route
            path="/flashcards/:topicId/:chapterId"
            element={<FlashcardSessionPage />}
            />
            <Route
            path="/chapters/:topicId/:chapterId"
            element={<ChapterDetailPage />}
            />
            <Route path="/custom-test-builder" element={<CustomTestBuilder />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/marrow-qbank" element={<MarrowQBankPage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/log-screen" element={<LogScreenPage />} />
            <Route path="/bookmarks" element={<BookmarksPage />} />
            <Route path="/goals" element={<GoalsPage />} />
            
            <Route path="/session/:mode/:sessionId" element={<MCQSessionPage />} />
            <Route path="/results/:resultId" element={<QuizResultsPage />} />

            <Route path="/search" element={<SearchResultsPage />} />
            
            <Route path="/tags" element={<TagsPage />} />
            <Route path="/tags/:tagName" element={<TagQuestionsPage />} />

            <Route
            path="/admin/marrow/notes/edit/:topicId/:chapterId"
            element={<AdminRoute><ChapterNotesEditPage /></AdminRoute>}
            />
            <Route
            path="/generator"
            element={<AdminRoute><GeneratorPage /></AdminRoute>}
            />
            <Route
            path="/admin/review"
            element={<AdminRoute><AdminReviewPage /></AdminRoute>}
            />
            <Route
            path="/admin/marrow"
            element={<AdminRoute><AdminMarrowPage /></AdminRoute>}
            />
            <Route
            path="/admin/completed"
            element={<AdminRoute><AdminCompletedJobsPage /></AdminRoute>}
            />
        </Route>

        <Route path="*" element={<Navigate to={user ? "/" : "/auth"} replace />} />
        </Routes>
    </Suspense>
  );
};

const App: React.FC = () => (
  <ErrorBoundary>
    <ToastProvider>
      <AuthProvider>
        <DataProvider>
          <Router>
            <AppContent />
          </Router>
        </DataProvider>
      </AuthProvider>
    </ToastProvider>
  </ErrorBoundary>
);

export default App;