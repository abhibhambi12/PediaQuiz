import React from 'react';
import { Link } from 'react-router-dom';
import { ContentGenerationJob } from '@pediaquiz/types';
import { safeToDate } from '@/utils/dateUtils';
import clsx from 'clsx';
import { ArrowRightIcon, ArchiveBoxIcon, ArrowUturnLeftIcon } from '@heroicons/react/24/solid';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { archiveUpload, resetUpload } from '@/services/apiService';
import { useToast } from './Toast';
import type { HttpsCallableResult } from 'firebase/functions';

const statusConfig = {
    pending_ocr: { label: 'Awaiting OCR', color: 'bg-slate-100 text-slate-800', action: null },
    ocr_review: { label: 'Review Text', color: 'bg-amber-100 text-amber-800', action: 'Review Text' },
    generating_content: { label: 'Generating Content', color: 'bg-indigo-100 text-indigo-800', action: null },
    content_review: { label: 'Review Generated Content', color: 'bg-sky-100 text-sky-800', action: 'Review & Approve' },
    pending_generation_decision: { label: 'Marrow: Awaiting Extraction', color: 'bg-purple-100 text-purple-800', action: 'Extract Content' },
    pending_assignment: { label: 'Marrow: Final Approval', color: 'bg-teal-100 text-teal-800', action: 'Approve & Assign' },
    completed: { label: 'Completed', color: 'bg-emerald-100 text-emerald-800', action: null },
    error: { label: 'Error', color: 'bg-red-100 text-red-800', action: null },
    default: { label: 'Unknown', color: 'bg-gray-100 text-gray-800', action: null },
};

const getActionLink = (job: ContentGenerationJob): string | null => {
    switch (job.status) {
        case 'ocr_review':
            return job.pipeline === 'marrow' 
                ? `/admin/marrow-extract/${job.id}` 
                : `/admin/ocr-review/${job.id}`;
        case 'content_review':
            return `/admin/content-review/${job.id}`;
        case 'pending_generation_decision':
            return `/admin/marrow-extract/${job.id}`;
        case 'pending_assignment':
            return `/admin/marrow-approve/${job.id}`;
        default:
            return null;
    }
};

const AdminJobCard: React.FC<{ job: ContentGenerationJob }> = ({ job }) => {
    const queryClient = useQueryClient();
    const { addToast } = useToast();
    const config = statusConfig[job.status as keyof typeof statusConfig] || statusConfig.default;
    const actionLink = getActionLink(job);

    const mutationOptions = {
        onSuccess: (response: HttpsCallableResult<{ success: boolean; message: string; }>) => {
            addToast(response.data.message || 'Action successful!', 'success');
            queryClient.invalidateQueries({ queryKey: ['adminReviewJobs'] });
        },
        onError: (error: any) => {
            addToast(`Action failed: ${error.message}`, 'error');
        }
    };

    const archiveMutation = useMutation({ mutationFn: () => archiveUpload({ uploadId: job.id }), ...mutationOptions });
    const resetMutation = useMutation({ mutationFn: () => resetUpload({ uploadId: job.id }), ...mutationOptions });

    const isActionable = ['ocr_review', 'content_review', 'pending_generation_decision', 'pending_assignment', 'error'].includes(job.status);

    return (
        <div className={clsx("card-base flex flex-col justify-between border-2", {
            'border-red-500/50': job.status === 'error',
            'border-transparent': job.status !== 'error'
        })}>
            <div>
                <div className="flex justify-between items-start">
                    <h3 className="font-bold truncate flex-1 pr-2">{job.title || job.fileName}</h3>
                    <div className="flex-shrink-0 flex items-center gap-2">
                         {isActionable && (
                            <button onClick={() => resetMutation.mutate()} title="Reset Job to Start" disabled={resetMutation.isPending} className="p-1 text-slate-400 hover:text-sky-500">
                                <ArrowUturnLeftIcon className="h-4 w-4"/>
                            </button>
                         )}
                         <button onClick={() => archiveMutation.mutate()} title="Archive Job" disabled={archiveMutation.isPending} className="p-1 text-slate-400 hover:text-amber-500">
                            <ArchiveBoxIcon className="h-4 w-4"/>
                         </button>
                    </div>
                </div>
                <p className="text-xs text-slate-500 mb-2">{safeToDate(job.createdAt).toLocaleString()}</p>
                <span className={clsx("text-xs font-semibold px-2 py-1 rounded-full", config.color)}>
                    {config.label}
                </span>
                {job.status === 'error' && Array.isArray(job.errors) && job.errors.length > 0 && (
                  <p className="text-xs text-red-500 mt-2 break-words">Error: {job.errors[job.errors.length - 1]}</p>
                )}
            </div>
            {actionLink && config.action && (
                <Link to={actionLink} className="btn-primary mt-4 text-sm w-full flex items-center justify-center gap-2">
                    {config.action}
                    <ArrowRightIcon className="h-4 w-4" />
                </Link>
            )}
        </div>
    );
};

export default AdminJobCard;