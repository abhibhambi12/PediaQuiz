// --- CORRECTED FILE: workspaces/frontend/src/App.tsx ---

import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Outlet,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { DataProvider } from "./contexts/DataContext"; // Keep DataProvider for now, even if it does nothing
import { ToastProvider } from "./components/Toast";
import Header from "./components/Header";
import BottomNav from "./components/BottomNav";
import AdminRoute from "./components/AdminRoute";
import Loader from "./components/Loader";
import FloatingActionButton from "./components/FloatingActionButton";
import ErrorBoundary from "./components/ErrorBoundary";
import { SoundProvider } from "./hooks/useSound";

// Import Pages
import HomePage from "./pages/HomePage";
import AuthPage from "./pages/AuthPage";
import SettingsPage from "./pages/SettingsPage";
import FlashcardSessionPage from "./pages/FlashcardSessionPage";
import ChapterDetailPage from "./pages/ChapterDetailPage";
import CustomTestBuilder from "./pages/CustomTestBuilder";
import ChatPage from "./pages/ChatPage";
import MarrowQBankPage from "./pages/MarrowQBankPage";
import AdminReviewPage from "./pages/AdminReviewPage";
import AdminMarrowPage from "./pages/AdminMarrowPage";
import LogScreenPage from "./pages/LogScreenPage";
import StatsPage from "./pages/StatsPage";
import AdminCompletedJobsPage from "./pages/AdminCompletedJobsPage";
import BookmarksPage from "./pages/BookmarksPage";
import GeneratorPage from "./pages/GeneratorPage";
import MCQSessionPage from "./pages/MCQSessionPage";
import SearchResultsPage from "./pages/SearchResultsPage";
import TagsPage from "./pages/TagsPage";
import TagQuestionsPage from "./pages/TagQuestionsPage";
import ChapterNotesEditPage from "./pages/ChapterNotesEditPage";
import QuizResultsPage from "./components/QuizResultsPage"; // Correct import path for QuizResultsPage

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
        {/* MCQ Session routes */}
        <Route path="/session/:mode/:sessionId" element={<MCQSessionPage />} />
        <Route path="/session/:mode/:sessionId/results" element={<QuizResultsPage />} />
        <Route path="/search" element={<SearchResultsPage />} />
        
        <Route path="/tags" element={<TagsPage />} />
        <Route path="/tags/:tagName" element={<TagQuestionsPage />} />

        <Route
          path="/admin/marrow/notes/edit/:topicId/:chapterId"
          element={
            <AdminRoute>
              <ChapterNotesEditPage />
            </AdminRoute>
          }
        />
        <Route
          path="/generator"
          element={
            <AdminRoute>
              <GeneratorPage />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/review"
          element={
            <AdminRoute>
              <AdminReviewPage />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/marrow"
          element={
            <AdminRoute>
              <AdminMarrowPage />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/completed"
          element={
            <AdminRoute>
              <AdminCompletedJobsPage />
            </AdminRoute>
          }
        />
      </Route>

      {/* Catch-all route */}
      <Route path="*" element={<Navigate to={user ? "/" : "/auth"} replace />} />
    </Routes>
  );
};

const App: React.FC = () => (
  <ErrorBoundary>
    <ToastProvider>
      <AuthProvider>
        {/* DataProvider is kept for structural consistency, even if it provides no data currently */}
        <DataProvider> 
          <Router>
            <SoundProvider>
              <AppContent />
            </SoundProvider>
          </Router>
        </DataProvider>
      </AuthProvider>
    </ToastProvider>
  </ErrorBoundary>
);

export default App;