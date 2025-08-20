// frontend/src/components/GenerationJobCard.tsx
import React from 'react';
// Direct type import
import { UserUpload } from '@pediaquiz/types';
import { Timestamp } from 'firebase/firestore'; // Import Timestamp for date handling

interface GenerationJobCardProps {
  job: UserUpload;
  onSelect: (jobId: string) => void;
}

const GenerationJobCard: React.FC<GenerationJobCardProps> = ({ job, onSelect }) => {
  // Ensure createdAtDate is a proper Date object regardless of source (Date or Firestore Timestamp)
  const createdAtDate = (job.createdAt instanceof Date)
    ? job.createdAt
    : (job.createdAt as any)?.toDate
      ? (job.createdAt as any).toDate()
      : new Date(); // Fallback to current date if neither

  return (
    <div
      className="p-4 bg-white dark:bg-slate-800 rounded-lg shadow-md cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700"
      onClick={() => onSelect(job.id)}
    >
      <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-50">{job.title || job.fileName}</h3>
      <p className="text-sm text-slate-600 dark:text-slate-400">Status: {job.status}</p>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Created: {createdAtDate.toLocaleDateString()}
      </p>
    </div>
  );
};

export default GenerationJobCard;