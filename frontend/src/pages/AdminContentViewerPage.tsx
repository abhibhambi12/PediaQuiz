// frontend/src/pages/AdminContentViewerPage.tsx
import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getUserUploads, approveContent } from '@/services/apiService';
import { suggestClassification } from '@/services/aiService';
import { useData } from '@/contexts/DataContext';
import Loader from '@/components/Loader';
import { useToast } from '@/components/Toast';
import type { AssignmentSuggestion, Chapter, MCQ, Flashcard, ContentGenerationJob } from '@pediaquiz/types';
import { SparklesIcon } from '@heroicons/react/24/solid';

const AdminContentViewerPage: React.FC = () => {
    const { jobId } = useParams<{ jobId: string }>();
    const navigate = useNavigate();
    const { addToast } = useToast();
    const queryClient = useQueryClient();
    const { appData } = useData();

    const [selectedTopic, setSelectedTopic] = useState('');
    const [selectedChapter, setSelectedChapter] = useState('');
    const [newChapterName, setNewChapterName] = useState('');

    const { data: jobData, isLoading: isLoadingJob } = useQuery({
        queryKey: ['generatedContentJob', jobId],
        queryFn: async () => {
            if (!jobId) return null;
            const res = await getUserUploads({ uploadIds: [jobId] });
            return res.data.uploads[0] as ContentGenerationJob;
        },
        enabled: !!jobId,
        refetchInterval: (query) => {
            const status = query.state.data?.status;
            return status === 'generating_content' || status === 'pending_marrow_extraction' || status === 'pending_marrow_analysis' 
                ? 5000 
                : false;
        },
    });

    const content = useMemo(() => {
        const reviewData = jobData?.finalAwaitingReviewData;
        const mcqs = (reviewData && Array.isArray(reviewData.mcqs)) ? reviewData.mcqs : [];
        const flashcards = (reviewData && Array.isArray(reviewData.flashcards)) ? reviewData.flashcards : [];
        return { mcqs, flashcards };
    }, [jobData]);
    
    const topicsList = useMemo(() => appData?.topics || [], [appData]);
    const chaptersForSelectedTopic = useMemo(() => {
        const topic = topicsList.find(t => t.name === selectedTopic);
        return (topic?.chapters as Chapter[]) || [];
    }, [selectedTopic, topicsList]);

    const approveMutation = useMutation({
        mutationFn: approveContent,
        onSuccess: async () => {
            addToast('Content approved and saved!', 'success');
            await queryClient.invalidateQueries({ queryKey: ['adminReviewJobs'] });
            await queryClient.invalidateQueries({ queryKey: ['appData'] });
            navigate('/admin/review');
        },
        onError: (error: any) => addToast(`Approval failed: ${error.message}`, 'error'),
    });

    const suggestClassificationMutation = useMutation({
        mutationFn: () => {
            const contentText = [...content.mcqs, ...content.flashcards]
                .map(item => (item as Partial<MCQ>).question || (item as Partial<Flashcard>).front)
                .join('\n');
            const topicNames = topicsList.map(t => t.name);
            return suggestClassification({ contentText, topicsList: topicNames });
        },
        onSuccess: (response) => {
            const { suggestedTopic, suggestedChapter } = response.data;
            if (suggestedTopic && topicsList.some(t => t.name === suggestedTopic)) {
                setSelectedTopic(suggestedTopic);
                
                const topic = topicsList.find(t => t.name === suggestedTopic);
                const chapterExists = topic?.chapters.some(c => c.name === suggestedChapter);
                if (suggestedChapter && chapterExists) {
                    setSelectedChapter(suggestedChapter);
                    setNewChapterName('');
                } else if (suggestedChapter) {
                    setSelectedChapter('__new__');
                    setNewChapterName(suggestedChapter);
                }
                addToast('AI has suggested a classification!', 'info');
            } else {
                addToast('AI could not find a matching topic.', 'warning');
            }
        },
        onError: (error: any) => addToast(`AI suggestion failed: ${error.message}`, 'error'),
    });

    const handleApprove = () => {
        if (!jobId || !selectedTopic) { return addToast('A Topic must be selected.', 'warning'); }
        const isNewChapter = selectedChapter === '__new__';
        if (!selectedChapter || (isNewChapter && !newChapterName.trim())) { return addToast('A Chapter must be selected or a new one named.', 'warning'); }

        const chapterName = isNewChapter ? newChapterName.trim() : selectedChapter;
        
        const assignments: AssignmentSuggestion[] = [{
            topicName: selectedTopic,
            chapterName,
            isNewChapter,
            mcqs: content.mcqs,
            flashcards: content.flashcards,
        }];

        approveMutation.mutate({ uploadId: jobId, assignments });
    };

    if (isLoadingJob) return <Loader fullScreen message="Loading generated content..." />;
    
    const isProcessing = ['generating_content', 'pending_marrow_extraction', 'pending_marrow_analysis'].includes(jobData?.status || '');
    if (isProcessing) {
        return (
            <div className="card-base text-center p-8 max-w-lg mx-auto">
                <h1 className="text-2xl font-bold">Processing Content...</h1>
                <Loader message="The AI is working. This page will automatically refresh when it's done." />
                <p className="text-sm text-slate-500 mt-4">(This can take several minutes)</p>
            </div>
        );
    }
    
    if (!jobData || jobData.status === 'error' || !jobData.finalAwaitingReviewData) {
        return (
             <div className="card-base text-center p-8 max-w-lg mx-auto">
                <h1 className="text-2xl font-bold text-red-500">Generation Failed or Pending</h1>
                <p className="mt-4 text-slate-500">There was an error, or the content is not yet ready for review. Please check the job status in the admin queue.</p>
                <p className="text-xs mt-2 text-slate-400">Status: {jobData?.status || 'Unknown'}. Error: {jobData?.errors?.slice(-1)[0] || 'None'}</p>
                <button onClick={() => navigate('/admin/review')} className="btn-primary mt-6">Back to Review Queue</button>
            </div>
        )
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <h1 className="text-3xl font-bold">Review & Assign Content</h1>
            <div className="card-base p-6 space-y-4 sticky top-20 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md z-10">
                <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-bold">Assign to Chapter</h2>
                    <button onClick={() => suggestClassificationMutation.mutate()} disabled={suggestClassificationMutation.isPending} className="btn-secondary text-sm flex items-center gap-2">
                        <SparklesIcon className="h-5 w-5" />
                        {suggestClassificationMutation.isPending ? 'Analyzing...' : 'AI Suggest'}
                    </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium">Topic</label>
                        <select value={selectedTopic} onChange={e => setSelectedTopic(e.target.value)} className="input-field mt-1">
                            <option value="">Select a Topic...</option>
                            {topicsList.map(topic => <option key={topic.id} value={topic.name}>{topic.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium">Chapter</label>
                        <select value={selectedChapter} onChange={e => setSelectedChapter(e.target.value)} className="input-field mt-1" disabled={!selectedTopic}>
                            <option value="">Select a Chapter...</option>
                            {chaptersForSelectedTopic.map(chapter => <option key={chapter.id} value={chapter.name}>{chapter.name}</option>)}
                            <option value="__new__">-- Create New Chapter --</option>
                        </select>
                    </div>
                </div>
                {selectedChapter === '__new__' && (
                     <div>
                        <label className="block text-sm font-medium">New Chapter Name</label>
                        <input type="text" value={newChapterName} onChange={e => setNewChapterName(e.target.value)} placeholder="Enter name for the new chapter" className="input-field mt-1" />
                    </div>
                )}
                <button onClick={handleApprove} disabled={approveMutation.isPending} className="btn-success w-full py-3">
                    {approveMutation.isPending ? 'Saving...' : `✅ Approve & Save All (${content.mcqs.length + content.flashcards.length} items)`}
                </button>
            </div>

            <div className="space-y-4">
                <h2 className="text-2xl font-bold">Generated MCQs ({content.mcqs.length})</h2>
                {content.mcqs.map((mcq, index) => (
                    <div key={index} className="card-base p-4">
                        <p className="font-semibold">Q: {mcq.question}</p>
                        {/* FINAL FIX: Add a check to ensure mcq.options is an array before mapping */}
                        {Array.isArray(mcq.options) && (
                            <ul className="list-disc pl-6 mt-2 text-sm space-y-1">
                                {mcq.options.map((opt, i) => <li key={i}>{opt}</li>)}
                            </ul>
                        )}
                        <p className="text-sm mt-2"><strong>Answer:</strong> {mcq.answer}</p>
                    </div>
                ))}

                <h2 className="text-2xl font-bold mt-8">Generated Flashcards ({content.flashcards.length})</h2>
                {content.flashcards.map((fc, index) => (
                    <div key={index} className="card-base p-4">
                        <p><strong>Front:</strong> {fc.front}</p>
                        <p><strong>Back:</strong> {fc.back}</p>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default AdminContentViewerPage;