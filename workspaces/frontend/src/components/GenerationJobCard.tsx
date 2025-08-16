// workspaces/frontend/src/components/GenerationJobCard.tsx
import React, { useState } from 'react';
import { ContentGenerationJob, UploadStatus, PediaquizTopicType, AssignmentSuggestion, MCQ, Flashcard } from '@pediaquiz/types';
import clsx from 'clsx';
import { format } from 'date-fns';
import ConfirmationModal from './ConfirmationModal';
import { useToast } from './Toast';

interface GenerationJobCardProps {
    job: ContentGenerationJob;
    onPlan: (job: ContentGenerationJob) => void;
    onExecuteGeneration: (job: ContentGenerationJob) => void;
    onSuggestAssignment: (job: ContentGenerationJob) => void;
    onApproveContent: (job: ContentGenerationJob, assignment: AssignmentSuggestion) => void;
    onGenerateMarrowStaged: (job: ContentGenerationJob) => void;
    onGenerateGeneralStaged: (job: ContentGenerationJob) => void;
    onReset: (jobId: string) => void;
    onArchive: (jobId: string) => void;
    isPlanning: boolean;
    isExecuting: boolean;
    isSuggestingAssignment: boolean;
    isApprovingContent: boolean;
    isGeneratingMarrowStaged: boolean;
    isGeneratingGeneralStaged: boolean;
    isResetting: boolean;
    isArchiving: boolean;
    onRefresh: () => void;
    existingTopics: PediaquizTopicType[];
}

const getStatusColorClass = (status: UploadStatus) => {
    switch (status) {
        case 'pending_planning': return 'text-amber-500 bg-amber-100 dark:bg-amber-900/30';
        case 'pending_generation':
        case 'generating_content': return 'text-sky-500 bg-sky-100 dark:bg-sky-900/30';
        case 'generation_failed_partially': return 'text-red-500 bg-red-100 dark:bg-red-900/30';
        case 'pending_assignment': return 'text-purple-500 bg-purple-100 dark:bg-purple-900/30';
        case 'completed': return 'text-green-500 bg-green-100 dark:bg-green-900/30';
        case 'error': return 'text-red-600 bg-red-100 dark:bg-red-900/30';
        case 'processing_ocr': return 'text-blue-500 bg-blue-100 dark:bg-blue-900/30';
        case 'archived': return 'text-slate-500 bg-slate-100 dark:bg-slate-700/50';
        default: return 'text-slate-500 bg-slate-100 dark:bg-slate-700/50';
    }
};

