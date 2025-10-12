import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getUserUploads } from '@/services/apiService';
// FIX: Import the correct service function for the mutation
import { extractMarrowContent, generateAndAnalyzeMarrowContent } from '@/services/adminService';
import Loader from '@/components/Loader';
import { useToast } from '@/components/Toast';
import { ContentGenerationJob, MCQ } from '@pediaquiz/types';

const AdminMarrowExtractionPage: React.FC = () => {
    const { jobId } = useParams<{ jobId: string }>();
    const navigate = useNavigate();
    const { addToast } = useToast();
    const queryClient = useQueryClient();

    const [mcqCountToGenerate, setMcqCountToGenerate] = useState(0);

    const { data: job, isLoading } = useQuery({
        queryKey: ['marrowJob', jobId],
        queryFn: async () => {
            if (!jobId) return null;
            const res = await getUserUploads({ uploadIds: [jobId] });
            const jobData = res.data.uploads[0] as ContentGenerationJob;
            setMcqCountToGenerate(jobData.stagedContent?.orphanExplanations?.length || 0);
            return jobData;
        },
        enabled: !!jobId,
    });

    const extractMutation = useMutation({
        mutationFn: () => extractMarrowContent({ uploadId: jobId! }),
        onSuccess: () => {
            addToast('Content extracted successfully!', 'success');
            queryClient.invalidateQueries({ queryKey: ['marrowJob', jobId] });
        },
        onError: (error: any) => addToast(`Extraction failed: ${error.message}`, 'error'),
    });
    
    // FIX: The mutationFn must call an async service function.
    // The placeholder was incorrect. This now correctly calls the imported `generateAndAnalyzeMarrowContent`.
    const generateAndAnalyzeMutation = useMutation({
        mutationFn: (count: number) => generateAndAnalyzeMarrowContent({ uploadId: jobId!, count }),
        onSuccess: () => {
            addToast('Generation & analysis started!', 'success');
            // Navigate to the next step in the Marrow pipeline
            navigate(`/admin/marrow-approve/${jobId}`);
        },
        onError: (error: any) => addToast(`Generation failed: ${error.message}`, 'error'),
    });

    if (isLoading) return <Loader fullScreen message="Loading Marrow job..." />;
    if (!job) return <div className="text-center p-10">Job not found.</div>;

    const stagedContent = job.stagedContent;
    const isExtracted = !!stagedContent;
    const orphanExplanationsCount = stagedContent?.orphanExplanations?.length || 0;

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-6">
            <h1 className="text-3xl font-bold">Marrow Content Extraction: {job.title}</h1>

            {!isExtracted ? (
                <div className="card-base p-6 text-center">
                    <p className="mb-4">The raw text is ready for AI extraction. This will separate existing MCQs from text-only "orphan explanations".</p>
                    <button onClick={() => extractMutation.mutate()} disabled={extractMutation.isPending} className="btn-primary">
                        {extractMutation.isPending ? 'Extracting...' : '🤖 Start AI Extraction'}
                    </button>
                </div>
            ) : (
                <>
                    <div className="card-base p-6">
                        <h2 className="text-2xl font-bold mb-4">Step 2: Generate New MCQs</h2>
                        <p className="mb-4">AI found <span className="font-bold">{orphanExplanationsCount}</span> text blocks (orphan explanations). How many of these should be converted into new MCQs?</p>
                        <div className="flex items-center gap-4">
                             <label className="font-medium">MCQs to Generate:</label>
                             <input type="number" min="0" max={orphanExplanationsCount} value={mcqCountToGenerate} onChange={(e) => setMcqCountToGenerate(Number(e.target.value))} className="input-field w-24"/>
                        </div>
                        <button onClick={() => generateAndAnalyzeMutation.mutate(mcqCountToGenerate)} disabled={generateAndAnalyzeMutation.isPending} className="btn-success w-full mt-4">
                            {generateAndAnalyzeMutation.isPending ? 'Generating...' : `Generate ${mcqCountToGenerate} MCQs & Analyze`}
                        </button>
                    </div>

                    <div className="card-base p-6">
                        <h2 className="text-2xl font-bold mb-4">Extracted Content</h2>
                        <h3 className="text-xl font-semibold mt-4">Extracted MCQs ({stagedContent.extractedMcqs?.length || 0})</h3>
                        <div className="space-y-3 mt-2 max-h-96 overflow-y-auto">
                            {(stagedContent.extractedMcqs as Partial<MCQ>[])?.map((mcq, i) => (
                                <div key={i} className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                                    <p className="font-semibold">{mcq.question}</p>
                                </div>
                            ))}
                        </div>

                         <h3 className="text-xl font-semibold mt-6">Orphan Explanations ({orphanExplanationsCount})</h3>
                         <div className="space-y-3 mt-2 max-h-96 overflow-y-auto">
                            {stagedContent.orphanExplanations?.map((text, i) => (
                                <div key={i} className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-sm">
                                    <p>{text}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default AdminMarrowExtractionPage;