// frontend/src/components/AdminUploadCard.tsx
import React, { useState, useMemo, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { httpsCallable, HttpsCallableResult } from 'firebase/functions';
import { functions } from '@/firebase';
import type { UserUpload, UploadStatus, Topic, Chapter, AssignmentSuggestion, ContentGenerationJob as FullContentGenerationJob, MCQ, Flashcard } from '@pediaquiz/types';
import { useToast } from '@/components/Toast';
import clsx from 'clsx';
import Loader from './Loader';
import { LightBulbIcon } from '@heroicons/react/24/outline'; // Assuming this icon is available

// Renamed from UserUpload to ContentGenerationJob as per backend
type ContentGenerationJob = FullContentGenerationJob;

// Helper to normalize topic/chapter IDs for consistency with Firestore document IDs
const normalizeId = (name: string): string => {
    if (typeof name !== 'string') return 'unknown';
    return name.replace(/\s+/g, '_').toLowerCase().replace(/[^a-z0-9_]/g, '');
};

// Callable Functions (aligned with backend `functions/src/index.ts`)
const extractMarrowContentFn = httpsCallable<{ uploadId: string }, { success: boolean, mcqCount: number, explanationCount: number }>(functions, 'extractMarrowContent');
const generateAndAnalyzeMarrowContentFn = httpsCallable<{ uploadId: string, count: number }, { success: boolean, message?: string }>(functions, 'generateAndAnalyzeMarrowContent');
const approveMarrowContentFn = httpsCallable<{ uploadId: string, topicId: string, topicName: string, chapterId: string, chapterName: string, keyTopics: string[] }, { success: boolean, message?: string }>(functions, 'approveMarrowContent');

const planContentGenerationFn = httpsCallable<{ jobId: string }, { success: boolean, message?: string, plan: { mcqCount: number, flashcardCount: number } }>(functions, 'planContentGeneration');
const startAutomatedBatchGenerationFn = httpsCallable<{ jobId: string }, { success: boolean }>(functions, 'startAutomatedBatchGeneration');
const suggestAssignmentFn = httpsCallable<{ jobId: string, existingTopics: Topic[], scopeToTopicName?: string }, { success: boolean, suggestions: AssignmentSuggestion[] }>(functions, 'suggestAssignment');
const approveContentFn = httpsCallable<{ jobId: string, assignment: AssignmentSuggestion }, { success: boolean, message?: string }>(functions, 'approveContent'); // Note: backend `approveGeneratedContent` renamed to `approveContent`

const resetUploadFn = httpsCallable<{ uploadId: string }, { success: boolean, message: string }>(functions, 'resetUpload');
const archiveUploadFn = httpsCallable<{ uploadId: string }, { success: boolean, message: string }>(functions, 'archiveUpload');
const reassignContentFn = httpsCallable<{ jobId: string }, { success: boolean, message: string }>(functions, 'reassignContent');
const prepareForRegenerationFn = httpsCallable<{ jobId: string }, { success: boolean, message: string }>(functions, 'prepareForRegeneration');


const getStatusInfo = (status: UploadStatus): { text: string, color: string, description: string } => {
    switch (status) {
        case 'pending_ocr': return { text: 'OCR Pending', color: 'bg-amber-500', description: 'Waiting for text extraction from the uploaded file.' };
        case 'processed': return { text: 'Ready for Planning', color: 'bg-sky-500', description: 'OCR complete. Ready for AI to plan content generation.' };
        case 'pending_planning': return { text: 'Planning Content', color: 'bg-indigo-500', description: 'AI is analyzing text and suggesting content counts.' };
        case 'pending_generation_decision': return { text: 'Generation Decision', color: 'bg-purple-500', description: 'Marrow: Ready to generate new MCQs from explanations.' };
        case 'pending_generation': return { text: 'Ready to Generate', color: 'bg-sky-500', description: 'AI has a plan. Ready to start generating content in batches.' };
        case 'generating_content': return { text: 'Generating Content', color: 'bg-blue-500 animate-pulse', description: 'AI is actively generating MCQs and Flashcards in batches.' };
        case 'generation_failed_partially': return { text: 'Partial Failure', color: 'bg-red-500', description: 'Content generation partially failed. Check logs.' };
        case 'pending_assignment': return { text: 'Pending Assignment', color: 'bg-teal-500', description: 'Content generated. Awaiting classification and approval.' };
        case 'completed': return { text: 'Completed', color: 'bg-green-500', description: 'Content successfully approved and added to library.' };
        case 'error': return { text: 'Error', color: 'bg-red-700', description: 'An error occurred during processing. See details below.' };
        case 'archived': return { text: 'Archived', color: 'bg-gray-500', description: 'This job has been archived.' };
        default: return { text: 'Unknown', color: 'bg-slate-400', description: 'Unknown status.' };
    }
};

const AdminUploadCard: React.FC<{ job: ContentGenerationJob, allTopics: Topic[] }> = ({ job, allTopics }) => {
    const { addToast } = useToast();
    const queryClient = useQueryClient();

    // State for Marrow Pipeline (if different steps need explicit admin input)
    const [marrowSelectedTopic, setMarrowSelectedTopic] = useState(job.suggestedTopic || '');
    const [marrowSelectedChapter, setMarrowSelectedChapter] = useState(job.suggestedChapter || '');
    const [marrowNewTopicName, setMarrowNewTopicName] = useState('');
    const [marrowNewChapterName, setMarrowNewChapterName] = useState('');
    const [marrowNumToGenerate, setMarrowNumToGenerate] = useState(job.suggestedPlan?.mcqCount || job.stagedContent?.orphanExplanations?.length || 0);
    const [marrowKeyTopics, setMarrowKeyTopics] = useState<string[]>(job.suggestedKeyTopics || []);

    // State for General Pipeline (if different steps need explicit admin input)
    const [generalAssignmentSuggestions, setGeneralAssignmentSuggestions] = useState<AssignmentSuggestion[]>(job.assignmentSuggestions || []);

    useEffect(() => {
        if (job.suggestedTopic) setMarrowSelectedTopic(job.suggestedTopic);
        if (job.suggestedChapter) setMarrowSelectedChapter(job.suggestedChapter);
        if (job.suggestedKeyTopics) setMarrowKeyTopics(job.suggestedKeyTopics);
        if (job.suggestedPlan?.mcqCount) setMarrowNumToGenerate(job.suggestedPlan.mcqCount);
        if (job.assignmentSuggestions) setGeneralAssignmentSuggestions(job.assignmentSuggestions);
    }, [job]);

    const isMarrowPipeline = job.pipeline === 'marrow';

    // Memoized topic and chapter lists for dropdowns
    const filteredTopicsForSelection = useMemo(() => {
        return allTopics.filter(t => isMarrowPipeline ? t.source === 'Marrow' : t.source === 'General');
    }, [allTopics, isMarrowPipeline]);

    const getChaptersForTopic = useCallback((selectedTopicId: string, source: 'General' | 'Marrow') => {
        const topic = allTopics.find(t => t.id === selectedTopicId);
        if (!topic) return [];
        if (source === 'General') {
            // General topics have string array for chapters
            return (topic.chapters as any[]).map((name: string) => ({ id: normalizeId(name), name: name }));
        } else {
            // Marrow topics have object array for chapters
            return topic.chapters;
        }
    }, [allTopics]);

    // Mutations for Admin Actions
    const invalidateAndToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
        addToast(message, type);
        queryClient.invalidateQueries({ queryKey: ['pendingUploads'] });
        queryClient.invalidateQueries({ queryKey: ['completedUploads'] });
        queryClient.invalidateQueries({ queryKey: ['allTopics'] }); // Refresh topics on approval/reset
    };

    const extractMarrowMutation = useMutation({
        mutationFn: (uploadId: string) => extractMarrowContentFn({ uploadId }),
        onSuccess: (data) => invalidateAndToast(`Extracted ${data.data.mcqCount} MCQs and ${data.data.explanationCount} explanations.`, 'success'),
        onError: (error: any) => invalidateAndToast(`Marrow extraction failed: ${error.message}`, 'error'),
    });

    const generateAndAnalyzeMarrowMutation = useMutation({
        mutationFn: (vars: { uploadId: string, count: number }) => generateAndAnalyzeMarrowContentFn(vars),
        onSuccess: (data) => invalidateAndToast(data.data.message || "Marrow generation and analysis complete!", 'success'),
        onError: (error: any) => invalidateAndToast(`Marrow generation failed: ${error.message}`, 'error'),
    });

    const approveMarrowMutation = useMutation({
        mutationFn: (vars: { uploadId: string, topicId: string, topicName: string, chapterId: string, chapterName: string, keyTopics: string[] }) => approveMarrowContentFn(vars),
        onSuccess: (data) => invalidateAndToast(data.data.message || "Marrow content approved!", 'success'),
        onError: (error: any) => invalidateAndToast(`Marrow approval failed: ${error.message}`, 'error'),
    });

    const planContentMutation = useMutation({
        mutationFn: (jobId: string) => planContentGenerationFn({ jobId }),
        onSuccess: (data) => invalidateAndToast(data.data.message || "Content plan created!", "success"),
        onError: (error: any) => invalidateAndToast(`Content planning failed: ${error.message}`, 'error'),
    });

    const startAutomatedBatchGenerationMutation = useMutation({
        mutationFn: (jobId: string) => startAutomatedBatchGenerationFn({ jobId }),
        onSuccess: () => invalidateAndToast("Automated batch generation started!", "success"),
        onError: (error: any) => invalidateAndToast(`Generation start failed: ${error.message}`, 'error'),
    });

    const suggestAssignmentMutation = useMutation({
        mutationFn: (vars: { jobId: string, existingTopics: Topic[], scopeToTopicName?: string }) => suggestAssignmentFn(vars),
        onSuccess: (data) => {
            invalidateAndToast("AI auto-assignment complete!", "success");
            if (data.data.suggestions) setGeneralAssignmentSuggestions(data.data.suggestions);
        },
        onError: (error: any) => invalidateAndToast(`Auto-assignment failed: ${error.message}`, 'error'),
    });

    const approveContentMutation = useMutation({
        mutationFn: (vars: { jobId: string, assignment: AssignmentSuggestion }) => approveContentFn(vars),
        onSuccess: (data) => invalidateAndToast(data.data.message || "Content approved successfully!", "success"),
        onError: (error: any) => invalidateAndToast(`General content approval failed: ${error.message}`, 'error'),
    });

    const resetUploadMutation = useMutation({
        mutationFn: (uploadId: string) => resetUploadFn({ uploadId }),
        onSuccess: (data) => invalidateAndToast(data.data.message, 'info'),
        onError: (error: any) => invalidateAndToast(`Reset failed: ${error.message}`, 'error'),
    });

    const archiveUploadMutation = useMutation({
        mutationFn: (uploadId: string) => archiveUploadFn({ uploadId }),
        onSuccess: (data) => invalidateAndToast(data.data.message, 'info'),
        onError: (error: any) => invalidateAndToast(`Archive failed: ${error.message}`, 'error'),
    });

    const reassignContentMutation = useMutation({
        mutationFn: (jobId: string) => reassignContentFn({ jobId }),
        onSuccess: (data) => invalidateAndToast(data.data.message, 'info'),
        onError: (error: any) => invalidateAndToast(`Reassignment failed: ${error.message}`, 'error'),
    });

    const prepareForRegenerationMutation = useMutation({
        mutationFn: (jobId: string) => prepareForRegenerationFn({ jobId }),
        onSuccess: (data) => invalidateAndToast(data.data.message, 'info'),
        onError: (error: any) => invalidateAndToast(`Preparation for regeneration failed: ${error.message}`, 'error'),
    });

    // Determine current processing status for loaders
    const isProcessing = extractMarrowMutation.isPending || generateAndAnalyzeMarrowMutation.isPending ||
        approveMarrowMutation.isPending || planContentMutation.isPending ||
        startAutomatedBatchGenerationMutation.isPending || suggestAssignmentMutation.isPending ||
        approveContentMutation.isPending || resetUploadMutation.isPending ||
        archiveUploadMutation.isPending || reassignContentMutation.isPending ||
        prepareForRegenerationMutation.isPending;

    const { text: statusText, color: statusColor, description: statusDescription } = getStatusInfo(job.status);

    const timeAgo = new Date(job.createdAt).toLocaleString(); // Simple date format

    // Marrow Pipeline specific state and handlers
    const handleAddMarrowKeyTopic = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const newTag = e.currentTarget.value.trim();
            if (newTag && !marrowKeyTopics.includes(newTag)) {
                setMarrowKeyTopics(prev => [...prev, newTag]);
            }
            e.currentTarget.value = '';
        }
    };
    const handleRemoveMarrowKeyTopic = (tagToRemove: string) => {
        setMarrowKeyTopics(prev => prev.filter(tag => tag !== tagToRemove));
    };

    const handleApproveMarrowContent = () => {
        const finalTopicId = marrowSelectedTopic === 'CREATE_NEW' ? normalizeId(marrowNewTopicName) : marrowSelectedTopic;
        const finalTopicName = marrowSelectedTopic === 'CREATE_NEW' ? marrowNewTopicName.trim() : filteredTopicsForSelection.find(t => t.id === marrowSelectedTopic)?.name || '';
        const finalChapterId = marrowSelectedChapter === 'CREATE_NEW' ? normalizeId(marrowNewChapterName) : marrowSelectedChapter;
        const finalChapterName = marrowSelectedChapter === 'CREATE_NEW' ? marrowNewChapterName.trim() : getChaptersForTopic(marrowSelectedTopic, 'Marrow').find(c => c.id === marrowSelectedChapter)?.name || '';

        if (!finalTopicName || !finalChapterName || !finalTopicId || !finalChapterId) {
            addToast("Topic and Chapter are required.", "error");
            return;
        }
        approveMarrowMutation.mutate({ uploadId: job.id, topicId: finalTopicId, topicName: finalTopicName, chapterId: finalChapterId, chapterName: finalChapterName, keyTopics: marrowKeyTopics });
    };

    // General Pipeline specific handlers
    const handleApproveGeneralAssignment = (assignment: AssignmentSuggestion) => {
        approveContentMutation.mutate({ jobId: job.id, assignment });
    };

    const renderActions = () => {
        if (isProcessing) return <Loader message="Processing request..." />;

        if (isMarrowPipeline) {
            switch (job.status) {
                case 'pending_ocr': return <p className="text-slate-500 text-sm">Waiting for OCR to complete.</p>;
                case 'pending_planning': // After OCR, Marrow is ready for extraction
                    return (
                        <button onClick={() => extractMarrowMutation.mutate(job.id)} disabled={extractMarrowMutation.isPending} className="btn-primary w-full">
                            Stage 1: Extract Marrow Content
                        </button>
                    );
                case 'pending_generation_decision':
                    const extractedMcqCount = job.stagedContent?.extractedMcqs?.length || 0;
                    const orphanExplanationsCount = job.stagedContent?.orphanExplanations?.length || 0;
                    return (
                        <div className="space-y-3">
                            <h3 className="font-bold text-lg">Stage 2: Generate New MCQs</h3>
                            <p className="text-sm text-slate-700 dark:text-slate-300">
                                Extracted: {extractedMcqCount} MCQs, {orphanExplanationsCount} Explanations.
                            </p>
                            {orphanExplanationsCount > 0 && (
                                <>
                                    <label htmlFor="marrow-generate-count" className="block text-sm font-medium mb-1">New MCQs from explanations:</label>
                                    <input
                                        id="marrow-generate-count"
                                        type="number"
                                        value={marrowNumToGenerate}
                                        onChange={(e) => setMarrowNumToGenerate(parseInt(e.target.value))}
                                        min="0"
                                        className="input-field w-full"
                                    />
                                    <button onClick={() => generateAndAnalyzeMarrowMutation.mutate({ uploadId: job.id, count: marrowNumToGenerate })} disabled={generateAndAnalyzeMarrowMutation.isPending || marrowNumToGenerate < 0} className="btn-primary w-full">
                                        Generate & Analyze Topics
                                    </button>
                                </>
                            )}
                            {(orphanExplanationsCount === 0 || marrowNumToGenerate === 0) && (extractedMcqCount > 0) && (
                                <button onClick={() => generateAndAnalyzeMarrowMutation.mutate({ uploadId: job.id, count: 0 })} disabled={generateAndAnalyzeMarrowMutation.isPending} className="btn-primary w-full">
                                    Skip Generation & Assign Existing
                                </button>
                            )}
                            {extractedMcqCount === 0 && orphanExplanationsCount === 0 && (
                                <p className="text-sm text-slate-500">No content found after extraction. Check original document or reset.</p>
                            )}
                        </div>
                    );
                case 'pending_assignment':
                    const totalMarrowContentReady = (job.stagedContent?.extractedMcqs?.length || 0) + (job.stagedContent?.generatedMcqs?.length || 0);
                    const canMarrowApprove = marrowSelectedTopic && marrowSelectedChapter &&
                        (marrowSelectedTopic !== 'CREATE_NEW' || marrowNewTopicName.trim()) &&
                        (marrowSelectedChapter !== 'CREATE_NEW' || marrowNewChapterName.trim());

                    return (
                        <div className="space-y-4">
                            <h3 className="font-bold text-lg">Stage 3: Assign & Approve ({totalMarrowContentReady} items)</h3>
                            <div>
                                <label className="block text-sm font-medium mb-1">Select Topic</label>
                                <select value={marrowSelectedTopic} onChange={e => { setMarrowSelectedTopic(e.target.value); setMarrowNewTopicName(''); setMarrowSelectedChapter(''); setMarrowNewChapterName(''); }} className="input-field w-full">
                                    <option value="">Select existing...</option>
                                    {filteredTopicsForSelection.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                    <option value="CREATE_NEW">-- Create New --</option>
                                </select>
                                {marrowSelectedTopic === 'CREATE_NEW' &&
                                    <input type="text" value={marrowNewTopicName} onChange={e => setMarrowNewTopicName(e.target.value)} placeholder="New topic name" className="input-field w-full mt-2" />
                                }
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Select Chapter</label>
                                <select value={marrowSelectedChapter} onChange={e => setMarrowSelectedChapter(e.target.value)} className="input-field w-full" disabled={!marrowSelectedTopic || marrowSelectedTopic === 'CREATE_NEW'}>
                                    <option value="">Select existing...</option>
                                    {getChaptersForTopic(marrowSelectedTopic, 'Marrow').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    <option value="CREATE_NEW">-- Create New --</option>
                                </select>
                                {marrowSelectedChapter === 'CREATE_NEW' &&
                                    <input type="text" value={marrowNewChapterName} onChange={e => setMarrowNewChapterName(e.target.value)} placeholder="New chapter name" className="input-field w-full mt-2" />
                                }
                            </div>
                            <div className="space-y-2">
                                <label className="block text-sm font-medium mb-1">Key Clinical Topics (Tags)</label>
                                <div className="flex flex-wrap gap-2 p-2 border rounded-md dark:border-slate-600 bg-slate-50 dark:bg-slate-700">
                                    {marrowKeyTopics.map(tag => (
                                        <span key={tag} className="flex items-center px-2 py-1 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300 text-sm">
                                            {tag}
                                            <button onClick={() => handleRemoveMarrowKeyTopic(tag)} className="ml-1 text-sky-500 hover:text-sky-700">×</button>
                                        </span>
                                    ))}
                                    <input type="text" onKeyDown={handleAddMarrowKeyTopic} placeholder="Add new tag (Enter)" className="flex-grow min-w-[100px] bg-transparent outline-none text-slate-800 dark:text-slate-200" />
                                </div>
                                <p className="text-xs text-slate-500">AI Suggestions: {job.suggestedKeyTopics?.join(', ') || 'None'}</p>
                            </div>
                            <button onClick={handleApproveMarrowContent} disabled={!canMarrowApprove || approveMarrowMutation.isPending} className="btn-success w-full">
                                Approve & Save Content
                            </button>
                        </div>
                    );
            }
        }
        // Actions for General Pipeline
        else { // job.pipeline === 'general'
            switch (job.status) {
                case 'processed':
                    return (
                        <button onClick={() => planContentMutation.mutate(job.id)} disabled={planContentMutation.isPending} className="btn-primary w-full">
                            Step 1: Plan Content (Estimate MCQs/Flashcards)
                        </button>
                    );
                case 'pending_planning':
                    const suggestedPlan = job.suggestedPlan;
                    return (
                        <div className="space-y-4">
                            <h3 className="font-bold text-lg">Step 2: Approve Plan & Prepare Generation</h3>
                            <p className="text-sm text-neutral-500">AI Suggested: {suggestedPlan?.mcqCount || 0} MCQs, {suggestedPlan?.flashcardCount || 0} Flashcards</p>
                            <button onClick={() => startAutomatedBatchGenerationMutation.mutate(job.id)} disabled={startAutomatedBatchGenerationMutation.isPending} className="btn-primary w-full">
                                Start Automated Generation
                            </button>
                        </div>
                    );
                case 'generating_content':
                case 'generation_failed_partially':
                    const progress = job.totalBatches ? (((job.completedBatches || 0) / job.totalBatches) * 100).toFixed(0) : 0;
                    return <Loader message={`Generating batch ${(job.completedBatches || 0) + 1} of ${job.totalBatches || 0}... (${progress}%)`} />;
                case 'pending_assignment':
                    return (
                        <div className="space-y-3">
                            <h4 className="font-bold text-md">Assignment Suggestions</h4>
                            {generalAssignmentSuggestions && generalAssignmentSuggestions.length > 0 ? (
                                generalAssignmentSuggestions.map((suggestion, index) => (
                                    <div key={index} className="p-3 bg-slate-100 dark:bg-slate-700 rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                                        <div>
                                            <p className="font-semibold text-slate-800 dark:text-slate-200">Topic: {suggestion.topicName}</p>
                                            <p className="font-semibold text-slate-800 dark:text-slate-200">Chapter: {suggestion.chapterName} {suggestion.isNewChapter && <span className="text-xs text-green-500">(New)</span>}</p>
                                            <p className="text-xs text-slate-500">({(suggestion.mcqIndexes?.length || 0)} Q, {(suggestion.flashcardIndexes?.length || 0)} F)</p>
                                        </div>
                                        <button onClick={() => handleApproveGeneralAssignment(suggestion)} disabled={approveContentMutation.isPending} className="btn-success">
                                            {approveContentMutation.isPending ? 'Approving...' : `Approve`}
                                        </button>
                                    </div>
                                ))
                            ) : (
                                <button onClick={() => suggestAssignmentMutation.mutate({ jobId: job.id, existingTopics: allTopics, scopeToTopicName: job.suggestedTopic })} disabled={suggestAssignmentMutation.isPending} className="btn-secondary w-full">
                                    {suggestAssignmentMutation.isPending ? 'Thinking...' : <><LightBulbIcon className="inline h-4 w-4 mr-1" /> Suggest Assignment</>}
                                </button>
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
                    <h3 className="font-bold text-lg break-all">{job.title || job.fileName || 'Untitled Job'}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        {job.pipeline.toUpperCase()} Pipeline | Created {timeAgo}
                    </p>
                </div>
                <div className={clsx("text-xs font-bold text-white px-2 py-1 rounded-full", statusColor)}>
                    {statusText}
                </div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg text-sm text-slate-600 dark:text-slate-300">
                <p className="font-semibold">Next Step:</p>
                <p>{statusDescription}</p>
                {job.error && <p className="text-red-500 font-semibold mt-2">Error: {job.error}</p>}
            </div>

            {renderActions()}

            {/* Always available Reset/Archive at the very bottom, regardless of renderActions output */}
            {(job.status !== 'completed' && job.status !== 'archived' && job.status !== 'error') && (
                <div className="flex justify-end space-x-2 pt-2 border-t border-slate-200 dark:border-slate-700 mt-4">
                    <button onClick={() => prepareForRegenerationMutation.mutate(job.id)} disabled={prepareForRegenerationMutation.isPending || isProcessing} className="btn-warning">
                        {prepareForRegenerationMutation.isPending ? 'Preparing...' : 'Re-Generate'}
                    </button>
                    <button onClick={() => reassignContentMutation.mutate(job.id)} disabled={reassignContentMutation.isPending || isProcessing} className="btn-secondary">
                        {reassignContentMutation.isPending ? 'Reassigning...' : 'Re-Assign'}
                    </button>
                    <button onClick={() => resetUploadMutation.mutate(job.id)} disabled={resetUploadMutation.isPending || isProcessing} className="btn-neutral">
                        {resetUploadMutation.isPending ? 'Resetting...' : 'Reset'}
                    </button>
                    <button onClick={() => archiveUploadMutation.mutate(job.id)} disabled={archiveUploadMutation.isPending || isProcessing} className="btn-neutral">
                        {archiveUploadMutation.isPending ? 'Archiving...' : 'Archive'}
                    </button>
                </div>
            )}
            {job.status === 'completed' && (
                <div className="flex justify-end space-x-2 pt-2 border-t border-slate-200 dark:border-slate-700 mt-4">
                    <button onClick={() => prepareForRegenerationMutation.mutate(job.id)} disabled={prepareForRegenerationMutation.isPending || isProcessing} className="btn-warning">
                        {prepareForRegenerationMutation.isPending ? 'Preparing...' : 'Re-Generate'}
                    </button>
                    <button onClick={() => reassignContentMutation.mutate(job.id)} disabled={reassignContentMutation.isPending || isProcessing} className="btn-secondary">
                        {reassignContentMutation.isPending ? 'Reassigning...' : 'Re-Assign'}
                    </button>
                    <button onClick={() => archiveUploadMutation.mutate(job.id)} disabled={archiveUploadMutation.isPending || isProcessing} className="btn-neutral">
                        {archiveUploadMutation.isPending ? 'Archiving...' : 'Archive'}
                    </button>
                </div>
            )}
             {job.status === 'error' && (
                <div className="flex justify-end space-x-2 pt-2 border-t border-slate-200 dark:border-slate-700 mt-4">
                    <button onClick={() => resetUploadMutation.mutate(job.id)} disabled={resetUploadMutation.isPending || isProcessing} className="btn-neutral">
                        {resetUploadMutation.isPending ? 'Resetting...' : 'Reset'}
                    </button>
                    <button onClick={() => archiveUploadMutation.mutate(job.id)} disabled={archiveUploadMutation.isPending || isProcessing} className="btn-neutral">
                        {archiveUploadMutation.isPending ? 'Archiving...' : 'Archive'}
                    </button>
                </div>
            )}
        </div>
    );
};

export default AdminUploadCard;