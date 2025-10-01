import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getGeneratedContentForReview } from '@/services/adminService';
import { approveContent } from '@/services/apiService';
import { useData } from '@/contexts/DataContext';
import Loader from '@/components/Loader';
import { useToast } from '@/components/Toast';
import type { AwaitingReviewData, AssignmentSuggestion, Topic, Chapter } from '@pediaquiz/types';

const AdminContentViewerPage: React.FC = () => {
    const { jobId } = useParams<{ jobId: string }>();
    const navigate = useNavigate();
    const { addToast } = useToast();
    const queryClient = useQueryClient();
    const { appData, refetchAppData } = useData();

    const [content, setContent] = useState<AwaitingReviewData>({ mcqs: [], flashcards: [] });
    const [topicName, setTopicName] = useState('');
    const [chapterName, setChapterName] = useState('');

    const { isLoading } = useQuery({
        queryKey: ['generatedContent', jobId],
        queryFn: async () => {
            if (!jobId) return null;
            const res = await getGeneratedContentForReview({ jobId });
            const data = res.data as AwaitingReviewData & { suggestedTopic?: string; suggestedChapter?: string };
            setContent(data);
            if (data.suggestedTopic) setTopicName(data.suggestedTopic);
            if (data.suggestedChapter) setChapterName(data.suggestedChapter);
            return data;
        },
        enabled: !!jobId,
    });
    
    const approveMutation = useMutation({
        mutationFn: approveContent,
        onSuccess: async () => {
            addToast('Content approved and saved!', 'success');
            await refetchAppData();
            queryClient.invalidateQueries({ queryKey: ['adminReviewJobs'] });
            navigate('/admin/review');
        },
        onError: (error: any) => addToast(`Approval failed: ${error.message}`, 'error'),
    });

    const handleApprove = () => {
        if (!jobId || !topicName || !chapterName) {
            addToast('Topic and Chapter names are required.', 'warning');
            return;
        }

        const topic = appData?.topics.find((t: Topic) => t.name === topicName);
        const isNewChapter = !topic || !Array.isArray(topic.chapters) || !topic.chapters.some((c: Chapter) => c.name === chapterName);

        const assignments: AssignmentSuggestion[] = [{
            topicName,
            chapterName,
            isNewChapter,
            mcqs: content.mcqs || [],
            flashcards: content.flashcards || [],
        }];

        approveMutation.mutate({ uploadId: jobId, assignments });
    };

    if (isLoading) return <Loader fullScreen message="Loading generated content..." />;
    
    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <h1 className="text-3xl font-bold">Review Generated Content</h1>
            <div className="card-base p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input type="text" value={topicName} onChange={e => setTopicName(e.target.value)} placeholder="Topic Name" className="input-field" />
                    <input type="text" value={chapterName} onChange={e => setChapterName(e.target.value)} placeholder="Chapter Name" className="input-field" />
                </div>
                <button onClick={handleApprove} disabled={approveMutation.isPending} className="btn-success w-full">
                    {approveMutation.isPending ? 'Saving...' : 'Approve & Save All'}
                </button>
            </div>

            <div className="space-y-4">
                <h2 className="text-2xl font-bold">MCQs ({content.mcqs?.length})</h2>
                {content.mcqs?.map((mcq, index) => (
                    <div key={index} className="card-base p-4">
                        <p className="font-semibold">{mcq.question}</p>
                        <ul className="list-disc pl-5 mt-2 text-sm">
                            {mcq.options?.map((opt, i) => <li key={i}>{opt}</li>)}
                        </ul>
                    </div>
                ))}

                <h2 className="text-2xl font-bold mt-8">Flashcards ({content.flashcards?.length})</h2>
                {content.flashcards?.map((fc, index) => (
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