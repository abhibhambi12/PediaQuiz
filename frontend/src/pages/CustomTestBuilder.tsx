import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useData } from '@/contexts/DataContext';
import { createCustomTest } from '@/services/apiService';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import Loader from '@/components/Loader';
import { useToast } from '@/components/Toast';
import type { Chapter, Topic, CreateCustomTestCallableData } from '@pediaquiz/types';
import clsx from 'clsx';

const CustomTestBuilder: React.FC = () => {
    const { appData, isLoadingData } = useData();
    const navigate = useNavigate();
    const { addToast } = useToast();

    const [selectedChapters, setSelectedChapters] = useState<Set<string>>(new Set());
    const [questionCount, setQuestionCount] = useState<number>(20);
    const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
    const [testTitle, setTestTitle] = useState('');

    const topics = useMemo(() => appData?.topics || [], [appData]);
    const availableMcqCount = useMemo(() => {
        return topics.reduce((total, topic) => {
            if (Array.isArray(topic.chapters)) {
                return total + topic.chapters.reduce((sub, chap) => selectedChapters.has(chap.id) ? sub + chap.mcqCount : sub, 0);
            }
            return total;
        }, 0);
    }, [selectedChapters, topics]);

    const createTestMutation = useMutation({
        mutationFn: (data: CreateCustomTestCallableData) => createCustomTest(data),
        onSuccess: (response) => {
            addToast("Custom test created!", "success");
            navigate(`/session/custom/${response.data.sessionId}`);
        },
        onError: (error: any) => addToast(`Failed to create test: ${error.message}`, "error"),
    });

    const handleChapterToggle = useCallback((chapterId: string) => {
        setSelectedChapters(prev => { const newSet = new Set(prev); newSet.has(chapterId) ? newSet.delete(chapterId) : newSet.add(chapterId); return newSet; });
    }, []);

    const handleStartTest = () => {
        if (!testTitle.trim()) return addToast("Please provide a title.", "error");
        if (selectedChapters.size === 0) return addToast("Please select at least one chapter.", "error");
        if (questionCount > availableMcqCount) return addToast(`Only ${availableMcqCount} questions available.`, "error");
        createTestMutation.mutate({ title: testTitle, questions: Array.from(selectedChapters), questionCount });
    };

    if (isLoadingData) return <Loader fullScreen message="Loading test builder..." />;

    return (
        <div className="space-y-6 max-w-2xl mx-auto">
            <h1 className="text-3xl font-bold">Custom Test Builder</h1>
            <div className="card-base p-6 space-y-4">
                <label>Test Title<input type="text" value={testTitle} onChange={(e) => setTestTitle(e.target.value)} className="input-field mt-1" required /></label>
                <label>Number of Questions<input type="number" min={1} max={availableMcqCount || 1} value={questionCount} onChange={(e) => setQuestionCount(Number(e.target.value))} className="input-field mt-1" /></label>
                <p className="text-sm text-slate-500">Available from selection: {availableMcqCount}</p>
                <button onClick={handleStartTest} disabled={createTestMutation.isPending} className="btn-success w-full py-3">{createTestMutation.isPending ? 'Creating...' : 'Start Test'}</button>
            </div>
            <div className="card-base p-6">
                <h2 className="text-xl font-bold mb-4">Select Content</h2>
                {topics.map((topic: Topic) => (
                    <div key={topic.id} className="border border-slate-200 dark:border-slate-700 rounded-lg mb-3">
                        <button onClick={() => setExpandedTopics(p => { const n = new Set(p); n.has(topic.id) ? n.delete(topic.id) : n.add(topic.id); return n; })} className="w-full flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50">
                            <span className="font-medium">{topic.name}</span><ChevronDownIcon className={clsx(`h-5 w-5`, expandedTopics.has(topic.id) && 'rotate-180')} />
                        </button>
                        {expandedTopics.has(topic.id) && (
                            <div className="p-4 border-t border-slate-200 dark:border-slate-700">
                                {Array.isArray(topic.chapters) && topic.chapters.map((chapter: Chapter) => (
                                    <label key={chapter.id} className="flex items-center gap-2 cursor-pointer p-1"><input type="checkbox" checked={selectedChapters.has(chapter.id)} onChange={() => handleChapterToggle(chapter.id)} className="form-checkbox h-5 w-5 text-sky-600 rounded" /><span>{chapter.name} ({chapter.mcqCount})</span></label>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};
export default CustomTestBuilder;