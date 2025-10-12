import React, { useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { useChapterContent } from '@/hooks/useChapterContent';
import { generateChapterSummary } from '@/services/aiService';
import { getAttemptedMCQs } from '@/services/apiService';
import { SessionManager } from '@/services/sessionService';
import Loader from '@/components/Loader';
import LoadingSkeleton from '@/components/LoadingSkeleton';
import type { Chapter, Topic, AttemptedMCQDocument, QuizSession } from '@pediaquiz/types';
import ReactMarkdown from 'react-markdown';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);

const ChapterDetailPage: React.FC = () => {
    const { topicId, chapterId } = useParams<{ topicId: string; chapterId: string }>();
    const { appData } = useData();
    const { user } = useAuth();
    const navigate = useNavigate();
    const { addToast } = useToast();

    const [aiSummary, setAiSummary] = useState<string | null>(null);

    const { chapter, topic } = useMemo(() => {
        if (!appData || !topicId) return { chapter: null, topic: null };
        const foundTopic = appData.topics.find((t: Topic) => t.id === topicId);
        const foundChapter = Array.isArray(foundTopic?.chapters) ? foundTopic?.chapters.find((ch: Chapter) => ch.id === chapterId) || null : null;
        return { chapter: foundChapter, topic: foundTopic || null };
    }, [appData, topicId, chapterId]);
    
    const { data: chapterContent, isLoading: isContentLoading } = useChapterContent(chapterId);

    const { data: attemptedMCQDocs, isLoading: areAttemptsLoading } = useQuery({
        queryKey: ['attemptedMCQDocs', user?.uid],
        queryFn: async () => (await getAttemptedMCQs()).data,
        enabled: !!user,
    });

    const { incorrectMcqIds, correctCount, unattemptedCount } = useMemo(() => {
        if (!chapterContent?.mcqs || !attemptedMCQDocs) return { incorrectMcqIds: [], correctCount: 0, unattemptedCount: 0 };
        const mcqIdsInChapter = new Set(chapterContent.mcqs.map(m => m.id));
        let correct = 0;
        const incorrectIds: string[] = [];
        const attemptedIds = new Set<string>();

        Object.values(attemptedMCQDocs).forEach((doc: AttemptedMCQDocument) => {
            if (mcqIdsInChapter.has(doc.id)) {
                attemptedIds.add(doc.id);
                if (doc.latestAttempt.isCorrect) correct++;
                else incorrectIds.push(doc.id);
            }
        });
        const unattempted = chapterContent.mcqs.length - attemptedIds.size;
        return { incorrectMcqIds: incorrectIds, correctCount: correct, unattemptedCount: unattempted };
    }, [chapterContent, attemptedMCQDocs]);
    
    const generateSummaryMutation = useMutation({
        mutationFn: generateChapterSummary,
        onSuccess: (data) => { setAiSummary(data.data.summary); addToast("AI Summary generated!", 'success'); },
        onError: (error: any) => addToast(`Failed to generate summary: ${error.message}`, "error"),
    });

    const startSessionMutation = useMutation({
        mutationFn: async ({ mode, mcqIds }: { mode: QuizSession['mode'], mcqIds: string[] }) => {
            const sessionId = await SessionManager.createSession(mode, mcqIds);
            return { mode, sessionId };
        },
        onSuccess: ({ mode, sessionId }) => navigate(`/session/${mode}/${sessionId}`),
        onError: (error: any) => addToast(`Failed to start session: ${error.message}`, "error"),
    });

    if (!chapter || !topic || isContentLoading || areAttemptsLoading) {
        return <LoadingSkeleton count={3} />;
    }

    const chartData = {
        labels: ['Correct', 'Incorrect', 'Unattempted'],
        datasets: [{ data: [correctCount, incorrectMcqIds.length, unattemptedCount], backgroundColor: ['#10b981', '#ef4444', '#64748b'], borderColor: '#fff', borderWidth: 2, hoverBorderColor: '#fff' }],
    };

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            <div className="card-base p-6">
                <h1 className="text-3xl font-bold">{chapter.name}</h1>
                <p className="text-slate-500 mt-1">{chapter.mcqCount} MCQs | {chapter.flashcardCount} Flashcards</p>
                <div className="w-48 h-48 mx-auto my-4"><Doughnut data={chartData} options={{ responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'top' } } }} /></div>
                
                <div className="grid grid-cols-2 gap-4 mt-6">
                    <button onClick={() => startSessionMutation.mutate({ mode: 'quiz', mcqIds: chapterContent?.mcqs.map(m => m.id) || [] })} disabled={!chapterContent?.mcqs.length || startSessionMutation.isPending} className="btn-primary py-3">Start Quiz</button>
                    <button onClick={() => startSessionMutation.mutate({ mode: 'practice', mcqIds: chapterContent?.mcqs.map(m => m.id) || [] })} disabled={!chapterContent?.mcqs.length || startSessionMutation.isPending} className="btn-secondary py-3">Practice MCQs</button>
                    <button onClick={() => navigate(`/flashcards/${topic.id}/${chapter.id}`)} disabled={!chapter.flashcardCount} className="btn-secondary py-3 col-span-2">Practice Flashcards</button>
                    <button onClick={() => startSessionMutation.mutate({ mode: 'incorrect', mcqIds: incorrectMcqIds })} disabled={!incorrectMcqIds.length || startSessionMutation.isPending} className="btn-danger py-3 col-span-2">Review Mistakes ({incorrectMcqIds.length})</button>
                </div>
            </div>

            <div className="card-base p-6">
                <h2 className="text-2xl font-bold mb-4">Study Notes</h2>
                {user?.isAdmin && <Link to={`/admin/notes/edit/${topicId}/${chapterId}`} state={{ source: topic.source }} className="btn-neutral text-sm mb-4 inline-block">Edit Notes</Link>}
                <div className="prose dark:prose-invert max-w-none">
                    {chapter.summaryNotes ? <ReactMarkdown>{chapter.summaryNotes}</ReactMarkdown> : <p>No notes available for this chapter yet.</p>}
                </div>
                <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                    <h3 className="text-xl font-bold mb-2">AI Summary</h3>
                    {generateSummaryMutation.isPending ? <Loader message="Generating..." /> : aiSummary ? <ReactMarkdown className="prose dark:prose-invert max-w-none">{aiSummary}</ReactMarkdown> : 
                        <button onClick={() => chapter.originalTextRefIds && generateSummaryMutation.mutate({ uploadIds: chapter.originalTextRefIds })} className="btn-primary" disabled={!chapter.originalTextRefIds?.length}>Generate with AI</button>
                    }
                </div>
            </div>
        </div>
    );
};

export default ChapterDetailPage;