import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { getMockExamQuestions } from '@/services/aiService';
// FIX #10: Use the secure SessionManager for creating sessions.
import { SessionManager } from '@/services/sessionService';
import Loader from '@/components/Loader';
import { useToast } from '@/components/Toast';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';
import type { Topic, Chapter } from '@pediaquiz/types';

const MockExamBuilder: React.FC = () => {
    const { user } = useAuth();
    const { appData, isLoadingData } = useData();
    const navigate = useNavigate();
    const { addToast } = useToast();

    const [questionCount, setQuestionCount] = useState(100);
    const [selectedChapters, setSelectedChapters] = useState<Set<string>>(new Set());
    const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());

    const topics = useMemo(() => appData?.topics || [], [appData]);
    const availableMcqCount = useMemo(() => topics.reduce((total, topic) => total + topic.chapters.reduce((sub, chap) => selectedChapters.has(chap.id) ? sub + chap.mcqCount : sub, 0), 0), [selectedChapters, topics]);

    const mockExamMutation = useMutation({
        mutationFn: (data: { chapterIds: string[], questionCount: number }) => {
            if (!user) throw new Error("User not authenticated.");
            return getMockExamQuestions({ userId: user.uid, ...data });
        },
        onSuccess: async (response) => {
            const mcqIds = response.data.mcqIds;
            if (!mcqIds?.length) return addToast("No questions found for the selected criteria.", "info");
            // FIX #10: Create the session using the secure, backend-driven SessionManager.
            const sessionId = await SessionManager.createSession('mock', mcqIds);
            navigate(`/session/mock/${sessionId}`);
        },
        onError: (error: any) => addToast(`Failed to build exam: ${error.message}`, "error"),
    });

    const handleBuildExam = () => {
        if (questionCount > availableMcqCount) return addToast(`Only ${availableMcqCount} questions available.`, "error");
        if (selectedChapters.size === 0) return addToast("Please select at least one chapter.", "warning");
        mockExamMutation.mutate({ chapterIds: Array.from(selectedChapters), questionCount });
    };

    if (isLoadingData) return <Loader fullScreen message="Loading topics..." />;

    return (
        <div className="p-6 max-w-2xl mx-auto space-y-6">
            <h1 className="text-3xl font-bold">Build a Mock Exam</h1>
            <div className="card-base p-6 space-y-4">
                <label className="block text-sm font-medium">Number of Questions</label>
                <input type="number" min={1} max={availableMcqCount || 1} value={questionCount} onChange={(e) => setQuestionCount(Number(e.target.value))} className="input-field" />
                <p className="text-sm text-slate-500">Available questions from selection: {availableMcqCount}</p>
                <button onClick={handleBuildExam} disabled={mockExamMutation.isPending} className="btn-primary w-full py-3">{mockExamMutation.isPending ? 'Building...' : 'Build & Start Exam'}</button>
            </div>
            <div className="card-base p-6">
                <h2 className="text-xl font-bold mb-4">Select Content</h2>
                {topics.map((topic: Topic) => (
                    <div key={topic.id} className="border border-slate-200 dark:border-slate-700 rounded-lg mb-3">
                        <button onClick={() => setExpandedTopics(p => { const n = new Set(p); n.has(topic.id) ? n.delete(topic.id) : n.add(topic.id); return n; })} className="w-full flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50">
                            <span className="font-medium">{topic.name}</span><ChevronDownIcon className={clsx(`h-5 w-5`, expandedTopics.has(topic.id) && 'rotate-180')} />
                        </button>
                        {expandedTopics.has(topic.id) && (
                            <div className="p-4 border-t border-slate-200 dark:border-slate-700 max-h-60 overflow-y-auto">
                                {(topic.chapters as Chapter[]).map((chapter: Chapter) => (
                                    <label key={chapter.id} className="flex items-center gap-2 cursor-pointer p-1"><input type="checkbox" checked={selectedChapters.has(chapter.id)} onChange={() => setSelectedChapters(p => {const n=new Set(p); n.has(chapter.id)?n.delete(chapter.id):n.add(chapter.id); return n;})} className="form-checkbox h-4 w-4 rounded text-sky-600"/><span>{chapter.name} ({chapter.mcqCount})</span></label>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};
export default MockExamBuilder;