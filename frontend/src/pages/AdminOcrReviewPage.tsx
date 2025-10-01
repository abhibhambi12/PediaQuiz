import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getUserUploads } from '@/services/apiService';
import { generateContentFromText } from '@/services/adminService';
import Loader from '@/components/Loader';
import { useToast } from '@/components/Toast';
import { UserUpload } from '@pediaquiz/types';

const AdminOcrReviewPage: React.FC = () => {
    const { jobId } = useParams<{ jobId: string }>();
    const navigate = useNavigate();
    const { addToast } = useToast();
    const queryClient = useQueryClient();
    
    const [editedText, setEditedText] = useState('');
    const [mcqCount, setMcqCount] = useState(10);
    const [flashcardCount, setFlashcardCount] = useState(5);

    const { data: upload, isLoading } = useQuery({
        queryKey: ['userUpload', jobId],
        queryFn: async () => {
            if (!jobId) return null;
            const res = await getUserUploads({ uploadIds: [jobId] });
            return res.data.uploads[0] as UserUpload;
        },
        enabled: !!jobId,
    });

    useEffect(() => {
        if (upload?.sourceText) {
            setEditedText(upload.sourceText);
        }
    }, [upload]);

    const mutation = useMutation({
        mutationFn: generateContentFromText,
        onSuccess: () => {
            addToast('Content generation started!', 'success');
            queryClient.invalidateQueries({ queryKey: ['userUpload', jobId] });
            navigate(`/admin/content-review/${jobId}`);
        },
        onError: (error: any) => {
            addToast(`Generation failed: ${error.message}`, 'error');
        }
    });

    const handleGenerate = () => {
        if (!jobId) return;
        mutation.mutate({ jobId, text: editedText, mcqCount, flashcardCount });
    };

    if (isLoading) return <Loader fullScreen message="Loading OCR text..." />;
    if (!upload) return <div className="text-center p-10">Job not found.</div>;

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <h1 className="text-3xl font-bold">Review Extracted Text</h1>
            <p className="text-slate-500">Review and correct any errors in the text extracted from the PDF before generating content.</p>

            <div className="card-base p-6 space-y-4">
                <textarea 
                    value={editedText}
                    onChange={(e) => setEditedText(e.target.value)}
                    className="input-field w-full h-96 min-h-[60vh]"
                />
                <div className="flex flex-wrap gap-4 items-center">
                    <label>MCQs: <input type="number" value={mcqCount} onChange={e => setMcqCount(Number(e.target.value))} className="input-field w-24" /></label>
                    <label>Flashcards: <input type="number" value={flashcardCount} onChange={e => setFlashcardCount(Number(e.target.value))} className="input-field w-24" /></label>
                </div>
                <button onClick={handleGenerate} disabled={mutation.isPending} className="btn-primary w-full sm:w-auto">
                    {mutation.isPending ? 'Generating...' : 'Generate Content'}
                </button>
            </div>
        </div>
    );
};

export default AdminOcrReviewPage;