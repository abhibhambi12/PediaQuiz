// frontend/src/components/AdminUploadCard.tsx

import React, { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { httpsCallable, HttpsCallableResult } from 'firebase/functions';
import { functions } from '@/firebase';
import type { UserUpload, UploadStatus, Topic, Chapter, AssignmentSuggestion } from '@pediaquiz/types';
import { useToast } from '@/components/Toast';

// Helper to normalize topic/chapter IDs - needed for local filtering
const normalizeId = (name: string): string => {
    if (typeof name !== 'string') return 'unknown';
    return name.replace(/\s+/g, '_').toLowerCase();
};

// Marrow Pipeline Callable Functions (Current Frontend Expected)
const extractMarrowContentFn = httpsCallable<{ uploadId: string }, { mcqCount: number, explanationCount: number }>(functions, 'extractMarrowContent');
const generateAndAnalyzeMarrowContentFn = httpsCallable<{ uploadId: string, count: number }, { success: boolean, message?: string }>(functions, 'generateAndAnalyzeMarrowContent');
const approveMarrowContentFn = httpsCallable<{ uploadId: string, topicId: string, topicName: string, chapterId: string, chapterName: string, keyTopics: string[] }, { success: boolean, message?: string }>(functions, 'approveMarrowContent');

// General Pipeline Callable Functions (Advanced Batch Processing)
const suggestClassificationFn = httpsCallable<{ uploadId: string }, { success: boolean, suggestedTopic?: string, suggestedChapter?: string }>(functions, 'suggestClassification');
const prepareBatchGenerationFn = httpsCallable<{ uploadId: string, totalMcqCount: number, totalFlashcardCount: number, batchSize: number, approvedTopic: string, approvedChapter: string }, { success: boolean, totalBatches: number }>(functions, 'prepareBatchGeneration');
const startAutomatedBatchGenerationFn = httpsCallable<{ uploadId: string }, { success: boolean }>(functions, 'startAutomatedBatchGeneration');
const approveContentFn = httpsCallable<{ uploadId: string, assignments: AssignmentSuggestion[] }, { success: boolean, message?: string }>(functions, 'approveContent');
const autoAssignContentFn = httpsCallable<{ uploadId: string, existingTopics: Topic[], scopeToTopicName?: string }, { success: boolean, suggestions: AssignmentSuggestion[] }>(functions, 'autoAssignContent');


const getStatusColor = (status: UploadStatus): string => {
    if (status === 'completed') return 'text-green-500';
    if (status.startsWith('failed') || status === 'error') return 'text-red-500';
    if (status.startsWith('pending')) return 'text-amber-500 animate-pulse';
    if (status === 'archived') return 'text-slate-500';
    return 'text-sky-500 animate-pulse';
};

const AdminUploadCard: React.FC<{ upload: UserUpload, allTopics: Topic[] }> = ({ upload, allTopics }) => {
    const { addToast } = useToast();
    const queryClient = useQueryClient();
    const [isProcessing, setIsProcessing] = useState(false);
    const [isSaving, setIsSaving] = useState(false); // For final approval steps

    // Marrow Pipeline specific state
    const [marrowNumToGenerate, setMarrowNumToGenerate] = useState(10);
    const [marrowSelectedTopic, setMarrowSelectedTopic] = useState('');
    const [marrowSelectedChapter, setMarrowSelectedChapter] = useState('');
    const [marrowNewTopicName, setMarrowNewTopicName] = useState('');
    const [marrowNewChapterName, setMarrowNewChapterName] = useState('');
    const [marrowKeyTopics, setMarrowKeyTopics] = useState<string[]>(upload.suggestedKeyTopics || []);

    // General Pipeline specific state
    const [generalMcqCount, setGeneralMcqCount] = useState(upload.estimatedMcqCount || 10);
    const [generalFlashcardCount, setGeneralFlashcardCount] = useState(upload.estimatedFlashcardCount || 10);
    const [generalBatchSize, setGeneralBatchSize] = useState(50); // Default batch size
    const [generalApprovedTopic, setGeneralApprovedTopic] = useState(upload.suggestedTopic || ''); // For manual approval in General
    const [generalApprovedChapter, setGeneralApprovedChapter] = useState(upload.suggestedChapter || ''); // For manual approval in General
    const [generalAssignmentSuggestions, setGeneralAssignmentSuggestions] = useState<AssignmentSuggestion[]>(upload.assignmentSuggestions || []);

    // Populate general pipeline initial state from upload data when component mounts or upload changes
    React.useEffect(() => {
        setGeneralMcqCount(upload.estimatedMcqCount || 10);
        setGeneralFlashcardCount(upload.estimatedFlashcardCount || 10);
        setGeneralApprovedTopic(upload.suggestedTopic || '');
        setGeneralApprovedChapter(upload.suggestedChapter || '');
        setGeneralAssignmentSuggestions(upload.assignmentSuggestions || []);
    }, [upload]);


    const isMarrowUpload = upload.fileName.startsWith("MARROW_");

    // Memoized lists for dropdowns based on pipeline type
    const filteredTopicsForSelection = useMemo(() => {
        return allTopics.filter(t => isMarrowUpload ? t.source === 'Marrow' : t.source === 'General');
    }, [allTopics, isMarrowUpload]);

    const availableChaptersForMarrowTopic = useMemo(() => {
        const topic = allTopics.find(t => t.id === marrowSelectedTopic);
        return topic ? topic.chapters : [];
    }, [allTopics, marrowSelectedTopic]);

    const availableChaptersForGeneralTopic = useMemo(() => {
        // Find by normalized name, which is often used as ID
        const topic = allTopics.find(t => t.id === normalizeId(generalApprovedTopic) || t.name === generalApprovedTopic);
        return topic ? topic.chapters : [];
    }, [allTopics, generalApprovedTopic]);


    // Marrow Pipeline Mutations (triggered by Marrow UI)
    const extractMarrowMutation = useMutation<HttpsCallableResult<{ mcqCount: number; explanationCount: number; }>, Error, string>({
        mutationFn: (uploadId: string) => extractMarrowContentFn({ uploadId }),
        onSuccess: (data) => { addToast(`Extracted ${data.data.mcqCount} MCQs and ${data.data.explanationCount} explanations.`, 'success'); queryClient.invalidateQueries({ queryKey: ['pendingUploads'] }); },
        onError: (error) => addToast(`Marrow extraction failed: ${error.message}`, 'error'),
    });

    const generateAndAnalyzeMarrowMutation = useMutation<HttpsCallableResult<{ success: boolean; message?: string }>, Error, { uploadId: string, count: number }>({
        mutationFn: (vars) => generateAndAnalyzeMarrowContentFn(vars),
        onSuccess: (data) => { addToast(data.data.message || "Marrow generation and analysis complete!", 'success'); queryClient.invalidateQueries({ queryKey: ['pendingUploads'] }); },
        onError: (error) => addToast(`Marrow generation failed: ${error.message}`, 'error'),
    });

    const approveMarrowMutation = useMutation<HttpsCallableResult<{ success: boolean; message?: string }>, Error, { uploadId: string, topicId: string, topicName: string, chapterId: string, chapterName: string, keyTopics: string[] }>({
        mutationFn: (vars) => approveMarrowContentFn(vars),
        onSuccess: (data) => { addToast(data.data.message || "Marrow content approved!", 'success'); queryClient.invalidateQueries({ queryKey: ['pendingUploads'] }); queryClient.invalidateQueries({ queryKey: ['appData'] }); },
        onError: (error) => addToast(`Marrow approval failed: ${error.message}`, 'error'),
    });

    // General Pipeline Mutations (triggered by General UI)
    const suggestClassificationMutation = useMutation({
        mutationFn: (uploadId: string) => suggestClassificationFn({ uploadId }),
        onSuccess: (data) => {
            addToast("Classification suggested successfully!", "success");
            queryClient.invalidateQueries({ queryKey: ['pendingUploads'] });
            // Update local state based on AI suggestion
            if (data.data.suggestedTopic) setGeneralApprovedTopic(data.data.suggestedTopic);
            if (data.data.suggestedChapter) setGeneralApprovedChapter(data.data.suggestedChapter);
        },
        onError: (error: Error) => addToast(`Classification failed: ${error.message}`, 'error'),
    });

    const prepareBatchGenerationMutation = useMutation({
        mutationFn: (vars: { uploadId: string, totalMcqCount: number, totalFlashcardCount: number, batchSize: number, approvedTopic: string, approvedChapter: string }) => prepareBatchGenerationFn(vars),
        onSuccess: () => { addToast("Batch generation prepared. Ready to start.", "info"); queryClient.invalidateQueries({ queryKey: ['pendingUploads'] }); },
        onError: (error: Error) => addToast(`Preparation failed: ${error.message}`, 'error'),
    });

    const startAutomatedBatchGenerationMutation = useMutation({
        mutationFn: (uploadId: string) => startAutomatedBatchGenerationFn({ uploadId }),
        onSuccess: () => { addToast("Automated batch generation started!", "success"); queryClient.invalidateQueries({ queryKey: ['pendingUploads'] }); },
        onError: (error: Error) => addToast(`Generation start failed: ${error.message}`, 'error'),
    });

    const autoAssignContentMutation = useMutation({
        mutationFn: (vars: { uploadId: string, existingTopics: Topic[], scopeToTopicName?: string }) => autoAssignContentFn(vars),
        onSuccess: (data) => {
            addToast("AI auto-assignment complete!", "success");
            if (data.data.suggestions) setGeneralAssignmentSuggestions(data.data.suggestions);
            queryClient.invalidateQueries({ queryKey: ['pendingUploads'] });
        },
        onError: (error: Error) => addToast(`Auto-assignment failed: ${error.message}`, 'error'),
    });

    const approveContentMutation = useMutation({
        mutationFn: (vars: { uploadId: string, assignments: AssignmentSuggestion[] }) => approveContentFn(vars),
        onSuccess: (data) => { addToast(data.data.message || "Content approved successfully!", "success"); queryClient.invalidateQueries({ queryKey: ['pendingUploads'] }); queryClient.invalidateQueries({ queryKey: ['appData'] }); },
        onError: (error: Error) => addToast(`General content approval failed: ${error.message}`, 'error'),
    });


    // Marrow Pipeline Handlers
    const handleAddMarrowKeyTopic = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') { e.preventDefault(); const newTag = e.currentTarget.value.trim(); if (newTag && !marrowKeyTopics.includes(newTag)) setMarrowKeyTopics(prev => [...prev, newTag]); e.currentTarget.value = ''; }
    };
    const handleRemoveMarrowKeyTopic = (tagToRemove: string) => setMarrowKeyTopics(prev => prev.filter(tag => tag !== tagToRemove));

    const handleApproveMarrowContent = () => {
        const finalTopicId = selectedTopic === 'CREATE_NEW' ? newTopicName.trim().replace(/\s+/g, '_').toLowerCase() : selectedTopic;
        const finalTopicName = selectedTopic === 'CREATE_NEW' ? newTopicName.trim() : allTopics.find(t => t.id === selectedTopic)?.name || '';
        const finalChapterId = selectedChapter === 'CREATE_NEW' ? newChapterName.trim().replace(/\s+/g, '_').toLowerCase() : selectedChapter;
        const finalChapterName = selectedChapter === 'CREATE_NEW' ? newChapterName.trim() : allTopics.find(t => t.id === selectedTopic)?.chapters.find(c => c.id === selectedChapter)?.name || '';

        if (!finalTopicName || !finalChapterName) { addToast("Topic and Chapter are required.", "error"); return; }

        if (isMarrowUpload) {
            approveMarrowMutation.mutate({ uploadId: upload.id, topicId: finalTopicId, topicName: finalTopicName, chapterId: finalChapterId, chapterName: finalChapterName, keyTopics });
        } else {
            approveGeneralMutation.mutate({ uploadId: upload.id, topicId: finalTopicId, topicName: finalTopicName, chapterId: finalChapterId, chapterName: finalChapterName });
        }
    };

    // General Pipeline Handlers
    const handleApproveGeneralManually = () => {
        const finalTopic = generalApprovedTopic;
        const finalChapter = generalApprovedChapter;
        if (!upload.finalAwaitingReviewData || !finalTopic || !finalChapter) { addToast("Topic and Chapter are required for manual save.", "error"); return; }
        const manualAssignment: AssignmentSuggestion[] = [{
            topicName: finalTopic, chapterName: finalChapter, isNewChapter: !allTopics.some(t => t.id === normalizeId(finalTopic) && t.chapters.some(c => c.id === normalizeId(finalChapter))),
            mcqIndexes: upload.finalAwaitingReviewData.mcqs.map((_, idx) => idx), flashcardIndexes: upload.finalAwaitingReviewData.flashcards.map((_, idx) => idx), // Use indexes
        }];
        approveContentMutation.mutate({ uploadId: upload.id, assignments: manualAssignment });
    };

    const handleAutoAssignGeneralContent = (scopeToTopicName?: string) => {
        autoAssignContentMutation.mutate({ uploadId: upload.id, existingTopics: allTopics, scopeToTopicName });
    };

    const handleAssignmentChapterChange = (index: number, newChapterName: string) => {
        setGeneralAssignmentSuggestions(currentSuggestions => {
            const newSuggestions = [...currentSuggestions];
            newSuggestions[index].chapterName = newChapterName;
            newSuggestions[index].isNewChapter = !allTopics.some(t => t.id === normalizeId(newSuggestions[index].topicName) && t.chapters.some(c => c.id === normalizeId(newChapterName)));
            return newSuggestions;
        });
    };

    const handleFinalApproveAssignments = () => {
        if (generalAssignmentSuggestions.length === 0) { addToast("No assignments to approve.", "error"); return; }
        approveContentMutation.mutate({ uploadId: upload.id, assignments: generalAssignmentSuggestions });
    };

    // Helper for validation logic in UI
    const isMarrowTopicSelectedOrNew = marrowSelectedTopic.trim() !== '';
    const isMarrowChapterSelectedOrNew = marrowSelectedChapter.trim() !== '';
    const isMarrowNewTopicNameValid = marrowSelectedTopic !== 'CREATE_NEW' || marrowNewTopicName.trim() !== '';
    const isMarrowNewChapterNameValid = marrowSelectedChapter !== 'CREATE_NEW' || marrowNewChapterName.trim() !== '';

    const isGeneralTopicSelected = generalApprovedTopic.trim() !== '';
    const isGeneralChapterSelected = generalApprovedChapter.trim() !== '';


    const renderActions = () => {
        if (isProcessing || isApproving) return <Loader message="Processing request..." />; // Use isApproving

        if (isMarrowUpload) {
            switch (upload.status) {
                case 'processed':
                    return (<button onClick={() => extractMarrowMutation.mutate(upload.id)} disabled={isProcessing} className="btn-primary w-full">Stage 1: Extract Marrow Content</button>);
                case 'pending_generation_decision':
                case 'pending_planning': // After planning step, Marrow pipeline needs a generation decision
                case 'pending_generation': // Marrow needs explicit generation based on plan
                    const extractedMarrowMcqsCount = upload.stagedContent?.extractedMcqs?.length || 0;
                    const orphanMarrowExplanationsCount = upload.stagedContent?.orphanExplanations?.length || 0;
                    return (
                        <div className="space-y-3">
                            <h3 className="font-bold text-lg">Stage 2: Generate New MCQs</h3>
                            <p className="text-sm text-slate-700 dark:text-slate-300">Extracted: {extractedMarrowMcqsCount} MCQs, {orphanMarrowExplanationsCount} Explanations.</p>
                            {orphanMarrowExplanationsCount > 0 && (
                                <>
                                    <label className="block text-sm font-medium mb-1">New MCQs from explanations:</label>
                                    <input type="number" defaultValue={upload.suggestedPlan?.mcqCount || 0} min="0" className="input-field w-full"
                                        onChange={(e) => { /* This input is informational, actual count is from plan or manual input */ }}
                                        disabled={isGeneratingMarrowStaged}
                                    />
                                    <button onClick={() => generateAndAnalyzeMarrowMutation.mutate({ uploadId: upload.id, count: upload.suggestedPlan?.mcqCount || 0 })} disabled={isGeneratingMarrowStaged || (upload.suggestedPlan?.mcqCount || 0) < 0} className="btn-primary w-full">Generate & Analyze Topics</button>
                                </>
                            )}
                            {(orphanMarrowExplanationsCount === 0 || (upload.suggestedPlan?.mcqCount || 0) === 0) && (extractedMarrowMcqsCount > 0) && (
                                <button onClick={() => generateAndAnalyzeMarrowMutation.mutate({ uploadId: upload.id, count: 0 })} disabled={isGeneratingMarrowStaged} className="btn-primary w-full">Skip Generation & Assign</button>
                            )}
                            {extractedMarrowMcqsCount === 0 && orphanMarrowExplanationsCount === 0 && (
                                <p className="text-sm text-slate-500">No content found after extraction. Check original document or reset.</p>
                            )}
                        </div>
                    );
                case 'pending_assignment':
                    const totalMarrowContentReady = (upload.stagedContent?.extractedMcqs?.length || 0) + (upload.stagedContent?.generatedMcqs?.length || 0);
                    return (
                        <div className="space-y-4">
                            <h3 className="font-bold text-lg">Stage 3: Assign & Approve ({totalMarrowContentReady} items)</h3>
                            <div> <label className="block text-sm font-medium mb-1">Select Topic</label> <select value={marrowSelectedTopic} onChange={e => setMarrowSelectedTopic(e.target.value)} className="input-field w-full"> <option value="">Select existing...</option> {filteredTopicsForSelection.map(t => <option key={t.id} value={t.id}>{t.name}</option>)} <option value="CREATE_NEW">-- Create New --</option> </select> {marrowSelectedTopic === 'CREATE_NEW' && <input type="text" value={marrowNewTopicName} onChange={e => setNewTopicName(e.target.value)} placeholder="New topic name" className="input-field w-full mt-2" />} </div>
                            <div> <label className="block text-sm font-medium mb-1">Select Chapter</label> <select value={marrowSelectedChapter} onChange={e => setMarrowSelectedChapter(e.target.value)} className="input-field w-full" disabled={!isMarrowTopicSelectedOrNew}> <option value="">Select existing...</option> {availableChaptersForMarrowTopic.map(c => <option key={c.id} value={c.id}>{c.name}</option>)} <option value="CREATE_NEW">-- Create New --</option> </select> {marrowSelectedChapter === 'CREATE_NEW' && <input type="text" value={marrowNewChapterName} onChange={e => setNewChapterName(e.target.value)} placeholder="New chapter name" className="input-field w-full mt-2" />} </div>
                            <div className="space-y-2"> <label className="block text-sm font-medium mb-1">Key Clinical Topics (Tags)</label> <div className="flex flex-wrap gap-2 p-2 border rounded-md dark:border-slate-600 bg-slate-50 dark:bg-slate-700"> {job.suggestedKeyTopics?.map(tag => (<span key={tag} className="flex items-center px-2 py-1 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300 text-sm">{tag}<button onClick={() => setMarrowKeyTopics(prev => prev.filter(t => t !== tag))} className="ml-1 text-sky-500 hover:text-sky-700">×</button></span>))} <input type="text" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const newTag = e.currentTarget.value.trim(); if (newTag && !marrowKeyTopics.includes(newTag)) setMarrowKeyTopics(prev => [...prev, newTag]); e.currentTarget.value = ''; } }} placeholder="Add new tag (Enter)" className="flex-grow min-w-[100px] bg-transparent outline-none text-slate-800 dark:text-slate-200" /> </div> <p className="text-xs text-slate-500">AI Suggestions: {job.suggestedKeyTopics?.join(', ') || 'None'}</p> </div>
                            <button onClick={() => onApproveContent(job, { topicName: marrowSelectedTopic, chapterName: marrowSelectedChapter, isNewChapter: marrowSelectedTopic === 'CREATE_NEW' || marrowSelectedChapter === 'CREATE_NEW', mcqIndexes: Array.from(Array(totalMarrowContentReady).keys()), flashcardIndexes: [] })} disabled={!isMarrowTopicSelectedOrNew || !isMarrowChapterSelectedOrNew || !isMarrowNewTopicNameValid || !isMarrowNewChapterNameValid || isApprovingContent} className="btn-success w-full">Approve & Save Content</button>
                        </div>
                    );
            }
        }
        // Actions for General Pipeline
        else if (isGeneralJob(job)) {
            switch (job.status) {
                case 'processed':
                    return (
                        <ActionButton onClick={() => onPlan(job)} disabled={isPlanning} className="bg-amber-600 hover:bg-amber-700">
                            Step 1: Plan Content (Estimate MCQs/Flashcards)
                        </ActionButton>
                    );
                case 'pending_planning':
                    // This state exists if planning is done, but actual counts are awaiting approval
                    return (
                        <div className="space-y-4">
                            <h3 className="font-bold text-lg">Step 2: Approve Plan & Prepare Generation</h3>
                            <p className="text-sm text-neutral-500">AI Suggested: {job.suggestedPlan?.mcqCount} MCQs, {job.suggestedPlan?.flashcardCount} Flashcards</p>
                            {/* In a real app, admin could adjust counts here before preparing batches */}
                            <ActionButton onClick={() => onExecuteGeneration(job)} disabled={isExecuting} className="bg-sky-600 hover:bg-sky-700">
                                Start Automated Generation ({job.suggestedPlan?.mcqCount} MCQs, {job.suggestedPlan?.flashcardCount} Fcards)
                            </ActionButton>
                        </div>
                    );
                case 'generating_content':
                case 'generation_failed_partially':
                    const progress = (((generalJobData?.completedBatches || 0) / (generalJobData?.totalBatches || 1)) * 100).toFixed(0);
                    return (<Loader message={`Generating batch ${(generalJobData?.completedBatches || 0) + 1} of ${generalJobData?.totalBatches || 0}... (${progress}%)`} />);
                case 'pending_assignment':
                    // This is the state after automated batch generation or re-assignment
                    return (
                        <div className="space-y-3">
                            <h4 className="font-bold text-md">Assignment Suggestions</h4>
                            {generalJobData?.assignmentSuggestions && generalJobData.assignmentSuggestions.length > 0 ? generalJobData.assignmentSuggestions.map((suggestion, index) => (
                                <div key={index} className="p-3 bg-slate-100 dark:bg-slate-700 rounded-lg flex justify-between items-center">
                                    <div>
                                        <p><span className="font-semibold">Topic:</span> {suggestion.topicName}</p>
                                        <p><span className="font-semibold">Chapter:</span> {suggestion.chapterName} {suggestion.isNewChapter && <span className="text-xs text-green-500">(New)</span>}</p>
                                        <p className="text-xs text-slate-500">({suggestion.mcqIndexes?.length || 0} Q, {suggestion.flashcardIndexes?.length || 0} F)</p>
                                    </div>
                                    <ActionButton onClick={() => onApproveContent(job, suggestion)} disabled={isApprovingContent} className="bg-green-600 hover:bg-green-700">
                                        {isApprovingContent ? 'Approving...' : `Approve`}
                                    </ActionButton>
                                </div>
                            )) : (
                                <ActionButton onClick={() => onSuggestAssignment(job)} disabled={isSuggestingAssignment} className="bg-purple-600 hover:bg-purple-700">
                                    {isSuggestingAssignment ? 'Thinking...' : <><LightBulbIcon className="inline h-4 w-4 mr-1" /> Suggest Assignment</>}
                                </ActionButton>
                            )}
                        </div>
                    );
            }
        }

        // Default/Fallback actions
        return (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                <p className="text-slate-500 text-sm">No action required at this stage.</p>
            </div>
        );
    };

    return (
        <div className="card-base p-4 space-y-3">
            <div className="flex justify-between items-start">
                <div>
                    <h3 className="font-bold text-lg break-all">{generalJobData?.title || job.fileName}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        {job.pipeline.toUpperCase()} Pipeline | Created {timeAgo}
                    </p>
                </div>
                <div className={clsx("text-xs font-bold text-white px-2 py-1 rounded-full", color)}>
                    {text}
                </div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg text-sm text-slate-600 dark:text-slate-300">
                <p className="font-semibold">Next Step:</p>
                <p>{description}</p>
                {job.error && <p className="text-red-500 font-semibold mt-2">Error: {job.error}</p>}
            </div>

            {renderActions()}

            {/* Always available Reset/Archive at the very bottom, regardless of renderActions output */}
            {(job.status !== 'completed' && job.status !== 'archived') && (
                <div className="flex justify-end space-x-2 pt-2 border-t border-slate-200 dark:border-slate-700 mt-4">
                    <ActionButton onClick={() => onReset(job.id)} disabled={isResetting} className="bg-slate-600 hover:bg-slate-700">
                        {isResetting ? 'Resetting...' : 'Reset'}
                    </ActionButton>
                    <ActionButton onClick={() => onArchive(job.id)} disabled={isArchiving} className="bg-red-600 hover:bg-red-700">
                        {isArchiving ? 'Archiving...' : 'Archive'}
                    </ActionButton>
                </div>
            )}
        </div>
    );
};

export default GenerationJobCard;