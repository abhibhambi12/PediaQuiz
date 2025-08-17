import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/firebase';
import Loader from '@/components/Loader';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/contexts/AuthContext'; // To get userId for job creation

// Callable function to process manual text input (backend function: processManualTextInput)
const processManualTextInputFn = httpsCallable<{ fileName: string, rawText: string, isMarrow: boolean }, { success: boolean, uploadId: string, message: string }>(functions, 'processManualTextInput');

const GeneratorPage: React.FC = () => {
    const { user } = useAuth();
    const [title, setTitle] = useState('');
    const [rawText, setRawText] = useState('');
    const [isMarrowContent, setIsMarrowContent] = useState(false);
    const { addToast } = useToast();
    const queryClient = useQueryClient();

    const processTextInputMutation = useMutation({
        mutationFn: (data: { fileName: string, rawText: string, isMarrow: boolean }) => processManualTextInputFn(data),
        onSuccess: (data) => {
            addToast(data.data.message, 'success');
            setTitle('');
            setRawText('');
            setIsMarrowContent(false);
            // Invalidate admin job queries to show the new job in the dashboard
            queryClient.invalidateQueries({ queryKey: ['pendingUploads'] });
            queryClient.invalidateQueries({ queryKey: ['marrowUploads'] });
        },
        onError: (error: any) => {
            console.error('Failed to process text input:', error);
            addToast(`Failed to submit content: ${error.message}`, 'error');
        },
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!rawText.trim()) {
            addToast("Text content cannot be empty.", "error");
            return;
        }
        if (!title.trim()) {
            addToast("A title for the content is required.", "error");
            return;
        }
        if (!user) {
            addToast("You must be logged in to submit content.", "error");
            return;
        }

        processTextInputMutation.mutate({
            fileName: title.trim(), // Use title as filename for text input
            rawText: rawText.trim(),
            isMarrow: isMarrowContent,
        });
    };

    return (
        <div className="p-6 max-w-3xl mx-auto">
            <h1 className="text-3xl font-bold mb-6">Content Uploader & Manual Input</h1>

            <form onSubmit={handleSubmit} className="card-base p-6 space-y-4">
                <div>
                    <label htmlFor="contentTitle" className="block text-sm font-medium mb-1">Content Title (for job tracking)</label>
                    <input
                        id="contentTitle"
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="e.g., Pediatric Cardiology Notes"
                        className="input-field"
                        disabled={processTextInputMutation.isPending}
                    />
                </div>
                <div>
                    <label htmlFor="rawTextInput" className="block text-sm font-medium mb-1">Paste Raw Text Content</label>
                    <textarea
                        id="rawTextInput"
                        value={rawText}
                        onChange={(e) => setRawText(e.target.value)}
                        className="input-field h-64 resize-y"
                        placeholder="Paste your medical notes, Marrow explanations, or general text here."
                        disabled={processTextInputMutation.isPending}
                    />
                </div>
                <div className="flex items-center">
                    <input
                        id="isMarrowContent"
                        type="checkbox"
                        checked={isMarrowContent}
                        onChange={(e) => setIsMarrowContent(e.target.checked)}
                        className="h-4 w-4 text-sky-600 focus:ring-sky-500 border-gray-300 rounded"
                        disabled={processTextInputMutation.isPending}
                    />
                    <label htmlFor="isMarrowContent" className="ml-2 block text-sm text-slate-700 dark:text-slate-300">
                        Is this Marrow-specific content (for Marrow pipeline)?
                    </label>
                </div>
                <button
                    type="submit"
                    className="btn-primary w-full"
                    disabled={processTextInputMutation.isPending || !rawText.trim() || !title.trim()}
                >
                    {processTextInputMutation.isPending ? <Loader message="Submitting..." /> : 'Submit for AI Processing'}
                </button>
            </form>
        </div>
    );
};

export default GeneratorPage;