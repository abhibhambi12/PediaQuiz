// frontend/src/App.tsx
// frontend/src/App.tsx
// frontend/src/App.tsx
import React, { Suspense, useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Outlet,
  Link as RouterLink,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { DataProvider } from "./contexts/DataContext";
import { ToastProvider, useToast } from "./components/Toast";
import Header from "./components/Header";
import BottomNav from "./components/BottomNav";
import AdminRoute from "./components/AdminRoute";
import Loader from "./components/Loader";
import FloatingActionButton from "./components/FloatingActionButton";
import ErrorBoundary from "./components/ErrorBoundary";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Joyride, { STATUS } from 'react-joyride'; // Ensure STATUS is imported if used
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { app } from './firebase'; // Ensure 'app' is imported

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 3,
      staleTime: 1000 * 60,
    },
  },
});

// Lazy-loaded pages
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
const BookmarksPage = React.lazy(() => import("./pages/BookmarksPage"));
const GeneratorPage = React.lazy(() => import("./pages/GeneratorPage"));
const MCQSessionPage = React.lazy(() => import("./pages/MCQSessionPage"));
const SearchResultsPage = React.lazy(() => import("./pages/SearchResultsPage"));
const TagsPage = React.lazy(() => import("./pages/TagsPage"));
const TagQuestionsPage = React.lazy(() => import("./pages/TagQuestionsPage"));
const ChapterNotesEditPage = React.lazy(() => import("./pages/ChapterNotesEditPage"));
const QuizResultsPage = React.lazy(() => import("./pages/QuizResultsPage"));
const GoalsPage = React.lazy(() => import("./pages/GoalsPage"));
const QuickFireGamePage = React.lazy(() => import("./pages/QuickFireGamePage"));

// NEW FEATURE PAGES - Placeholder (will be implemented in later batches)
const CramSheetsPage = React.lazy(() => import("./pages/CramSheetsPage")); // For Feature #10
const MockExamBuilder = React.lazy(() => import("./pages/MockExamBuilder")); // For Feature #8
const DDxGamePage = React.lazy(() => import("./pages/DDxGamePage")); // For Feature #9


const NotFoundPage: React.FC = () => (
  <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center bg-neutral-100 dark:bg-neutral-900 text-slate-800 dark:text-slate-200">
    <h1 className="text-3xl font-bold text-red-500">Oops! Page Not Found</h1>
    <p className="mt-4 text-lg text-slate-600 dark:text-slate-400">
      We couldn't find the page you were looking for.
    </p>
    <RouterLink to="/" className="mt-6 px-4 py-2 rounded-md font-semibold bg-sky-500 text-white hover:bg-sky-600">
      Go Back Home
    </RouterLink>
  </div>
);

const AppLayout: React.FC = () => {
  const { user } = useAuth();
  const { addToast } = useToast();

  // Joyride tour steps for onboarding
  const tourSteps = [
    {
      target: '.logo-link',
      content: 'Welcome to PediaQuiz! Let\'s take a quick tour.',
      placement: 'bottom' as const,
      disableBeacon: true,
    },
    {
      target: '.search-bar-tour-target',
      content: 'Use the Smart Search to find any MCQ or Flashcard across all topics. Try searching a symptom or diagnosis!',
      placement: 'bottom' as const,
    },
    {
      target: '.quick-action-ai-test',
      content: 'Jump into an AI-powered test tailored to your weaknesses. The more you study, the smarter it gets!',
      placement: 'bottom' as const,
    },
    {
      target: '.quick-action-custom-test',
      content: 'Build a custom quiz from any chapter or topic. You choose the content and number of questions!',
      placement: 'bottom' as const,
    },
    {
      target: '.quick-action-daily-warmup',
      content: 'Start your day with a quick Daily Warm-up quiz to keep your streak going and earn bonus XP!',
      placement: 'bottom' as const,
    },
    {
      target: '.topic-browser-section',
      content: 'Browse all general pediatric topics and dive into specific chapters.',
      placement: 'top' as const,
    },
    {
      target: '.bottom-nav-home',
      content: 'Your main dashboard where you can find everything you need to start studying.',
      placement: 'top' as const,
    },
    {
      target: '.bottom-nav-bookmarks',
      content: 'Save important questions and flashcards here for quick review anytime.',
      placement: 'top' as const,
    },
    {
      target: '.bottom-nav-stats',
      content: 'Track your progress, see your strengths and weaknesses, and get AI-powered advice!',
      placement: 'top' as const,
    },
    {
      target: '.bottom-nav-settings',
      content: 'Manage your profile and app settings, including unlocking new themes!',
      placement: 'top' as const,
    },
    {
      target: '.floating-action-button',
      content: 'Need help or a quick explanation? Your AI Study Assistant is always here!',
      placement: 'left' as const,
    },
    {
      target: 'body',
      content: 'That\'s the tour! Get ready to master Pediatrics with PediaQuiz. Good luck!',
      placement: 'center' as const,
    },
  ];

  const [runTour, setRunTour] = React.useState(false);

  useEffect(() => {
    // Only run tour if user is logged in AND onboarding hasn't been completed before
    if (user && !localStorage.getItem('pediaquiz_onboarding_completed')) {
      setRunTour(true);
    }
  }, [user]);

  const handleJoyrideCallback = (data: any) => {
    const { status } = data;
    // When tour finishes or is skipped, mark onboarding as completed in local storage
    if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status)) {
      setRunTour(false);
      localStorage.setItem('pediaquiz_onboarding_completed', 'true');
    }
  };

  // Firebase Cloud Messaging setup for push notifications
  useEffect(() => {
    const setupMessaging = async () => {
      // Check if service workers are supported and if VAPID key is provided in .env
      if ('serviceWorker' in navigator && import.meta.env.VITE_FIREBASE_MESSAGING_VAPID_KEY) {
        try {
          const messaging = getMessaging(app);
          // Request permission for notifications if not granted yet
          if (Notification.permission === 'default') {
            await Notification.requestPermission();
          }

          // Get FCM registration token for this device
          const token = await getToken(messaging, { vapidKey: import.meta.env.VITE_FIREBASE_MESSAGING_VAPID_KEY });
          console.log("FCM Token:", token); // For development/debugging purposes

          // Handle foreground messages (when app is open)
          onMessage(messaging, (payload) => {
            console.log('Foreground Message received:', payload);
            // Display notification using the custom toast component
            addToast(payload.notification?.body || "New Notification!", "info", 5000);
          });
        } catch (error) {
          console.error("Error setting up FCM:", error);
          if (user) addToast("Failed to setup notifications.", "error");
        }
      }
    };
    // Setup messaging only if user is logged in
    if (user) {
      setupMessaging();
    }
  }, [user, addToast]); // Re-run if user or addToast changes

  return (
    <div className="flex flex-col min-h-screen bg-neutral-100 dark:bg-neutral-900">
      <Header />
      <main className="flex-grow container mx-auto px-4 sm:px-6 lg:px-8 py-8 mb-20">
        <Outlet /> {/* Renders child routes */}
      </main>
      <div className="floating-action-button">
        <FloatingActionButton />
      </div>
      <BottomNav />
      {user && ( // Only run Joyride if a user is logged in
        <Joyride
          steps={tourSteps}
          run={runTour}
          continuous // Continue to next step automatically
          showProgress // Show progress (e.g., 1/12)
          showSkipButton // Allow skipping the tour
          callback={handleJoyrideCallback} // Handle tour events (finish, skip)
          styles={{
            options: { zIndex: 10000 }, // Ensure tour is on top
          }}
        />
      )}
    </div>
  );
};

