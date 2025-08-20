// CRITICAL FIX: Completed all truncated code for action buttons and status handling.
// MODIFIED: Added General pipeline topic/chapter selection, and "Generate Summary" button.

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
// Removed 'types.' prefix from direct type imports, as they are imported directly into scope
import { ContentGenerationJob, UploadStatus, Topic, Chapter, AssignmentSuggestion, ProcessManualTextInputCallableData, ExtractMarrowContentCallableData, GenerateAndAnalyzeMarrowContentCallableData, ApproveMarrowContentCallableData, SuggestClassificationCallableData, PrepareBatchGenerationCallableData, StartAutomatedBatchGenerationCallableData, AutoAssignContentCallableData, ApproveContentCallableData, ResetUploadCallableData, ArchiveUploadCallableData, ReassignContentCallableData, PrepareForRegenerationCallableData, GenerateChapterSummaryCallableData } from '@pediaquiz/types';
import { useToast } from '@/components/Toast';
import { useTopics } from '@/hooks/useTopics';
import { normalizeId } from '@/utils/helpers';
import clsx from 'clsx';
import Loader from './Loader';
import { LightBulbIcon } from '@heroicons/react/24/outline';
import {
    processManualTextInput,
    extractMarrowContent,
    generateAndAnalyzeMarrowContent,
    approveMarrowContent,
    suggestClassification,
    prepareBatchGeneration,
    startAutomatedBatchGeneration,
    autoAssignContent,
    approveContent,
    resetUpload,
    archiveUpload,
    reassignContent,
    prepareForRegeneration,
    generateChapterSummary, // Import the new callable
} from '@/services/aiService';


const getStatusInfo = (status: UploadStatus): { text: string, color: string, description: string } => {
    switch (status) {
        case 'pending_upload': return { text: 'Upload Pending', color: 'bg-slate-500', description: 'File is being uploaded.' };
        case 'pending_ocr': return { text: 'OCR Pending', color: 'bg-amber-500', description: 'Waiting for text extraction from the uploaded file.' };
        case 'failed_ocr': return { text: 'OCR Failed', color: 'bg-red-700', description: 'Text extraction from file failed.' };
        case 'processed': return { text: 'Processed', color: 'bg-sky-500', description: 'Text extracted. Ready for AI processing.' };
        case 'pending_classification': return { text: 'Classifying', color: 'bg-indigo-500 animate-pulse', description: 'AI is analyzing content and suggesting topic/chapter.' };
        case 'pending_approval': return { text: 'Ready for Review', color: 'bg-purple-500', description: 'AI classification complete. Awaiting admin review for content generation parameters.' };
        case 'batch_ready': return { text: 'Batch Ready', color: 'bg-blue-500', description: 'Content is structured for batch generation.' };
        case 'generating_batch': return { text: 'Generating Content', color: 'bg-blue-600 animate-pulse', description: 'AI is actively generating MCQs and Flashcards in batches.' };
        case 'pending_final_review': return { text: 'Final Review', color: 'bg-teal-500', description: 'Content generated. Awaiting final assignment and approval.' };
        case 'pending_marrow_extraction': return { text: 'Marrow Extract', color: 'bg-orange-500', description: 'Marrow: Raw text ready for MCQ/Explanation extraction.' };
        case 'pending_generation_decision': return { text: 'Gen Decision', color: 'bg-purple-600', description: 'Marrow: Extracted. Admin decides to generate MCQs from explanations.' };
        case 'pending_assignment': return { text: 'Assignment', color: 'bg-green-500', description: 'Content ready for assignment.' };
        case 'pending_assignment_review': return { text: 'AI Assignment Review', color: 'bg-lime-500', description: 'General: AI auto-assignment complete. Review and approve.' };
        case 'completed': return { text: 'Completed', color: 'bg-green-600', description: 'Content successfully approved and added to library.' };
        case 'error': return { text: 'Error', color: 'bg-red-700', description: 'An error occurred during processing. See details below.' };
        case 'failed_unsupported_type': return { text: 'Unsupported Type', color: 'bg-red-500', description: 'Uploaded file type is not supported.' };
        case 'failed_ai_extraction': return { text: 'AI Extraction Failed', color: 'bg-red-600', description: 'AI could not extract content properly.' };
        case 'failed_api_permission': return { text: 'API Permission Error', color: 'bg-red-800', description: 'Firebase or external API permission error.' };
        case 'archived': return { text: 'Archived', color: 'bg-gray-500', description: 'This job has been archived.' };
        case 'generation_failed_partially': return { text: 'Partial Fail', color: 'bg-red-500', description: 'Content generation partially failed. Can regenerate.' };
        default: return { text: 'Unknown', color: 'bg-slate-400', description: 'Unknown status.' };
    }
};


