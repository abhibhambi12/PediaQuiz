// frontend/src/pages/HomePage.tsx
import React, { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { HttpsCallableResult } from 'firebase/functions';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { getAttemptedMCQs } from '@/services/userDataService';
// Ensure getDailyGrindPlaylist is correctly imported from aiService
import { generateWeaknessBasedTest, getDailyWarmupQuiz, generateQuickFireTest, getDailyGrindPlaylist } from '@/services/aiService';
import { SessionManager } from '@/services/sessionService'; // Import SessionManager
import { ChevronDownIcon, ChevronRightIcon, BookOpenIcon as BookIcon, SparklesIcon as BrainIcon, MagnifyingGlassIcon, PlayIcon, ArrowPathIcon } from '@heroicons/react/24/outline'; // Added ArrowPathIcon for resume
import Loader from '@/components/Loader';
import { useToast } from '@/components/Toast';
import { Chapter, Topic, AttemptedMCQDocument, MCQ, QuizSession, GetDailyGrindPlaylistCallableData } from '@pediaquiz/types'; // Import GetDailyGrindPlaylistCallableData
import clsx from 'clsx';
import { calculateLevelProgress } from '@/utils/gamification';
import { isToday } from 'date-fns'; // For streak check
import { collection, getDocs, query, where } from 'firebase/firestore'; // For fetching limited MCQ data
import { db } from '@/firebase'; // Import db

const HomePage: React.FC = () => {
    const { user } = useAuth();
    const { appData, isLoadingData: isAppDataLoading, errorLoadingData: appDataError } = useData();
    const { addToast } = useToast();
    const navigate = useNavigate();

    const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
    const [isSearching, setIsSearching] = useState(false);

    // Fetch user's active session for "Resume Session" banner (Feature #2.2)
    const { data: activeSession, isLoading: isLoadingActiveSession } = useQuery<QuizSession | null, Error>({
        queryKey: ['activeSession', user?.uid, user?.activeSessionId],
        queryFn: async () => {
            if (!user?.uid || !user.activeSessionId) return null;
            return SessionManager.getSession(user.activeSessionId, user.uid);
        },
        enabled: !!user?.uid && !!user.activeSessionId,
        staleTime: Infinity, // Active session doesn't become stale until explicitly finished/expired
        gcTime: Infinity,
        refetchOnWindowFocus: false,
    });


    const generalTopics = useMemo(() => {
        return appData?.topics.filter((topic: Topic) => topic.source === 'General') || [];
    }, [appData]);

    const marrowTopics = useMemo(() => {
        return appData?.topics.filter((topic: Topic) => topic.source === 'Marrow') || [];
    }, [appData]);

    const { data: attemptedMCQDocs, isLoading: areAttemptsLoading, error: attemptsErrorFromQuery } = useQuery<Record<string, AttemptedMCQDocument>, Error>({
        queryKey: ['attemptedMCQDocs', user?.uid],
        queryFn: ({ queryKey }) => getAttemptedMCQs(queryKey[1] as string),
        enabled: !!user?.uid,
    });

    // Fetch all MCQs (minimized data) for weakness test logic (Feature #2.3 fix)
    // This fetches only necessary metadata for AI selection, not full MCQ objects.
    const { data: allApprovedMcqsForWeakness, isLoading: isLoadingAllMcqsForWeakness } = useQuery<MCQ[], Error>({
        queryKey: ['allApprovedMcqsForWeakness'],
        queryFn: async () => {
            // Fetch only relevant fields (id, topicId, chapterId, source, tags, difficulty)
            // Limit the initial fetch to a reasonable number to avoid heavy client-side downloads,
            // or consider a backend function to provide just this subset of metadata if dataset is huge.
            const masterSnap = await getDocs(query(collection(db, 'MasterMCQ'), where('status', '==', 'approved')));
            const marrowSnap = await getDocs(query(collection(db, 'MarrowMCQ'), where('status', '==', 'approved')));
            
            // Explicitly type doc in map for clarity and safety
            const combinedMcqs = [
                ...masterSnap.docs.map(doc => ({
                    id: doc.id,
                    topicId: doc.data().topicId,
                    chapterId: doc.data().chapterId,
                    source: doc.data().source,
                    tags: doc.data().tags,
                    difficulty: doc.data().difficulty
                }) as MCQ),
                ...marrowSnap.docs.map(doc => ({
                    id: doc.id,
                    topicId: doc.data().topicId,
                    chapterId: doc.data().chapterId,
                    source: doc.data().source,
                    tags: doc.data().tags,
                    difficulty: doc.data().difficulty
                }) as MCQ),
            ];
            return combinedMcqs;
        },
        enabled: !!user && !isAppDataLoading, // Only fetch if user is logged in and appData is not loading
        staleTime: 1000 * 60 * 60, // Cache for 1 hour
        gcTime: 1000 * 60 * 60 * 24, // Keep for 24 hours
        refetchOnWindowFocus: false,
    });

    useEffect(() => {
        if (attemptsErrorFromQuery) {
            addToast(`Error loading your progress: ${attemptsErrorFromQuery.message}`, 'error');
        }
        if (appDataError) {
            addToast(`Error loading app data: ${appDataError.message}`, 'error');
        }
    }, [attemptsErrorFromQuery, appDataError, addToast]);

    const generateWeaknessTestMutation = useMutation<HttpsCallableResult<{ mcqIds: string[] }>, Error, { testSize: number; }>({
        mutationFn: (variables) => generateWeaknessBasedTest({ allMcqs: allApprovedMcqsForWeakness || [], testSize: variables.testSize }),
        onSuccess: (response: HttpsCallableResult<{ mcqIds: string[] }>) => { // Explicitly type response
            const mcqIds = response.data.mcqIds;
            if (mcqIds.length === 0) {
                addToast("Could not generate an AI weakness test. Try answering more questions incorrectly!", "info");
            } else {
                addToast(`Generated AI weakness test with ${mcqIds.length} questions!`, "success");
                navigate(`/session/weakness/test_${Date.now()}`, { state: { generatedMcqIds: mcqIds } });
            }
        },
        onError: (error: any) => { // Explicitly type error
            addToast(`Error generating test: ${error.message}`, "error");
        },
    });

    const dailyWarmupMutation = useMutation<HttpsCallableResult<{ mcqIds: string[] }>, Error>({
        mutationFn: getDailyWarmupQuiz, // This callable fetches 10 hardcoded questions
        onSuccess: (response: HttpsCallableResult<{ mcqIds: string[] }>) => { // Explicitly type response
            const mcqIds = response.data.mcqIds;
            if (mcqIds.length === 0) {
                addToast("Not enough questions for a warm-up yet. Keep studying!", "info");
            } else {
                addToast(`Your ${mcqIds.length}-question Daily Warm-up is ready!`, "success");
                navigate(`/session/warmup/warmup_${Date.now()}`, { state: { generatedMcqIds: mcqIds } });
            }
        },
        onError: (error: any) => { // Explicitly type error
            addToast(`Error generating warm-up: ${error.message}`, "error");
        },
    });

    const generateQuickFireTestMutation = useMutation<HttpsCallableResult<{ mcqIds: string[] }>, Error, { testSize: number }>({
        mutationFn: generateQuickFireTest,
        onSuccess: () => {
            navigate('/quick-fire'); // Quick Fire game is a direct page, questions generated internally
        },
        onError: (error: any) => { // Explicitly type error
            addToast(`Error starting Quick Fire: ${error.message}`, "error");
        },
    });

    // NEW FEATURE: Daily Grind Spaced Repetition Playlist (#7)
    // FIX: Add userId to the data passed to mutationFn because GetDailyGrindPlaylistCallableData requires it
    const dailyGrindMutation = useMutation<HttpsCallableResult<{ mcqIds: string[], flashcardIds: string[] }>, Error, { mcqCount: number, flashcardCount: number }>({
        mutationFn: (data: { mcqCount: number, flashcardCount: number }) => {
            if (!user?.uid) { // Ensure user is logged in before calling
                throw new Error("User not authenticated.");
            }
            // Pass userId explicitly from the authenticated user
            const payload: GetDailyGrindPlaylistCallableData = {
                userId: user.uid,
                mcqCount: data.mcqCount,
                flashcardCount: data.flashcardCount,
            };
            return getDailyGrindPlaylist(payload);
        },
        onSuccess: (response: HttpsCallableResult<{ mcqIds: string[], flashcardIds: string[] }>) => { // Explicitly type response
            const { mcqIds, flashcardIds } = response.data;
            const totalItems = mcqIds.length + flashcardIds.length;
            if (totalItems === 0) {
                addToast("No items due for review today. Keep learning new things!", "info");
            } else {
                addToast(`Your Daily Grind playlist is ready with ${totalItems} items!`, "success");
                // For simplicity, we'll start an MCQ session with MCQs, then navigate to Flashcards if present.
                // A more advanced solution would interleave them in a custom session mode.
                if (mcqIds.length > 0 || flashcardIds.length > 0) {
                    navigate(`/session/daily_grind/grind_${Date.now()}`, { state: { generatedMcqIds: mcqIds, generatedFlashcardIds: flashcardIds } });
                } else {
                    addToast("No items found for Daily Grind today.", "info");
                }
            }
        },
        onError: (error: any) => { // Explicitly type error
            addToast(`Error generating Daily Grind: ${error.message}`, "error");
        },
    });


    const handleGenerateAiTest = () => {
        if (!user?.uid || !allApprovedMcqsForWeakness || !attemptedMCQDocs) {
            addToast("Please log in and ensure app data is loaded to generate AI tests.", "info");
            return;
        }
        // As per prompt, check for 10 incorrect answers
        const incorrectCount = Object.values(attemptedMCQDocs).filter((doc: AttemptedMCQDocument) => !doc.latestAttempt.isCorrect).length; // Explicitly type doc
        if (incorrectCount < 10) { // Changed from 5 to 10 as per prompt 2.3
            addToast("Answer at least 10 questions incorrectly to unlock AI-powered weakness tests.", "info");
            return;
        }
        generateWeaknessTestMutation.mutate({ testSize: 20 });
    };

    const handleStartQuickFire = () => {
        if (!user) {
            addToast("Please log in to play Quick Fire.", "info");
            return;
        }
        generateQuickFireTestMutation.mutate({ testSize: 10 });
    };

    const handleStartDailyGrind = () => {
        if (!user) {
            addToast("Please log in to start your Daily Grind.", "info");
            return;
        }
        // Request a mix of MCQs and Flashcards due for review
        dailyGrindMutation.mutate({ mcqCount: 10, flashcardCount: 5 });
    };

    const handleSearchSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsSearching(true);
        const formData = new FormData(e.currentTarget);
        const query = (formData.get('search') as string).trim();
        if (query.length < 3) {
            addToast("Please enter at least 3 characters to search.", "info");
            setIsSearching(false);
            return;
        }
        // SearchResultsPage will handle calling getExpandedSearchTerms and searchContent
        navigate(`/search?q=${encodeURIComponent(query)}`);
        setIsSearching(false);
    };

    const toggleTopic = (topicId: string) => {
        setExpandedTopics(prev => {
            const newSet = new Set(prev);
            newSet.has(topicId) ? newSet.delete(topicId) : newSet.add(topicId);
            return newSet;
        });
    };

    const isLoadingPage = isAppDataLoading || areAttemptsLoading || isLoadingAllMcqsForWeakness || isLoadingActiveSession;

    if (isLoadingPage) return <Loader message="Loading study data..." />;
    if (appDataError) return <div className="text-center py-4 text-red-500">Error loading data: ${appDataError.message}</div>;
    if (!appData) return <div className="text-center py-10 text-slate-500">No app data found. This might indicate a problem loading content.</div>;
    if (!user) return <div className="text-center py-10 text-slate-500">Please log in to access all features.</div>;

    // Check if AI Weakness Test should be enabled based on user's incorrect attempts
    const canGenerateAiTest = user && attemptedMCQDocs && Object.values(attemptedMCQDocs).filter((doc: AttemptedMCQDocument) => !doc.latestAttempt.isCorrect).length >= 10 && (allApprovedMcqsForWeakness?.length || 0) > 0; // Explicitly type doc

    // Check if there's an active session to resume (Feature #2.2)
    const showResumeSession = activeSession && !activeSession.isFinished;


    return (
        <div className="p-6 max-w-6xl mx-auto space-y-6">
            <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-50">Welcome, {user.displayName || 'Future Pediatrician'}!</h1>
            
            {/* Resume Active Session Banner (Feature #2.2) */}
            {showResumeSession && (
                <div className="card-base p-4 bg-sky-100 dark:bg-sky-900/30 text-sky-800 dark:text-sky-200 flex items-center justify-between animate-pop-in">
                    <div>
                        <p className="font-semibold">Continue where you left off!</p>
                        <p className="text-sm">Resume your {activeSession?.mode.replace(/_/g, ' ') || 'last'} session.</p>
                    </div>
                    <Link
                        to={`/session/${activeSession?.mode}/${activeSession?.id}`}
                        className="btn-secondary flex items-center gap-2 px-3 py-1 text-sm"
                    >
                        Resume <ArrowPathIcon className="h-4 w-4" />
                    </Link>
                </div>
            )}

            {/* Smart Search Bar */}
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 search-bar-tour-target">
                <form onSubmit={handleSearchSubmit}>
                    <div className="relative">
                        <input type="search" name="search" placeholder="Smart Search all MCQs and Flashcards..." className="w-full p-3 pl-10 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500 text-slate-900 dark:text-slate-100" disabled={isSearching} />
                        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none"><MagnifyingGlassIcon className="h-5 w-5 text-slate-400" /></div>
                        {isSearching && <div className="absolute inset-y-0 right-0 flex items-center pr-3"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-sky-500"></div></div>}
                    </div>
                </form>
            </div>
            
            {/* Quick Action Buttons */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button onClick={() => dailyWarmupMutation.mutate()} disabled={dailyWarmupMutation.isPending} className="btn-warning flex items-center justify-center gap-3 py-4 text-lg quick-action-daily-warmup">
                    {dailyWarmupMutation.isPending ? "Building..." : "☀️ Daily Warm-up"}
                </button>
                <Link to="/custom-test-builder" className="btn-primary flex items-center justify-center gap-3 py-4 text-lg quick-action-custom-test">
                    Build a Custom Test
                </Link>
                <button onClick={handleGenerateAiTest} disabled={generateWeaknessTestMutation.isPending || !canGenerateAiTest} className="btn-secondary flex items-center justify-center gap-3 py-4 text-lg disabled:opacity-50 disabled:cursor-not-allowed quick-action-ai-test">
                    <BrainIcon className="h-6 w-6" />{generateWeaknessTestMutation.isPending ? "Generating..." : "🎯 Start AI Weakness Test"}
                </button>
                <button onClick={handleStartQuickFire} disabled={generateQuickFireTestMutation.isPending} className="btn-danger flex items-center justify-center gap-3 py-4 text-lg">
                    <PlayIcon className="h-6 w-6" />{generateQuickFireTestMutation.isPending ? "Loading..." : "⚡ Quick Fire Game"}
                </button>
                {/* NEW FEATURE: Daily Grind Spaced Repetition Playlist button (#7) */}
                <button onClick={handleStartDailyGrind} disabled={dailyGrindMutation.isPending} className="btn-success flex items-center justify-center gap-3 py-4 text-lg">
                    {dailyGrindMutation.isPending ? "Building Grind..." : "🔁 Daily Grind Review"}
                </button>
                {/* NEW FEATURE: Mock Exam Builder button (#8) */}
                <Link to="/mock-exam" className="btn-neutral flex items-center justify-center gap-3 py-4 text-lg">
                    📝 Build Mock Exam
                </Link>
                {/* NEW FEATURE: DDx Game button (#9) */}
                <Link to="/ddx-game" className="btn-warning flex items-center justify-center gap-3 py-4 text-lg">
                    🧪 DDx Game
                </Link>
            </div>
            {!canGenerateAiTest && (
                <p className="text-xs text-center text-slate-500 dark:text-slate-400 -mt-2">
                    Answer at least 10 questions incorrectly to unlock AI-powered tests.
                </p>
            )}

            {marrowTopics.length > 0 && (
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden transition-all p-4">
                    <Link to="/marrow-qbank" className="block text-center font-bold text-xl text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-500 transition-colors py-2">
                        📚 High-Yield QBank (Marrow)
                        <p className="text-sm font-normal text-slate-500 dark:text-slate-400">Targeted content from top sources</p>
                    </Link>
                </div>
            )}
            
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-50 pt-4">Browse General Topics</h2>
            {generalTopics.length === 0 ? (
                <div className="text-center py-4 text-slate-500 dark:text-slate-400">No general topics available yet.</div>
            ) : (
                <div className="space-y-4 topic-browser-section">
                    {generalTopics.map((topic: Topic) => {
                        const isExpanded = expandedTopics.has(topic.id);
                        return (
                            <div key={topic.id} className="card-base overflow-hidden transition-all">
                                <div className="w-full text-left p-4 flex justify-between items-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors" onClick={() => toggleTopic(topic.id)}>
                                    <div>
                                        <h3 className="font-bold text-lg text-slate-800 dark:text-slate-200">{topic.name}</h3>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">{topic.chapterCount} Chapters | {topic.totalMcqCount} MCQs | {topic.totalFlashcardCount || 0} Flashcards</p>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        {(topic.totalFlashcardCount ?? 0) > 0 && (
                                            <Link
                                                to={`/flashcards/${topic.id}/all`}
                                                className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700"
                                                title={`Practice all flashcards for ${topic.name}`}
                                                onClick={e => {
                                                    // Prevent the topic accordion from toggling when clicking the flashcard icon
                                                    e.stopPropagation();
                                                    // For a global "all flashcards" link, you might navigate to a dedicated session builder
                                                    // For now, this placeholder just shows a toast as the `all` chapter doesn't truly exist for session creation.
                                                    addToast("Flashcard session for entire topic is not yet available directly. Please select a chapter.", "info");
                                                    e.preventDefault(); // Prevent default navigation for now
                                                }}
                                            >
                                                <BookIcon className="h-6 w-6" />
                                            </Link>
                                        )}
                                        <ChevronDownIcon className={clsx(`h-5 w-5 transition-transform duration-300`, isExpanded ? 'rotate-180' : '')} />
                                    </div>
                                </div>
                                {isExpanded && (
                                    <div className="p-4 border-t border-slate-200 dark:border-slate-700">
                                        <ul className="space-y-2">
                                            {(topic.chapters as Chapter[]).map((chapter: Chapter) => {
                                                const chapterMcqCount = chapter.mcqCount || 0;
                                                const attemptedInChapter = attemptedMCQDocs ? Object.values(attemptedMCQDocs).filter((attemptDoc: AttemptedMCQDocument) => attemptDoc.latestAttempt.chapterId === chapter.id).length : 0;
                                                const progress = chapterMcqCount > 0 ? (attemptedInChapter / chapterMcqCount) * 100 : 0;
                                                return (
                                                    <li key={chapter.id}>
                                                        <Link to={`/chapters/${topic.id}/${chapter.id}`} className="block p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50 hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-colors">
                                                            <div className="flex justify-between items-center">
                                                                <div>
                                                                    <p className="font-medium text-slate-700 dark:text-slate-300">{chapter.name}</p>
                                                                    <p className="text-sm text-slate-500 dark:text-slate-400">{chapterMcqCount} MCQs | {chapter.flashcardCount || 0} Flashcards</p>
                                                                </div>
                                                                <ChevronRightIcon className="h-5 w-5" />
                                                            </div>
                                                            {chapterMcqCount > 0 && (
                                                                <div className="mt-2">
                                                                    <div className="w-full bg-slate-200 dark:bg-slate-600 rounded-full h-2"><div className="bg-sky-500 h-2 rounded-full" style={{ width: `${progress}%` }}></div></div>
                                                                    <p className="text-xs text-right text-slate-400 mt-1">{progress.toFixed(0)}% Complete</p>
                                                                </div>
                                                            )}
                                                        </Link>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default HomePage;