const AppContent: React.FC = () => {
  const { user, loading } = useAuth(); // Get user and loading state from AuthContext

  if (loading) return <Loader message="Authenticating..." />; // Show a global loader during auth loading

  return (
    <Suspense fallback={<Loader message="Loading page..." />}> {/* Fallback for lazy-loaded pages */}
      <Routes>
        {/* Auth page is accessible when not logged in, otherwise redirects to home */}
        <Route path="/auth" element={!user ? <AuthPage /> : <Navigate to="/" replace />} />
        
        {/* Protected routes that require authentication */}
        {/* The AppLayout component wraps all protected routes, providing Header, BottomNav, FAB */}
        <Route element={user ? <AppLayout /> : <Navigate to="/auth" replace />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/flashcards/:topicId/:chapterId" element={<FlashcardSessionPage />} />
          <Route path="/chapters/:topicId/:chapterId" element={<ChapterDetailPage />} />
          <Route path="/custom-test-builder" element={<CustomTestBuilder />} />
          <Route path="/chat" element={<ChatPage />} />
          {/* CRITICAL FIX: Removed MarrowQBankPage route as it's deprecated */}
          {/* <Route path="/marrow-qbank" element={<MarrowQBankPage />} /> */}
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/log-screen" element={<LogScreenPage />} />
          <Route path="/bookmarks" element={<BookmarksPage />} />
          <Route path="/goals" element={<GoalsPage />} />
          <Route path="/quick-fire" element={<QuickFireGamePage />} />
          <Route path="/session/:mode/:sessionId" element={<MCQSessionPage />} />
          <Route path="/results/:resultId" element={<QuizResultsPage />} />
          <Route path="/search" element={<SearchResultsPage />} />
          <Route path="/tags" element={<TagsPage />} />
          <Route path="/tags/:tagName" element={<TagQuestionsPage />} />
          
          {/* Admin Routes - Protected by AdminRoute component */}
          <Route path="/admin/marrow/notes/edit/:topicId/:chapterId" element={<AdminRoute><ChapterNotesEditPage /></AdminRoute>} />
          <Route path="/generator" element={<AdminRoute><GeneratorPage /></AdminRoute>} />
          <Route path="/admin/review" element={<AdminRoute><AdminReviewPage /></AdminRoute>} />
          <Route path="/admin/marrow" element={<AdminRoute><AdminMarrowPage /></AdminRoute>} />
          {/* Removed AdminCompletedJobsPage route as per requirement */}
          {/* <Route path="/admin/completed" element={<AdminRoute><AdminCompletedJobsPage /></AdminRoute>} /> */}

          {/* New Feature Routes - Placeholder (will be implemented in later batches) */}
          <Route path="/cram-sheets" element={<CramSheetsPage />} /> {/* Feature #10: Cram Sheets */}
          <Route path="/mock-exam" element={<MockExamBuilder />} /> {/* Feature #8: Mock Exam */}
          <Route path="/ddx-game" element={<DDxGamePage />} /> {/* Feature #9: DDx Game */}

        </Route>
        {/* Fallback for any unmatched routes */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
};

const App: React.FC = () => {
  return (
    <ToastProvider> {/* Provides toast notifications globally */}
      <ErrorBoundary> {/* Catches and displays render errors */}
        <QueryClientProvider client={queryClient}> {/* Provides TanStack Query client */}
          <AuthProvider> {/* Provides authentication context */}
            <DataProvider> {/* Provides global app data context */}
              <Router> {/* Manages routing */}
                <AppContent /> {/* Main application content */}
              </Router>
            </DataProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </ToastProvider>
  );
};

export default App;