// frontend/src/pages/HomePage.tsx
import React, { useState, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { useSession } from '@/contexts/SessionContext';
import { generateWeaknessBasedTest, getDailyWarmupQuiz } from '@/services/aiService';
import { createSession } from '@/services/apiService';
import { getTopicContentIds, getChapterContent } from '@/services/contentService';
import {
  BookOpenIcon, ChevronDownIcon, DocumentPlusIcon, UsersIcon, ChartPieIcon, BeakerIcon, LightBulbIcon, BoltIcon, PuzzlePieceIcon, ArrowPathIcon
} from '@heroicons/react/24/outline';
import Loader from '@/components/Loader';
import { useToast } from '@/components/Toast';
import type { Chapter, Topic, QuizSession } from '@pediaquiz/types';
import clsx from 'clsx';
import DashboardCard from '@/components/DashboardCard';

const HomePage: React.FC = () => {
  const { user } = useAuth();
  const { appData, isLoadingData, errorLoadingData } = useData();
  const { activeSession, isLoading: isLoadingActiveSession } = useSession();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());

  const generalTopics = useMemo(() => (appData?.topics || []).filter(t => t.source === 'General').sort((a,b) => a.name.localeCompare(b.name)), [appData]);
  const marrowTopics = useMemo(() => (appData?.topics || []).filter(t => t.source === 'Marrow').sort((a,b) => a.name.localeCompare(b.name)), [appData]);

  const startSessionMutation = useMutation({
    mutationFn: async ({ mode, mcqIds, flashcardIds }: { mode: QuizSession['mode'], mcqIds: string[], flashcardIds?: string[] }) => {
      const response = await createSession({ mode, mcqIds, flashcardIds });
      return { mode, sessionId: response.data.sessionId };
    },
    onSuccess: ({ mode, sessionId }) => {
        navigate(`/session/${mode}/${sessionId}`);
        queryClient.invalidateQueries({ queryKey: ['activeSession'] });
    },
    onError: (error: any) => addToast(`Error starting session: ${error.message}`, 'error'),
  });

  const practiceMutation = useMutation({
    mutationFn: async ({ scope, item }: { scope: 'topic' | 'chapter', item: Topic | Chapter }) => {
        if (scope === 'topic') {
            const response = await getTopicContentIds({ topicId: item.id });
            return { mcqIds: response.data.mcqIds };
        } else {
            const response = await getChapterContent({ chapterId: item.id });
            return { mcqIds: response.data.mcqs.map(mcq => mcq.id) };
        }
    },
    onSuccess: ({ mcqIds }) => {
        if (!mcqIds || mcqIds.length === 0) {
            addToast("No MCQs available to practice for this selection.", "info");
            return;
        }
        startSessionMutation.mutate({ mode: 'practice', mcqIds });
    },
    onError: (error: any) => addToast(`Failed to start practice session: ${error.message}`, 'error'),
  });

  const weaknessTestMutation = useMutation({
    mutationFn: (testSize: number) => generateWeaknessBasedTest({ testSize }),
    onSuccess: (response) => {
      if (response.data.mcqIds.length === 0) {
        return addToast('No content available for this session. Complete some quizzes first!', 'info');
      }
      startSessionMutation.mutate({ mode: 'weakness', mcqIds: response.data.mcqIds });
    },
    onError: (error: any) => addToast(`Error generating weakness test: ${error.message}`, 'error'),
  });

  const warmupQuizMutation = useMutation({
    mutationFn: () => getDailyWarmupQuiz(),
    onSuccess: (response) => {
      if (response.data.mcqIds.length === 0) {
        return addToast('No content available for this session.', 'info');
      }
      startSessionMutation.mutate({ mode: 'warmup', mcqIds: response.data.mcqIds });
    },
    onError: (error: any) => addToast(`Error generating warm-up quiz: ${error.message}`, 'error'),
  });

  const toggleTopic = useCallback((topicId: string) => {
    setExpandedTopics((prev) => {
      const newSet = new Set(prev);
      newSet.has(topicId) ? newSet.delete(topicId) : newSet.add(topicId);
      return newSet;
    });
  }, []);

  if (isLoadingData || isLoadingActiveSession) return <Loader fullScreen message="Loading dashboard..." />;
  if (errorLoadingData || !appData || !user) return <div className="text-center py-10 text-red-500">Could not load application data.</div>;

  const isActionLoading = weaknessTestMutation.isPending || warmupQuizMutation.isPending || startSessionMutation.isPending || practiceMutation.isPending;

  const TopicList = ({ topics }: { topics: Topic[] }) => (
    <>
      {topics.length === 0 && <p className="text-slate-500 text-center card-base py-4">No topics found in this category.</p>}
      {topics.map((topic: Topic) => (
         <div key={topic.id} className="card-base !p-0 overflow-hidden transition-all">
            <div className="p-4 flex justify-between items-center">
                <button className="flex-grow text-left" onClick={() => toggleTopic(topic.id)}>
                    <h3 className="font-bold text-lg">{topic.name} <span className="text-sm font-normal text-slate-500">({topic.totalMcqCount || 0} MCQs)</span></h3>
                </button>
                <button onClick={() => practiceMutation.mutate({ scope: 'topic', item: topic })} disabled={isActionLoading || !topic.totalMcqCount} className="btn-secondary text-xs px-2 py-1 ml-4 whitespace-nowrap">Practice Topic</button>
                <button className="p-2 ml-2" onClick={() => toggleTopic(topic.id)}>
                    <ChevronDownIcon className={clsx(`h-5 w-5 transition-transform duration-300`, expandedTopics.has(topic.id) && 'rotate-180')} />
                </button>
            </div>
            {expandedTopics.has(topic.id) && (
                <div className="p-4 border-t border-slate-200 dark:border-slate-700">
                    <ul className="space-y-2">
                       {Array.isArray(topic.chapters) && topic.chapters.sort((a,b) => a.name.localeCompare(b.name)).map((chapter: Chapter) => (
                            <li key={chapter.id} className="flex justify-between items-center p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                                <Link to={`/chapters/${topic.id}/${chapter.id}`} className="flex-grow">
                                   <p className="font-medium">{chapter.name} <span className="text-xs font-normal text-slate-500">({chapter.mcqCount || 0} MCQs | {chapter.flashcardCount || 0} FCs)</span></p>
                                </Link>
                                <div className="flex flex-col sm:flex-row gap-2 ml-2">
                                    <button onClick={() => practiceMutation.mutate({ scope: 'chapter', item: chapter })} disabled={isActionLoading || !chapter.mcqCount} className="btn-primary text-xs px-2 py-1">Practice MCQs</button>
                                    <button onClick={() => navigate(`/flashcards/${topic.id}/${chapter.id}`)} disabled={isActionLoading || !chapter.flashcardCount} className="btn-primary text-xs px-2 py-1">Practice FCs</button>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
      ))}
    </>
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Welcome, {user.displayName || 'Future Pediatrician'}!</h1>
        <p className="text-slate-500 mt-1">What would you like to focus on today?</p>
      </div>

      {activeSession && !activeSession.isFinished && (
        <div className="card-base p-4 bg-sky-100 dark:bg-sky-900/30 text-sky-800 dark:text-sky-200 flex items-center justify-between animate-fade-in-up">
          <p className="font-semibold">Continue your {activeSession.mode.replace(/_/g, ' ')} session?</p>
          <Link to={`/session/${activeSession.mode}/${activeSession.id}`} className="btn-secondary flex items-center gap-2 px-3 py-1 text-sm">Resume <ArrowPathIcon className="h-4 w-4" /></Link>
        </div>
      )}

      <section>
          <h2 className="text-2xl font-bold mb-4">Study Tools</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <DashboardCard title="Daily Warm-up" description="Start your day with a quick, mixed quiz." icon={<LightBulbIcon />} onClick={() => warmupQuizMutation.mutate()} className="bg-amber-50 dark:bg-amber-900/20"/>
              <DashboardCard title="AI Weakness Test" description="Target your weak spots with an adaptive quiz." icon={<BeakerIcon />} onClick={() => weaknessTestMutation.mutate(20)} className="bg-red-50 dark:bg-red-900/20"/>
              <DashboardCard title="QuickFire Game" description="Answer as many as you can in 60 seconds." icon={<BoltIcon />} path="/quick-fire-game" className="bg-indigo-50 dark:bg-indigo-900/20"/>
              <DashboardCard title="DDx Game" description="Sharpen your diagnostic skills with clinical cases." icon={<PuzzlePieceIcon />} path="/ddx-game" className="bg-teal-50 dark:bg-teal-900/20"/>
          </div>
      </section>

      {(user.role === 'admin' || user.role === 'faculty') && (
          <section>
              <h2 className="text-2xl font-bold mb-4">Admin Panel</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <DashboardCard title="Content Uploader" description="Create new content from PDF or text." icon={<DocumentPlusIcon />} path="/generator" />
                  <DashboardCard title="Review Queue" description="Approve or reject pending content." icon={<BookOpenIcon />} path="/admin/review" />
                  {user.role === 'admin' && <DashboardCard title="User Management" description="Manage user roles and permissions." icon={<UsersIcon />} path="/admin/users" />}
                  {user.role === 'admin' && <DashboardCard title="Analytics" description="View application usage statistics." icon={<ChartPieIcon />} path="/admin/analytics" />}
              </div>
          </section>
      )}
      
      <section className="space-y-4">
          <h2 className="text-2xl font-bold pt-4">Browse Content</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <DashboardCard title="Custom Test" description="Build a personalized quiz from any topic." icon={<PuzzlePieceIcon />} path="/custom-test-builder" />
            <DashboardCard title="Mock Exam" description="Simulate an exam with a timed, mixed quiz." icon={<BoltIcon />} path="/mock-exam-builder" />
            <DashboardCard title="Browse by Tag" description="Find questions related to specific clinical concepts." icon={<BookOpenIcon />} path="/tags" />
          </div>
      </section>

      {generalTopics.length > 0 && (
        <section id="general-topics" className="space-y-4">
            <h2 className="text-2xl font-bold pt-4">General Topics</h2>
            <TopicList topics={generalTopics} />
        </section>
      )}

      {marrowTopics.length > 0 && (
        <section id="marrow-topics" className="space-y-4">
            <h2 className="text-2xl font-bold pt-4">Marrow QBank</h2>
            <TopicList topics={marrowTopics} />
        </section>
      )}
    </div>
  );
};

export default HomePage;