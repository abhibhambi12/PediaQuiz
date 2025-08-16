// workspaces/frontend/src/pages/AdminReviewPage.tsx
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '@/firebase';
import { useToast } from '@/components/Toast';
import Loader from '@/components/Loader';
import GenerationJobCard from '@/components/GenerationJobCard';
import { ContentGenerationJob, PediaquizTopicType, AssignmentSuggestion, MCQ, Flashcard } from '@pediaquiz/types';
import { planContentGeneration, executeContentGeneration, suggestAssignment, approveGeneratedContent, generateAndStageMarrowMcqs, generateGeneralContent, resetUpload, archiveUpload } from '@/services/aiService';
import { getTopics } from '@/services/firestoreService';

const AdminReviewPage: React.FC = () => {
    const queryClient = useQueryClient();
    const { addToast } = useToast();
    const [selectedJob, setSelectedJob] = useState<ContentGenerationJob | null>(null);

    const { data: jobs, isLoading, refetch } = useQuery<ContentGenerationJob[], Error>({
        queryKey: ['generationJobs'],
        queryFn: async () => {
            const q = query(
                collection(db, 'contentGenerationJobs'),
                where('status', 'in', ['pending_planning', 'pending_generation', 'generating_content', 'generation_failed_partially', 'pending_assignment', 'error']),
                orderBy('createdAt', 'desc')
            );
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ContentGenerationJob));
        },
    });

    const { data: existingTopics, isLoading: isLoadingTopics } = useQuery<PediaquizTopicType[]>({
        queryKey: ['allTopicsForAssignment'],
        queryFn: getTopics,
        staleTime: 1000 * 60 * 60,
    });

    const planMutation = useMutation({
        mutationFn: planContentGeneration,
        onSuccess: () => {
            addToast("Content plan created successfully!", 'success');
            refetch();
        },
        onError: (error: Error) => addToast(`Failed to create plan: ${error.message}`, 'danger'),
    });

    const executeGenerationMutation = useMutation({
        mutationFn: executeContentGeneration,
        onSuccess: (data) => {
            addToast(data.message || "Content generation started/completed!", 'success');
            refetch();
        },
        onError: (error: Error) => addToast(`Failed to generate content: ${error.message}`, 'danger'),
    });

    const suggestAssignmentMutation = useMutation({
        mutationFn: suggestAssignment,
        onSuccess: (data) => {
            addToast("Assignment suggestions generated!", 'success');
            refetch();
        },
        onError: (error: Error) => addToast(`Failed to suggest assignments: ${error.message}`, 'danger'),
    });

    const approveContentMutation = useMutation({
        mutationFn: approveGeneratedContent,
        onSuccess: (data) => {
            addToast(data.message || "Content approved and added to library!", 'success');
            queryClient.invalidateQueries({ queryKey: ['topics'] });
            queryClient.invalidateQueries({ queryKey: ['allTopicsForAssignment'] });
            refetch();
        },
        onError: (error: Error) => addToast(`Failed to approve content: ${error.message}`, 'danger'),
    });

    const generateMarrowStagedContentMutation = useMutation({
        mutationFn: generateAndStageMarrowMcqs,
        onSuccess: (data) => {
            addToast(data.message || "Marrow content generation started!", 'success');
            refetch();
        },
        onError: (error: Error) => addToast(`Failed to generate Marrow content: ${error.message}`, 'danger'),
    });

    const generateGeneralStagedContentMutation = useMutation({
        mutationFn: generateGeneralContent,
        onSuccess: (data) => {
            addToast(data.message || "General content generation started!", 'success');
            refetch();
        },
        onError: (error: Error) => addToast(`Failed to generate General content: ${error.message}`, 'danger'),
    });

    const resetUploadMutation = useMutation({
        mutationFn: resetUpload,
        onSuccess: (data) => {
            addToast(data.message || "Job reset successfully.", 'success');
            refetch();
        },
        onError: (error: Error) => addToast(`Failed to reset job: ${error.message}`, 'danger'),
    });

    const archiveUploadMutation = useMutation({
        mutationFn: archiveUpload,
        onSuccess: (data) => {
            addToast(data.message || "Job archived successfully.", 'success');
            refetch();
        },
        onError: (error: Error) => addToast(`Failed to archive job: ${error.message}`, 'danger'),
    });

    const handlePlanJob = (job: ContentGenerationJob) => {
        planMutation.mutate({ jobId: job.id });
    };

    const handleExecuteGeneration = (job: ContentGenerationJob) => {
        if (!job.suggestedPlan) {
            addToast("No generation plan found for this job. Please plan first.", "warning");
            return;
        }
        executeGenerationMutation.mutate({ 
            jobId: job.id, 
            mcqCount: job.suggestedPlan.mcqCount, 
            flashcardCount: job.suggestedPlan.flashcardCount 
        });
    };

    const handleSuggestAssignment = (job: ContentGenerationJob) => {
        if (!existingTopics) {
            addToast("Existing topics data not loaded yet.", "warning");
            return;
        }
        suggestAssignmentMutation.mutate({
            jobId: job.id,
            existingTopics: existingTopics,
        });
    };

    const handleApproveContent = (job: ContentGenerationJob, assignment: AssignmentSuggestion) => {
        if (!job.finalAwaitingReviewData) {
            addToast("No final content data available for approval.", "warning");
            return;
        }
        
        const mcqsToApprove = (assignment.mcqIndexes || []).map(idx => job.finalAwaitingReviewData?.mcqs?.[idx]).filter(Boolean);
        const flashcardsToApprove = (assignment.flashcardIndexes || []).map(idx => job.finalAwaitingReviewData?.flashcards?.[idx]).filter(Boolean);

        if (mcqsToApprove.length === 0 && flashcardsToApprove.length === 0) {
            addToast("No content selected for this assignment group.", "warning");
            return;
        }

        approveContentMutation.mutate({
            jobId: job.id,
            topicId: assignment.topicName.replace(/\s+/g, '_').toLowerCase(),
            topicName: assignment.topicName,
            chapterId: assignment.chapterName.replace(/\s+/g, '_').toLowerCase(),
            chapterName: assignment.chapterName,
            keyTopics: undefined,
            summaryNotes: undefined,
            generatedMcqs: mcqsToApprove as Partial<MCQ>[],
            generatedFlashcards: flashcardsToApprove as Partial<Flashcard>[],
            pipeline: job.pipeline,
        });
    };

    const handleGenerateMarrowStaged = (job: ContentGenerationJob) => {
        if (!job.suggestedPlan?.mcqCount) {
            addToast("No suggested MCQ count for Marrow generation. Please plan first.", "warning");
            return;
        }
        generateMarrowStagedContentMutation.mutate({ uploadId: job.id, count: job.suggestedPlan.mcqCount });
    };

    const handleGenerateGeneralStaged = (job: ContentGenerationJob) => {
        if (!job.suggestedPlan?.mcqCount && !job.suggestedPlan?.flashcardCount) {
            addToast("No suggested content counts for General generation. Please plan first.", "warning");
            return;
        }
        generateGeneralStagedContentMutation.mutate({ uploadId: job.id, count: job.suggestedPlan.mcqCount || 0 });
    };

    const handleResetJob = (jobId: string) => {
        resetUploadMutation.mutate({ uploadId: jobId });
    };

    const handleArchiveJob = (jobId: string) => {
        archiveUploadMutation.mutate({ uploadId: jobId });
    };


    if (isLoading || isLoadingTopics) {
        return <Loader message="Loading review queue..." />;
    }

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">Admin Review Queue</h1>
            <p className="text-slate-500">
                Jobs that require manual action (planning, generation, or assignment) appear here.
            </p>
            {jobs && jobs.length > 0 ? (
                <div className="space-y-4">
                    {jobs.map(job => (
                        <GenerationJobCard
                            key={job.id}
                            job={job}
                            onPlan={handlePlanJob}
                            onExecuteGeneration={handleExecuteGeneration}
                            onSuggestAssignment={handleSuggestAssignment}
                            onApproveContent={handleApproveContent}
                            onGenerateMarrowStaged={handleGenerateMarrowStaged}
                            onGenerateGeneralStaged={handleGenerateGeneralStaged}
                            onReset={handleResetJob}
                            onArchive={handleArchiveJob}
                            isPlanning={planMutation.isPending && planMutation.variables?.jobId === job.id}
                            isExecuting={executeGenerationMutation.isPending && executeGenerationMutation.variables?.jobId === job.id}
                            isSuggestingAssignment={suggestAssignmentMutation.isPending && suggestAssignmentMutation.variables?.jobId === job.id}
                            isApprovingContent={approveContentMutation.isPending && approveContentMutation.variables?.jobId === job.id}
                            isGeneratingMarrowStaged={generateMarrowStagedContentMutation.isPending && generateMarrowStagedContentMutation.variables?.uploadId === job.id}
                            isGeneratingGeneralStaged={generateGeneralStagedContentMutation.isPending && generateGeneralStagedContentMutation.variables?.uploadId === job.id}
                            isResetting={resetUploadMutation.isPending && resetUploadMutation.variables?.uploadId === job.id}
                            isArchiving={archiveUploadMutation.isPending && archiveUploadMutation.variables?.uploadId === job.id}
                            onRefresh={refetch}
                            existingTopics={existingTopics || []}
                        />
                    ))}
                </div>
            ) : (
                <div className="text-center py-10 card-base">
                    <p className="text-slate-500">The review queue is empty.</p>
                </div>
            )}
        </div>
    );
};

export default AdminReviewPage;