// Added allTopics to the component's props interface
const AdminUploadCard: React.FC<{ job: ContentGenerationJob; allTopics: Topic[] }> = ({ job, allTopics }) => {
    const { addToast } = useToast();
    const queryClient = useQueryClient();
    // The useTopics hook is still available, but we'll use the passed `allTopics` prop for consistency

    const [title, setTitle] = useState(job.title || '');
    const [estimatedMcqCount, setEstimatedMcqCount] = useState(job.suggestedPlan?.mcqCount || 0);
    const [estimatedFlashcardCount, setEstimatedFlashcardCount] = useState(job.suggestedPlan?.flashcardCount || 0);
    const [batchSize, setBatchSize] = useState(job.batchSize || 20);
    const [approvedTopic, setApprovedTopic] = useState(job.suggestedTopic || ''); // For both pipelines
    const [approvedChapter, setApprovedChapter] = useState(job.suggestedChapter || ''); // For both pipelines
    const [marrowNumToGenerate, setMarrowNumToGenerate] = useState(job.stagedContent?.orphanExplanations?.length || 0);
    const [marrowKeyTopics, setMarrowKeyTopics] = useState<string[]>(job.suggestedKeyTopics || []);

    // Directly using AssignmentSuggestion, no 'types.' prefix
    const [generalAssignmentSuggestions, setGeneralAssignmentSuggestions] = useState<AssignmentSuggestion[]>(job.assignmentSuggestions || []);

    const [newTopicName, setNewTopicName] = useState('');
    const [newChapterName, setNewChapterName] = useState('');

    useEffect(() => {
        setTitle(job.title || '');
        setEstimatedMcqCount(job.suggestedPlan?.mcqCount || 0);
        setEstimatedFlashcardCount(job.suggestedPlan?.flashcardCount || 0);
        setBatchSize(job.batchSize || 20);
        setApprovedTopic(job.suggestedTopic || '');
        setApprovedChapter(job.suggestedChapter || '');
        setMarrowNumToGenerate(job.stagedContent?.orphanExplanations?.length || 0);
        setMarrowKeyTopics(job.suggestedKeyTopics || []);
        setGeneralAssignmentSuggestions(job.assignmentSuggestions || []);
        setNewTopicName('');
        setNewChapterName('');
    }, [job]);

    const isMarrowPipeline = job.pipeline === 'marrow';

    const filteredTopicsForSelection = useMemo(() => {
        if (!allTopics) return [];
        return allTopics.filter(t => isMarrowPipeline ? t.source === 'Marrow' : t.source === 'General');
    }, [allTopics, isMarrowPipeline]);

    const getChaptersForTopic = useCallback((selectedTopicId: string) => {
        const topic = allTopics?.find(t => t.id === selectedTopicId);
        if (!topic) return [];
        // For general topics, chapters are strings. For marrow, they are objects.
        // We need to return consistent Chapter objects for selection.
        if (topic.source === 'General') {
            return (topic.chapters as string[]).map(chName => ({ id: normalizeId(chName), name: chName, topicId: topic.id, source: 'General' } as Chapter));
        } else {
            // Directly using Chapter, no 'types.' prefix
            return (topic.chapters as Chapter[]).map(ch => ({ ...ch, id: normalizeId(ch.name), topicId: topic.id, source: 'Marrow' } as Chapter));
        }
    }, [allTopics]);

    const invalidateAndToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
        addToast(message, type);
        queryClient.invalidateQueries({ queryKey: ['pendingUploads'] });
        queryClient.invalidateQueries({ queryKey: ['marrowUploads'] });
        // The AdminCompletedJobsPage route is being removed, so this invalidation might become redundant soon,
        // but keeping it for now for robustness during transition.
        queryClient.invalidateQueries({ queryKey: ['completedUploads'] });
        queryClient.invalidateQueries({ queryKey: ['allTopics'] }); // Always invalidate topics if content changes
        queryClient.invalidateQueries({ queryKey: ['appData'] }); // If appData is still used, keep this
    };

    // All Callable Function Mutations - using direct type names
    const processManualTextInputMutation = useMutation({
        mutationFn: (vars: ProcessManualTextInputCallableData) => processManualTextInput(vars),
        onSuccess: (data) => invalidateAndToast(data.data.message || "Manual text processed!", 'success'),
        onError: (error: any) => invalidateAndToast(`Manual text processing failed: ${error.message}`, 'error'),
    });

    const extractMarrowContentMutation = useMutation({
        mutationFn: (vars: ExtractMarrowContentCallableData) => extractMarrowContent(vars),
        onSuccess: (data) => invalidateAndToast(`Extracted ${data.data.mcqCount} MCQs and ${data.data.explanationCount} explanations.`, 'success'),
        onError: (error: any) => invalidateAndToast(`Marrow extraction failed: ${error.message}`, 'error'),
    });

    const generateAndAnalyzeMarrowMutation = useMutation({
        mutationFn: (vars: GenerateAndAnalyzeMarrowContentCallableData) => generateAndAnalyzeMarrowContent(vars),
        onSuccess: (data) => invalidateAndToast(data.data.message || "Marrow generation and analysis complete!", 'success'),
        onError: (error: any) => invalidateAndToast(`Marrow generation failed: ${error.message}`, 'error'),
    });

    const approveMarrowMutation = useMutation({
        mutationFn: (vars: ApproveMarrowContentCallableData) => approveMarrowContent(vars),
        onSuccess: (data) => invalidateAndToast(data.data.message || "Marrow content approved!", 'success'),
        onError: (error: any) => invalidateAndToast(`Marrow approval failed: ${error.message}`, 'error'),
    });

    const suggestClassificationMutation = useMutation({
        mutationFn: (vars: SuggestClassificationCallableData) => suggestClassification(vars),
        onSuccess: (data) => invalidateAndToast(data.data.suggestedTopic ? `AI suggested: ${data.data.suggestedTopic} > ${data.data.suggestedChapter}` : "AI classification complete!", "success"),
        onError: (error: any) => invalidateAndToast(`AI classification failed: ${error.message}`, 'error'),
    });

    const prepareBatchGenerationMutation = useMutation({
        mutationFn: (vars: PrepareBatchGenerationCallableData) => prepareBatchGeneration(vars),
        onSuccess: (data) => invalidateAndToast(`Prepared for ${data.data.totalBatches} batches.`, "success"),
        onError: (error: any) => invalidateAndToast(`Batch preparation failed: ${error.message}`, 'error'),
    });

    const startAutomatedBatchGenerationMutation = useMutation({
        mutationFn: (vars: StartAutomatedBatchGenerationCallableData) => startAutomatedBatchGeneration(vars),
        onSuccess: (data) => invalidateAndToast(data.data.message || "Automated batch generation started!", "success"),
        onError: (error: any) => invalidateAndToast(`Generation start failed: ${error.message}`, 'error'),
    });

    const autoAssignContentMutation = useMutation({
        mutationFn: (vars: AutoAssignContentCallableData) => autoAssignContent(vars),
        onSuccess: (data) => {
            invalidateAndToast("AI auto-assignment complete!", "success");
            if (data.data.suggestions) setGeneralAssignmentSuggestions(data.data.suggestions);
        },
        onError: (error: any) => invalidateAndToast(`Auto-assignment failed: ${error.message}`, 'error'),
    });

    const approveContentMutation = useMutation({
        mutationFn: (vars: ApproveContentCallableData) => approveContent(vars),
        onSuccess: (data) => invalidateAndToast(data.data.message || "Content approved successfully!", "success"),
        onError: (error: any) => invalidateAndToast(`General content approval failed: ${error.message}`, 'error'),
    });

    const resetUploadMutation = useMutation({
        mutationFn: (vars: ResetUploadCallableData) => resetUpload(vars),
        onSuccess: (data) => invalidateAndToast(data.data.message || "Upload reset successfully!", 'success'),
        onError: (error: any) => invalidateAndToast(`Reset failed: ${error.message}`, 'error'),
    });

    const archiveUploadMutation = useMutation({
        mutationFn: (vars: ArchiveUploadCallableData) => archiveUpload(vars),
        onSuccess: (data) => invalidateAndToast(data.data.message || "Upload archived successfully!", 'success'),
        onError: (error: any) => invalidateAndToast(`Archive failed: ${error.message}`, 'error'),
    });

    const reassignContentMutation = useMutation({
        mutationFn: (vars: ReassignContentCallableData) => reassignContent(vars),
        onSuccess: (data) => invalidateAndToast(data.data.message || "Content re-assignment initiated!", 'success'),
        onError: (error: any) => invalidateAndToast(`Re-assignment failed: ${error.message}`, 'error'),
    });

    const prepareForRegenerationMutation = useMutation({
        mutationFn: (vars: PrepareForRegenerationCallableData) => prepareForRegeneration(vars),
        onSuccess: (data) => invalidateAndToast(data.data.message || "Preparation for regeneration complete!", 'success'),
        onError: (error: any) => invalidateAndToast(`Preparation for regeneration failed: ${error.message}`, 'error'),
    });

    const generateChapterSummaryMutation = useMutation({
        mutationFn: (vars: GenerateChapterSummaryCallableData) => generateChapterSummary(vars),
        onSuccess: (data) => invalidateAndToast(data.data.summary ? "Chapter summary generated and saved!" : "Chapter summary generated!", 'success'),
        onError: (error: any) => invalidateAndToast(`Failed to generate chapter summary: ${error.message}`, 'error'),
    });


    const isProcessing = processManualTextInputMutation.isPending || extractMarrowContentMutation.isPending || generateAndAnalyzeMarrowMutation.isPending ||
        approveMarrowMutation.isPending || suggestClassificationMutation.isPending || prepareBatchGenerationMutation.isPending ||
        startAutomatedBatchGenerationMutation.isPending || autoAssignContentMutation.isPending || approveContentMutation.isPending ||
        resetUploadMutation.isPending || archiveUploadMutation.isPending || reassignContentMutation.isPending || prepareForRegenerationMutation.isPending ||
        generateChapterSummaryMutation.isPending;

    const { text: statusText, color: statusColor, description: statusDescription } = getStatusInfo(job.status);

    const createdAtDate = (job.createdAt instanceof Date) ? job.createdAt : (job.createdAt as any)?.toDate ? (job.createdAt as any).toDate() : new Date();
    const timeAgo = createdAtDate.toLocaleString();


    const handleAddMarrowKeyTopic = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const newTag = e.currentTarget.value.trim().toLowerCase(); // Normalize tag to lowercase
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
        const finalTopicName = approvedTopic === 'CREATE_NEW' ? newTopicName.trim() : filteredTopicsForSelection.find(t => t.id === approvedTopic)?.name || approvedTopic;
        const finalTopicId = normalizeId(finalTopicName); // Ensure normalized ID

        const finalChapterName = approvedChapter === 'CREATE_NEW' ? newChapterName.trim() : getChaptersForTopic(approvedTopic).find(c => c.id === approvedChapter)?.name || approvedChapter;
        const finalChapterId = normalizeId(finalChapterName); // Ensure normalized ID


        if (!finalTopicName || !finalChapterName || !finalTopicId || !finalChapterId) {
            addToast("Topic and Chapter are required. Ensure 'CREATE_NEW' fields are filled if selected.", "error");
            return;
        }
        // Tags are already normalized by handleAddMarrowKeyTopic
        approveMarrowMutation.mutate({ uploadId: job.id, topicId: finalTopicId, topicName: finalTopicName, chapterId: finalChapterId, chapterName: finalChapterName, keyTopics: marrowKeyTopics });
    };

    // Using direct type name AssignmentSuggestion
    const handleApproveGeneralAssignment = (assignment: AssignmentSuggestion) => {
        approveContentMutation.mutate({ uploadId: job.id, assignments: [assignment] });
    };

    const handlePrepareGeneralBatch = () => {
        const finalTopicName = approvedTopic === 'CREATE_NEW' ? newTopicName.trim() : filteredTopicsForSelection.find(t => t.id === approvedTopic)?.name || approvedTopic;
        const finalTopicId = normalizeId(finalTopicName); // Ensure normalized ID

        const finalChapterName = approvedChapter === 'CREATE_NEW' ? newChapterName.trim() : getChaptersForTopic(approvedTopic).find(c => c.id === approvedChapter)?.name || approvedChapter;
        const finalChapterId = normalizeId(finalChapterName); // Ensure normalized ID

        if (!finalTopicName || !finalChapterName || !finalTopicId || !finalChapterId) {
            addToast("Topic and Chapter are required. Ensure 'CREATE_NEW' fields are filled if selected.", "error");
            return;
        }

        prepareBatchGenerationMutation.mutate({
            uploadId: job.id,
            totalMcqCount: estimatedMcqCount,
            totalFlashcardCount: estimatedFlashcardCount,
            batchSize,
            approvedTopic: finalTopicName, // Send the final names to backend
            approvedChapter: finalChapterName, // Send the final names to backend
        });
    };

    const handleGenerateSummary = () => {
        // Ensure job has source text and is completed/reviewable
        if (!job.sourceText || job.sourceText.length < 100 || !(job.status === 'completed' || job.status === 'pending_final_review' || job.status === 'pending_assignment_review')) {
            addToast("Source text is not available or job is not in a suitable state for summary generation (min 100 chars).", "error");
            return;
        }

        // Determine the target chapter/topic for notes.
        // Prioritize the explicitly approved topic/chapter from the job, then assignment suggestions.
        let targetTopicId: string | undefined;
        let targetChapterId: string | undefined;
        let targetSource: 'General' | 'Marrow' | undefined; // Make it optional for initial calls if not yet assigned

        if (job.approvedTopic && job.approvedChapter) {
            targetTopicId = normalizeId(job.approvedTopic);
            targetChapterId = normalizeId(job.approvedChapter);
            targetSource = job.pipeline === 'marrow' ? 'Marrow' : 'General';
        } else if (job.assignmentSuggestions && job.assignmentSuggestions.length > 0) {
            // For General pipeline, get from assignment suggestions
            const firstAssignment = job.assignmentSuggestions[0];
            targetTopicId = normalizeId(firstAssignment.topicName);
            targetChapterId = normalizeId(firstAssignment.chapterName);
            targetSource = 'General'; // Assignments are always for General pipeline
        } else {
            addToast("No associated topic/chapter found for summary generation. Please ensure content is assigned.", "error");
            return;
        }

        if (!targetTopicId || !targetChapterId || !targetSource) {
            addToast("Could not determine target topic/chapter for summary. Ensure the job has approved assignments.", "error");
            return;
        }

        generateChapterSummaryMutation.mutate({
            uploadIds: [job.id],
            topicId: targetTopicId,
            chapterId: targetChapterId,
            source: targetSource,
        });
    };


    const renderActions = () => {
        if (isProcessing) return <Loader message="Processing request..." />;

        const commonActions = (
            <div className="flex space-x-2 mt-4">
                {job.status !== 'archived' && (
                    <>
                        <button
                            className="btn-neutral"
                            onClick={() => resetUploadMutation.mutate({ uploadId: job.id })}
                            disabled={resetUploadMutation.isPending}
                        >
                            Reset
                        </button>
                        <button
                            className="btn-neutral"
                            onClick={() => archiveUploadMutation.mutate({ uploadId: job.id })}
                            disabled={archiveUploadMutation.isPending}
                        >
                            Archive
                        </button>
                    </>
                )}
                {/* Actions available for completed, error, partially failed, or review states */}
                {['completed', 'error', 'generation_failed_partially', 'pending_assignment_review', 'archived'].includes(job.status) && (
                    <>
                        {job.pipeline === 'general' && (job.status === 'completed' || job.status === 'pending_assignment_review') && (
                            <button
                                className="btn-neutral"
                                onClick={() => reassignContentMutation.mutate({ uploadId: job.id })}
                                disabled={reassignContentMutation.isPending}
                            >
                                Reassign
                            </button>
                        )}
                        {['generation_failed_partially', 'completed', 'error', 'archived'].includes(job.status) && job.pipeline === 'general' && (
                            <button
                                className="btn-neutral"
                                onClick={() => prepareForRegenerationMutation.mutate({ uploadId: job.id })}
                                disabled={prepareForRegenerationMutation.isPending}
                            >
                                Regenerate
                            </button>
                        )}
                        {/* "Generate Chapter Summary" button - available if source text exists and job is completed/final review */}
                        {job.sourceText && job.sourceText.length >= 100 &&
                            (['completed', 'pending_final_review', 'pending_assignment_review'].includes(job.status) ||
                             (job.pipeline === 'marrow' && job.status === 'pending_assignment')) && ( // Marrow also has approved topic/chapter at pending_assignment
                            <button
                                className="btn-secondary"
                                onClick={handleGenerateSummary}
                                disabled={generateChapterSummaryMutation.isPending}
                            >
                                {generateChapterSummaryMutation.isPending ? "Generating Summary..." : "✨ Generate Chapter Summary"}
                            </button>
                        )}
                    </>
                )}
            </div>
        );

        if (isMarrowPipeline) {
            switch (job.status) {
                case 'processed':
                case 'pending_ocr':
                    return (
                        <div>
                            <p className="text-slate-500 text-sm">Text extracted. Processing for Marrow. (Will transition to Marrow Extract)</p>
                            {commonActions}
                        </div>
                    );
                case 'pending_marrow_extraction':
                    return (
                        <div>
                            <button
                                className="btn-primary"
                                onClick={() => extractMarrowContentMutation.mutate({ uploadId: job.id })}
                                disabled={extractMarrowContentMutation.isPending}
                            >
                                Extract Marrow Content
                            </button>
                            {commonActions}
                        </div>
                    );
                case 'pending_generation_decision':
                    return (
                        <div className="space-y-4">
                            <p className="text-slate-700 dark:text-slate-300 text-sm">
                                Extracted MCQs: {job.stagedContent?.extractedMcqs?.length || 0}
                                <br />Orphan Explanations: {job.stagedContent?.orphanExplanations?.length || 0}
                            </p>
                            <div>
                                <label className="block text-sm font-medium">Number of New MCQs to Generate from Explanations</label>
                                <input
                                    type="number"
                                    value={marrowNumToGenerate}
                                    onChange={(e) => setMarrowNumToGenerate(Number(e.target.value))}
                                    className="input-field"
                                    min="0"
                                    max={job.stagedContent?.orphanExplanations?.length || 0}
                                    disabled={generateAndAnalyzeMarrowMutation.isPending}
                                />
                            </div>
                            <button
                                className="btn-primary"
                                onClick={() => generateAndAnalyzeMarrowMutation.mutate({ uploadId: job.id, count: marrowNumToGenerate })}
                                disabled={generateAndAnalyzeMarrowMutation.isPending}
                            >
                                Generate MCQs & Analyze Topics
                            </button>
                            {commonActions}
                        </div>
                    );
                case 'pending_assignment':
                    return (
                        <div className="space-y-4">
                            <p className="text-slate-700 dark:text-slate-300 text-sm">
                                Staged MCQs: {(job.stagedContent?.extractedMcqs?.length || 0) + (job.stagedContent?.generatedMcqs?.length || 0)} ready for assignment.
                            </p>
                            <div>
                                <label className="block text-sm font-medium">Assign to Topic</label>
                                <select
                                    value={approvedTopic}
                                    onChange={(e) => {
                                        setApprovedTopic(e.target.value);
                                        setApprovedChapter(''); // Reset chapter on topic change
                                        setNewTopicName('');
                                        setNewChapterName('');
                                    }}
                                    className="input-field"
                                    disabled={approveMarrowMutation.isPending}
                                >
                                    <option value="">Select Topic</option>
                                    {filteredTopicsForSelection.filter(t => t.source === 'Marrow').map((topic) => (
                                        <option key={topic.id} value={topic.id}>{topic.name}</option>
                                    ))}
                                    <option value="CREATE_NEW">-- Create New Topic --</option>
                                </select>
                                {approvedTopic === 'CREATE_NEW' && (
                                    <input
                                        type="text"
                                        value={newTopicName}
                                        onChange={(e) => setNewTopicName(e.target.value)}
                                        placeholder="New Topic Name"
                                        className="input-field mt-2"
                                        disabled={approveMarrowMutation.isPending}
                                    />
                                )}
                            </div>
                            {(approvedTopic && approvedTopic !== 'CREATE_NEW') && (
                                <div>
                                    <label className="block text-sm font-medium">Assign to Chapter</label>
                                    <select
                                        value={approvedChapter}
                                        onChange={(e) => {
                                            setApprovedChapter(e.target.value);
                                            setNewChapterName('');
                                        }}
                                        className="input-field"
                                        disabled={approveMarrowMutation.isPending}
                                    >
                                        <option value="">Select Chapter</option>
                                        {getChaptersForTopic(approvedTopic).map((chapter) => (
                                            <option key={chapter.id} value={chapter.id}>{chapter.name}</option>
                                        ))}
                                        <option value="CREATE_NEW">-- Create New Chapter --</option>
                                    </select>
                                    {approvedChapter === 'CREATE_NEW' && (
                                        <input
                                            type="text"
                                            value={newChapterName}
                                            onChange={(e) => setNewChapterName(e.target.value)}
                                            placeholder="New Chapter Name"
                                            className="input-field mt-2"
                                            disabled={approveMarrowMutation.isPending}
                                        />
                                    )}
                                </div>
                            )}
                            <div>
                                <label className="block text-sm font-medium">Key Topics (Tags)</label>
                                <input
                                    type="text"
                                    onKeyDown={handleAddMarrowKeyTopic}
                                    placeholder="Add key topic and press Enter"
                                    className="input-field"
                                    disabled={approveMarrowMutation.isPending}
                                />
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {marrowKeyTopics.map((tag) => (
                                        <span
                                            key={tag}
                                            className="inline-flex items-center px-2 py-1 rounded-full bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300"
                                        >
                                            {tag}
                                            <button
                                                onClick={() => handleRemoveMarrowKeyTopic(tag)}
                                                className="ml-2 text-red-500 hover:text-red-700"
                                                disabled={approveMarrowMutation.isPending}
                                            >
                                                ×
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            </div>
                            <button
                                className="btn-success"
                                onClick={handleApproveMarrowContent}
                                disabled={approveMarrowMutation.isPending || !(approvedTopic && approvedChapter) ||
                                    (approvedTopic === 'CREATE_NEW' && !newTopicName.trim()) ||
                                    (approvedChapter === 'CREATE_NEW' && !newChapterName.trim()) ||
                                    marrowKeyTopics.length === 0} // Key topics are required for Marrow content
                            >
                                Approve & Save Marrow Content
                            </button>
                            {commonActions}
                        </div>
                    );
                case 'completed':
                case 'archived':
                case 'error':
                case 'generation_failed_partially':
                    return (
                        <div>
                            <p className={clsx("text-sm", job.status === 'completed' ? 'text-green-500' : 'text-slate-500')}>
                                {job.status === 'completed' ? 'Content approved and added to library.' :
                                    job.status === 'archived' ? 'This job is archived.' :
                                        job.status === 'error' ? 'An unrecoverable error occurred.' :
                                            'Content generation partially failed.'}
                            </p>
                            {commonActions}
                        </div>
                    );
                default:
                    return (
                        <div>
                            <p className="text-slate-500 text-sm">No actions available for this status.</p>
                            {commonActions}
                        </div>
                    );
            }
        } else {
            // General Pipeline
            switch (job.status) {
                case 'processed':
                case 'pending_ocr':
                    return (
                        <div>
                            <p className="text-slate-500 text-sm">Text extracted. Processing for General. (Will transition to Classifying)</p>
                            {commonActions}
                        </div>
                    );
                case 'pending_classification':
                    return (
                        <div>
                            <button
                                className="btn-primary"
                                onClick={() => suggestClassificationMutation.mutate({ uploadId: job.id })}
                                disabled={suggestClassificationMutation.isPending}
                            >
                                AI Classify Content
                            </button>
                            {commonActions}
                        </div>
                    );
                case 'pending_approval':
                    return (
                        <div className="space-y-4">
                            <p className="text-slate-700 dark:text-slate-300 text-sm">
                                AI Suggested Topic: <span className="font-semibold">{job.suggestedTopic || 'N/A'}</span>
                                <br />AI Suggested Chapter: <span className="font-semibold">{job.suggestedChapter || 'N/A'}</span>
                                <br />Estimated MCQs: <span className="font-semibold">{job.suggestedPlan?.mcqCount || 0}</span>
                                <br />Estimated Flashcards: <span className="font-semibold">{job.suggestedPlan?.flashcardCount || 0}</span>
                            </p>
                            <div>
                                <label className="block text-sm font-medium">Approved MCQ Count</label>
                                <input type="number" value={estimatedMcqCount} onChange={(e) => setEstimatedMcqCount(Number(e.target.value))} className="input-field" disabled={prepareBatchGenerationMutation.isPending} min="0" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium">Approved Flashcard Count</label>
                                <input type="number" value={estimatedFlashcardCount} onChange={(e) => setEstimatedFlashcardCount(Number(e.target.value))} className="input-field" disabled={prepareBatchGenerationMutation.isPending} min="0" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium">Batch Size</label>
                                <input type="number" value={batchSize} onChange={(e) => setBatchSize(Number(e.target.value))} className="input-field" disabled={prepareBatchGenerationMutation.isPending} min="1" />
                            </div>
                            {/* Topic/Chapter selection for General Pipeline - Now mirrors Marrow pipeline for admin control */}
                            <div>
                                <label className="block text-sm font-medium">Assign to Topic</label>
                                <select
                                    value={approvedTopic}
                                    onChange={(e) => {
                                        setApprovedTopic(e.target.value);
                                        setApprovedChapter(''); // Reset chapter on topic change
                                        setNewTopicName('');
                                        setNewChapterName('');
                                    }}
                                    className="input-field"
                                    disabled={prepareBatchGenerationMutation.isPending}
                                >
                                    <option value="">Select Topic</option>
                                    {filteredTopicsForSelection.filter(t => t.source === 'General').map((topic) => (
                                        <option key={topic.id} value={topic.id}>{topic.name}</option>
                                    ))}
                                    <option value="CREATE_NEW">-- Create New Topic --</option>
                                </select>
                                {approvedTopic === 'CREATE_NEW' && (
                                    <input
                                        type="text"
                                        value={newTopicName}
                                        onChange={(e) => setNewTopicName(e.target.value)}
                                        placeholder="New Topic Name"
                                        className="input-field mt-2"
                                        disabled={prepareBatchGenerationMutation.isPending}
                                    />
                                )}
                            </div>
                            {(approvedTopic && approvedTopic !== 'CREATE_NEW') && (
                                <div>
                                    <label className="block text-sm font-medium">Assign to Chapter</label>
                                    <select
                                        value={approvedChapter}
                                        onChange={(e) => {
                                            setApprovedChapter(e.target.value);
                                            setNewChapterName('');
                                        }}
                                        className="input-field"
                                        disabled={prepareBatchGenerationMutation.isPending}
                                    >
                                        <option value="">Select Chapter</option>
                                        {getChaptersForTopic(approvedTopic).map((chapter) => (
                                            <option key={chapter.id} value={chapter.id}>{chapter.name}</option>
                                        ))}
                                        <option value="CREATE_NEW">-- Create New Chapter --</option>
                                    </select>
                                    {approvedChapter === 'CREATE_NEW' && (
                                        <input
                                            type="text"
                                            value={newChapterName}
                                            onChange={(e) => setNewChapterName(e.target.value)}
                                            placeholder="New Chapter Name"
                                            className="input-field mt-2"
                                            disabled={prepareBatchGenerationMutation.isPending}
                                        />
                                    )}
                                </div>
                            )}

                            <button
                                className="btn-primary"
                                onClick={handlePrepareGeneralBatch}
                                disabled={prepareBatchGenerationMutation.isPending || !(approvedTopic && approvedChapter) || (estimatedMcqCount + estimatedFlashcardCount === 0) || batchSize === 0 ||
                                    (approvedTopic === 'CREATE_NEW' && !newTopicName.trim()) ||
                                    (approvedChapter === 'CREATE_NEW' && !newChapterName.trim())}
                            >
                                Prepare for Batch Generation
                            </button>
                            {commonActions}
                        </div>
                    );
                case 'batch_ready':
                    return (
                        <div>
                            <p className="text-slate-500 text-sm">Ready to start automated content generation.</p>
                            <button
                                className="btn-primary"
                                onClick={() => startAutomatedBatchGenerationMutation.mutate({ uploadId: job.id })}
                                disabled={startAutomatedBatchGenerationMutation.isPending}
                            >
                                Start Batch Generation ({job.totalBatches} batches)
                            </button>
                            {commonActions}
                        </div>
                    );
                case 'generating_batch':
                    return (
                        <div>
                            <p className="text-slate-500 text-sm">Content generation in progress: {job.completedBatches || 0}/{job.totalBatches || 'N/A'} batches completed.</p>
                            <Loader message="Generating..." />
                            {commonActions}
                        </div>
                    );
                case 'pending_final_review':
                    return (
                        <div className="space-y-4">
                            <p className="text-slate-700 dark:text-slate-300 text-sm">
                                Generated MCQs: {job.finalAwaitingReviewData?.mcqs?.length || 0}
                                <br />Generated Flashcards: {job.finalAwaitingReviewData?.flashcards?.length || 0}
                            </p>
                            <button
                                className="btn-primary"
                                onClick={() => autoAssignContentMutation.mutate({ uploadId: job.id, existingTopics: allTopics || [] })}
                                disabled={autoAssignContentMutation.isPending}
                            >
                                AI Auto-Assign Content
                            </button>
                            {commonActions}
                        </div>
                    );
                case 'pending_assignment_review':
                    return (
                        <div className="space-y-4">
                            {generalAssignmentSuggestions.length > 0 ? (
                                <>
                                    <h3 className="text-lg font-semibold">Assignment Suggestions</h3>
                                    {generalAssignmentSuggestions.map((suggestion, index) => (
                                        <div key={index} className="card-base p-4 border rounded-md">
                                            <p>Topic: <span className="font-semibold">{suggestion.topicName}</span></p>
                                            <p>Chapter: <span className="font-semibold">{suggestion.chapterName}</span></p>
                                            <p className="text-sm text-slate-500">New Chapter: {suggestion.isNewChapter ? 'Yes' : 'No'}</p>
                                            <p className="text-sm text-slate-500">MCQs: {suggestion.mcqs?.length || 0}, Flashcards: {suggestion.flashcards?.length || 0}</p>
                                            <button
                                                className="btn-success mt-2"
                                                onClick={() => handleApproveGeneralAssignment(suggestion)}
                                                disabled={approveContentMutation.isPending}
                                            >
                                                Approve This Assignment
                                            </button>
                                        </div>
                                    ))}
                                    <p className="text-slate-500 text-sm mt-4">Remaining suggestions: {generalAssignmentSuggestions.length}</p>
                                </>
                            ) : (
                                <p className="text-slate-500 text-sm">No assignment suggestions currently available. Try AI Auto-Assign or approve content.</p>
                            )}
                            {commonActions}
                        </div>
                    );
                case 'completed':
                case 'archived':
                case 'error':
                case 'generation_failed_partially':
                    return (
                        <div>
                            <p className={clsx("text-sm", job.status === 'completed' ? 'text-green-500' : 'text-slate-500')}>
                                {job.status === 'completed' ? 'Content approved and added to library.' :
                                    job.status === 'archived' ? 'This job is archived.' :
                                        job.status === 'error' ? 'An unrecoverable error occurred.' :
                                            'Content generation partially failed.'}
                            </p>
                            {commonActions}
                        </div>
                    );
                default:
                    return (
                        <div>
                            <p className="text-slate-500 text-sm">No actions available for this status.</p>
                            {commonActions}
                        </div>
                    );
            }
        }
    };

    return (
        <div className="card-base">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{job.title || job.fileName}</h3>
                <span className={clsx("px-3 py-1 rounded-full text-sm text-white", statusColor)}>
                    {statusText}
                </span>
            </div>
            <p className="text-sm text-slate-500">Created: {timeAgo}</p>
            <p className="text-sm mt-2">{statusDescription}</p>
            {job.fileName && (
                <p className="text-sm mt-1">Original File: {job.fileName}</p>
            )}
            {job.errors && job.errors.length > 0 && (
                <div className="mt-2">
                    <p className="text-sm text-red-500">Errors:</p>
                    <ul className="list-disc list-inside text-sm text-red-500">
                        {job.errors.map((error: string, index: number) => ( // Explicitly typed error and index for clarity
                            <li key={index}>{error}</li>
                        ))}
                    </ul>
                </div>
            )}
            {renderActions()}
        </div>
    );
};

export default AdminUploadCard;