const GenerationJobCard: React.FC<GenerationJobCardProps> = ({
    job,
    onPlan, onExecuteGeneration, onSuggestAssignment, onApproveContent, onGenerateMarrowStaged, onGenerateGeneralStaged, onReset, onArchive,
    isPlanning, isExecuting, isSuggestingAssignment, isApprovingContent, isGeneratingMarrowStaged, isGeneratingGeneralStaged, isResetting, isArchiving,
    onRefresh,
    existingTopics,
}) => {
    const { addToast } = useToast();
    const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
    const [isArchiveConfirmOpen, setIsArchiveConfirmOpen] = useState(false);
    const [showContentDetails, setShowContentDetails] = useState(false);
    const [selectedTopicIdForAssignment, setSelectedTopicIdForAssignment] = useState<string>('');
    const [showAssignmentModal, setShowAssignmentModal] = useState(false);
    const [selectedAssignmentSuggestion, setSelectedAssignmentSuggestion] = useState<AssignmentSuggestion | null>(null);

    const handleConfirmReset = () => {
        onReset(job.id);
        setIsResetConfirmOpen(false);
    };

    const handleConfirmArchive = () => {
        onArchive(job.id);
        setIsArchiveConfirmOpen(false);
    };

    const handleApproveClick = (assignment: AssignmentSuggestion) => {
        if (!job.finalAwaitingReviewData || (!job.finalAwaitingReviewData.mcqs?.length && !job.finalAwaitingReviewData.flashcards?.length)) {
            addToast("No content to approve for this job.", "warning");
            return;
        }
        setSelectedAssignmentSuggestion(assignment);
        setShowAssignmentModal(true);
    };

    const handleFinalApprove = () => {
        if (selectedAssignmentSuggestion) {
            onApproveContent(job, selectedAssignmentSuggestion);
            setShowAssignmentModal(false);
            setSelectedAssignmentSuggestion(null);
        }
    };

    const isActionPending = isPlanning || isExecuting || isSuggestingAssignment || isApprovingContent || isGeneratingMarrowStaged || isGeneratingGeneralStaged || isResetting || isArchiving;

    const pipelineSpecificGenerateButton = job.pipeline === 'marrow' ? (
        <button
            onClick={() => onGenerateMarrowStaged(job)}
            disabled={isGeneratingMarrowStaged || isActionPending || job.status !== 'pending_generation' || (job.suggestedPlan?.mcqCount || 0) === 0}
            className="btn-success text-sm py-2 px-3"
        >
            {isGeneratingMarrowStaged ? 'Generating MCQs...' : `Generate ${job.suggestedPlan?.mcqCount || 0} Marrow MCQs`}
        </button>
    ) : (
        <button
            onClick={() => onGenerateGeneralStaged(job)}
            disabled={isGeneratingGeneralStaged || isActionPending || job.status !== 'pending_generation' || ((job.suggestedPlan?.mcqCount || 0) === 0 && (job.suggestedPlan?.flashcardCount || 0) === 0)}
            className="btn-success text-sm py-2 px-3"
        >
            {isGeneratingGeneralStaged ? 'Generating Content...' : `Generate ${job.suggestedPlan?.mcqCount || 0} MCQs & ${job.suggestedPlan?.flashcardCount || 0} FCs`}
        </button>
    );

    const hasErrors = job.errors && job.errors.length > 0;
    const canPlan = job.status === 'pending_planning' || hasErrors;
    const canGenerate = job.status === 'pending_generation';
    const canSuggestAssignment = job.status === 'pending_assignment' && job.finalAwaitingReviewData && (job.finalAwaitingReviewData.mcqs?.length || job.finalAwaitingReviewData.flashcards?.length);
    const canApprove = job.status === 'pending_assignment' && job.assignmentSuggestions && job.assignmentSuggestions.length > 0;

    return (
        <div className="card-base p-4 relative overflow-hidden">
            <h3 className="font-bold text-lg mb-1">{job.title}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
                ID: {job.id.substring(0, 8)}... | Pipeline: {job.pipeline.replace(/_/g, ' ')}
            </p>
            <div className="flex justify-between items-center mb-4">
                <span className={clsx("px-3 py-1 rounded-full text-xs font-semibold", getStatusColorClass(job.status))}>
                    {job.status.replace(/_/g, ' ').toUpperCase()}
                </span>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                    Created: {format(job.createdAt, 'MMM dd, yyyy HH:mm')}
                </p>
            </div>

            {hasErrors && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 p-3 rounded-md mb-4 text-sm">
                    <strong>Errors:</strong> {job.errors?.join(', ') || 'Unknown error.'}
                </div>
            )}

            <div className="space-y-3">
                {job.status === 'processing_ocr' && (
                    <p className="text-sky-600 dark:text-sky-400 animate-pulse text-sm">
                        File processing (OCR/Text Extraction) in progress...
                    </p>
                )}

                {canPlan && (
                    <button
                        onClick={() => onPlan(job)}
                        disabled={isPlanning || isActionPending}
                        className="btn-primary w-full"
                    >
                        {isPlanning ? 'Planning Content...' : 'Plan Content Generation'}
                    </button>
                )}

                {(job.status === 'pending_generation' || job.status === 'generating_content') && job.suggestedPlan && (
                    <div className="flex flex-col gap-2">
                        <p className="text-sm text-slate-600 dark:text-slate-300">
                            Suggested: {job.suggestedPlan.mcqCount} MCQs, {job.suggestedPlan.flashcardCount} Flashcards
                        </p>
                        {pipelineSpecificGenerateButton}
                    </div>
                )}
                
                {job.status === 'pending_assignment' && (
                    <div className="space-y-3">
                        {job.finalAwaitingReviewData && (job.finalAwaitingReviewData.mcqs?.length || job.finalAwaitingReviewData.flashcards?.length) ? (
                            <button
                                onClick={() => onSuggestAssignment(job)}
                                disabled={isSuggestingAssignment || isActionPending}
                                className="btn-secondary w-full"
                            >
                                {isSuggestingAssignment ? 'Suggesting Assignments...' : 'Suggest Assignments'}
                            </button>
                        ) : (
                            <p className="text-amber-600 dark:text-amber-400 text-sm">No content generated. Check logs or reset.</p>
                        )}
                        
                        {job.assignmentSuggestions && job.assignmentSuggestions.length > 0 && (
                            <div className="bg-slate-50 dark:bg-slate-700/50 p-3 rounded-lg space-y-2">
                                <p className="font-semibold text-slate-700 dark:text-slate-200">Assignment Suggestions:</p>
                                {job.assignmentSuggestions.map((suggestion, index) => (
                                    <div key={index} className="border-b last:border-b-0 border-slate-200 dark:border-slate-600 pb-2 mb-2">
                                        <p className="text-sm">
                                            Topic: <span className="font-medium">{suggestion.topicName}</span> &gt; Chapter: <span className="font-medium">{suggestion.chapterName}</span> ({suggestion.isNewChapter ? 'New' : 'Existing'})
                                        </p>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                            MCQs: {suggestion.mcqIndexes?.length || 0} | Flashcards: {suggestion.flashcardIndexes?.length || 0}
                                        </p>
                                        <button
                                            onClick={() => handleApproveClick(suggestion)}
                                            disabled={isApprovingContent || isActionPending}
                                            className="btn-success text-xs py-1 px-2 mt-1"
                                        >
                                            {isApprovingContent ? 'Approving...' : 'Approve This Batch'}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2 justify-end border-t dark:border-slate-700 pt-3">
                <button
                    onClick={() => onRefresh()}
                    className="btn-neutral text-sm"
                    disabled={isActionPending}
                >
                    Refresh Status
                </button>
                <button
                    onClick={() => setIsResetConfirmOpen(true)}
                    className="btn-warning text-sm"
                    disabled={isResetting || isActionPending}
                >
                    {isResetting ? 'Resetting...' : 'Reset Job'}
                </button>
                <button
                    onClick={() => setIsArchiveConfirmOpen(true)}
                    className="btn-danger text-sm"
                    disabled={isArchiving || isActionPending}
                >
                    {isArchiving ? 'Archiving...' : 'Archive Job'}
                </button>
                
                {job.finalAwaitingReviewData && (job.finalAwaitingReviewData.mcqs?.length || job.finalAwaitingReviewData.flashcards?.length) > 0 && (
                     <button
                        onClick={() => setShowContentDetails(!showContentDetails)}
                        className="btn-neutral text-sm"
                        disabled={isActionPending}
                    >
                        {showContentDetails ? 'Hide Generated Content' : 'View Generated Content'}
                    </button>
                )}
            </div>

            {showContentDetails && job.finalAwaitingReviewData && (
                <div className="mt-4 border-t dark:border-slate-700 pt-4">
                    <h4 className="font-bold text-md mb-2">Generated Content (Raw Preview)</h4>
                    {job.finalAwaitingReviewData.mcqs?.length > 0 && (
                        <div className="mb-4">
                            <h5 className="font-semibold text-sm mb-1">MCQs ({job.finalAwaitingReviewData.mcqs.length})</h5>
                            <ul className="list-disc list-inside space-y-1 text-sm text-slate-700 dark:text-slate-300">
                                {job.finalAwaitingReviewData.mcqs.map((mcq, idx) => (
                                    <li key={`mcq-${idx}`}>{mcq.question?.substring(0, 100)}...</li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {job.finalAwaitingReviewData.flashcards?.length > 0 && (
                        <div>
                            <h5 className="font-semibold text-sm mb-1">Flashcards ({job.finalAwaitingReviewData.flashcards.length})</h5>
                            <ul className="list-disc list-inside space-y-1 text-sm text-slate-700 dark:text-slate-300">
                                {job.finalAwaitingReviewData.flashcards.map((fc, idx) => (
                                    <li key={`fc-${idx}`}>{fc.front?.substring(0, 100)}...</li>
                                ))}
                            </ul>
                        </div>
                    )}
                     {!job.finalAwaitingReviewData.mcqs?.length && !job.finalAwaitingReviewData.flashcards?.length && (
                        <p className="text-slate-500 text-sm">No content available in final awaiting review data.</p>
                    )}
                </div>
            )}

            <ConfirmationModal
                isOpen={isResetConfirmOpen}
                onClose={() => setIsResetConfirmOpen(false)}
                onConfirm={handleConfirmReset}
                title="Confirm Reset"
                message="Are you sure you want to reset this job? This will revert it to 'pending_planning' and clear all generated content/suggestions."
                confirmText="Reset"
                variant="danger"
                isLoading={isResetting}
            />

            <ConfirmationModal
                isOpen={isArchiveConfirmOpen}
                onClose={() => setIsArchiveConfirmOpen(false)}
                onConfirm={handleConfirmArchive}
                title="Confirm Archive"
                message="Are you sure you want to archive this job? It will be hidden from the active review queue."
                confirmText="Archive"
                variant="confirm"
                isLoading={isArchiving}
            />

            {selectedAssignmentSuggestion && (
                 <ConfirmationModal
                    isOpen={showAssignmentModal}
                    onClose={() => setShowAssignmentModal(false)}
                    onConfirm={handleFinalApprove}
                    title="Confirm Content Approval"
                    message={`You are about to approve content for topic: "${selectedAssignmentSuggestion.topicName}" and chapter: "${selectedAssignmentSuggestion.chapterName}". This will add ${selectedAssignmentSuggestion.mcqIndexes?.length || 0} MCQs and ${selectedAssignmentSuggestion.flashcardIndexes?.length || 0} Flashcards to the database.`}
                    confirmText="Approve Content"
                    variant="confirm"
                    isLoading={isApprovingContent}
                />
            )}
        </div>
    );
};

export default GenerationJobCard;