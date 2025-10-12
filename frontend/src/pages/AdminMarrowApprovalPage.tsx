import React, { useState } from 'react'; // FIX: Removed unused `useEffect` import
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getUserUploads, approveMarrowContent } from '@/services/apiService';
import Loader from '@/components/Loader';
import { useToast } from '@/components/Toast';
import { ContentGenerationJob } from '@pediaquiz/types'; // FIX: Removed unused `MCQ` import

const AdminMarrowApprovalPage: React.FC = () => {
    const { jobId } = useParams<{ jobId: string }>();
    const navigate = useNavigate();
    const { addToast } = useToast();
    const queryClient = useQueryClient();

    const [topicName, setTopicName] = useState('');
    const [chapterName, setChapterName] = useState('');
    const [keyTopics, setKeyTopics] = useState<string[]>([]);

    const { data: job, isLoading } = useQuery({
        queryKey: ['marrowApprovalJob', jobId],
        queryFn: async () => {
            if (!jobId) return null;
            const res = await getUserUploads({ uploadIds: [jobId] });
            const jobData = res.data.uploads[0] as ContentGenerationJob;
            // Pre-fill state with AI suggestions
            setTopicName(jobData.suggestedTopic || '');
            setChapterName(jobData.suggestedChapter || '');
            setKeyTopics(jobData.suggestedKeyTopics || []);
            return jobData;
        },
        enabled: !!jobId,
    });
    
    const approveMutation = useMutation({
        mutationFn: approveMarrowContent,
        onSuccess: () => {
            addToast('Marrow content approved and saved!', 'success');
            queryClient.invalidateQueries({ queryKey: ['adminReviewJobs'] });
            queryClient.invalidateQueries({ queryKey: ['appData'] });
            navigate('/admin/review');
        },
        onError: (error: any) => addToast(`Approval failed: ${error.message}`, 'error'),
    });

    const handleApprove = () => {
        if (!jobId || !topicName.trim() || !chapterName.trim()) {
            return addToast('Topic and Chapter names are required.', 'warning');
        }
        approveMutation.mutate({
            uploadId: jobId,
            topicName: topicName.trim(),
            chapterName: chapterName.trim(),
            keyTopics: keyTopics.filter(t => t.trim()),
        });
    };

    if (isLoading) return <Loader fullScreen message="Loading final Marrow review..." />;
    if (!job) return <div className="text-center p-10">Job not found.</div>;

    const allMcqs = [
        ...(job.stagedContent?.extractedMcqs || []), 
        ...(job.stagedContent?.generatedMcqs || [])
    ];

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-6">
            <h1 className="text-3xl font-bold">Final Approval: {job.title}</h1>
            
            <div className="card-base p-6 space-y-4 sticky top-20 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md z-10">
                <h2 className="text-2xl font-bold">Classification (AI Suggested)</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label>Topic Name <input type="text" value={topicName} onChange={e => setTopicName(e.target.value)} className="input-field mt-1" /></label>
                    <label>Chapter Name <input type="text" value={chapterName} onChange={e => setChapterName(e.target.value)} className="input-field mt-1" /></label>
                </div>
                <label>Key Topics (comma-separated)<input type="text" value={keyTopics.join(', ')} onChange={e => setKeyTopics(e.target.value.split(',').map(t => t.trim()))} className="input-field mt-1" /></label>
                <button onClick={handleApprove} disabled={approveMutation.isPending} className="btn-success w-full">
                    {approveMutation.isPending ? 'Saving...' : `✅ Approve & Save ${allMcqs.length} MCQs`}
                </button>
            </div>
            
             <div className="card-base p-6">
                <h2 className="text-2xl font-bold mb-4">Content to be Saved</h2>
                <div className="space-y-3 mt-2 max-h-[70vh] overflow-y-auto">
                    {allMcqs.map((mcq, i) => (
                        <div key={i} className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg border dark:border-slate-600">
                            <p className="font-semibold">{i + 1}. {mcq.question}</p>
                            <ul className="list-disc pl-5 mt-2 text-sm space-y-1">
                                {mcq.options?.map(opt => <li key={opt}>{opt}</li>)}
                            </ul>
                            <p className="text-sm mt-2"><strong>Answer: </strong>{mcq.answer}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default AdminMarrowApprovalPage;