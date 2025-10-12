import React from 'react';
import { useMutation } from '@tanstack/react-query';
import { useToast } from '@/components/Toast';
import { recalculateAllCounts } from '@/services/apiService';
import { ArrowPathIcon } from '@heroicons/react/24/solid';

const AdminToolsPage: React.FC = () => {
    const { addToast } = useToast();

    const recountMutation = useMutation({
        mutationFn: recalculateAllCounts,
        onSuccess: (response) => {
            addToast(response.data.message || 'Recount successful!', 'success');
        },
        onError: (error: any) => {
            addToast(`Recount failed: ${error.message}`, 'error');
        },
    });

    return (
        <div className="p-6 max-w-2xl mx-auto space-y-6">
            <h1 className="text-3xl font-bold">Admin Tools</h1>
            
            <div className="card-base p-6">
                <h2 className="text-xl font-bold">Database Maintenance</h2>
                <p className="text-slate-500 mt-2 mb-4">
                    If you notice that topic or chapter counts for MCQs and Flashcards are incorrect (e.g., after a large data import or a suspected bug), you can run this tool to fix them. It will recount all content in the database and update the totals.
                </p>
                <button
                    onClick={() => recountMutation.mutate()}
                    disabled={recountMutation.isPending}
                    className="btn-secondary flex items-center gap-2"
                >
                    <ArrowPathIcon className="h-5 w-5" />
                    {recountMutation.isPending ? 'Recalculating...' : 'Recalculate All Content Counts'}
                </button>
            </div>
        </div>
    );
};

export default AdminToolsPage;