import React from 'react';
import { Link } from 'react-router-dom';
import { ContentGenerationJob } from '@pediaquiz/types';
import { safeToDate } from '@/utils/dateUtils';
import clsx from 'clsx';
import { ArrowRightIcon } from '@heroicons/react/24/solid';

interface AdminJobCardProps { 
  job: ContentGenerationJob;
}

const statusConfig = {
    pending_ocr: { label: 'Awaiting OCR', color: 'bg-slate-100 text-slate-800', action: null },
    ocr_review: { label: 'Review OCR Text', color: 'bg-amber-100 text-amber-800', action: 'Review & Generate' },
    generating_content: { label: 'Generating Content', color: 'bg-indigo-100 text-indigo-800', action: null },
    content_review: { label: 'Review Generated Content', color: 'bg-sky-100 text-sky-800', action: 'Review & Approve' },
    completed: { label: 'Completed', color: 'bg-emerald-100 text-emerald-800', action: null },
    error: { label: 'Error', color: 'bg-red-100 text-red-800', action: null },
    default: { label: 'Unknown', color: 'bg-gray-100 text-gray-800', action: null },
};

const getActionLink = (job: ContentGenerationJob): string | null => {
    switch (job.status) {
        case 'ocr_review':
            return `/admin/ocr-review/${job.id}`;
        case 'content_review':
            return `/admin/content-review/${job.id}`;
        default:
            return null;
    }
};

const AdminJobCard: React.FC<AdminJobCardProps> = ({ job }) => {
    const config = statusConfig[job.status as keyof typeof statusConfig] || statusConfig.default;
    const actionLink = getActionLink(job);

    return (
        <div className="card-base flex flex-col justify-between">
            <div>
                <h3 className="font-bold truncate">{job.fileName || job.title}</h3>
                <p className="text-xs text-slate-500 mb-2">{safeToDate(job.createdAt).toLocaleString()}</p>
                <span className={clsx("text-xs font-semibold px-2 py-1 rounded-full", config.color)}>
                    {config.label}
                </span>
                {job.status === 'error' && Array.isArray(job.errors) && job.errors.length > 0 && (
                  <p className="text-xs text-red-500 mt-2">{job.errors[0]}</p>
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