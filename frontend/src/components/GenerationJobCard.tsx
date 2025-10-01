import React from 'react';
import { UserUpload } from '@pediaquiz/types';
import { safeToDate } from '@/utils/dateUtils';
import clsx from 'clsx';

interface GenerationJobCardProps {
  job: UserUpload;
  onSelect: (jobId: string) => void;
}

const GenerationJobCard: React.FC<GenerationJobCardProps> = ({ job, onSelect }) => {
  const statusColor = {
    completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    generating_batch: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
    pending_approval: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    default: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300',
  };

  const colorClass = statusColor[job.status as keyof typeof statusColor] || statusColor.default;

  return (
    <div
      className="card-base p-4 cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => onSelect(job.id)}
    >
      <div className="flex justify-between items-start">
        <h3 className="font-bold text-lg flex-1 truncate pr-2">{job.title || job.fileName}</h3>
        <span className={clsx("text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap", colorClass)}>
          {job.status.replace(/_/g, ' ')}
        </span>
      </div>
      <p className="text-sm text-slate-500 mt-1">
        Created: {safeToDate(job.createdAt).toLocaleDateString()}
      </p>
    </div>
  );
};

export default GenerationJobCard;