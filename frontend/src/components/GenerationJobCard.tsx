import React from 'react';
import { GenerationJob } from '../../types';

interface GenerationJobCardProps {
  job: GenerationJob;
  onSelect: (jobId: string) => void;
}

const GenerationJobCard: React.FC<GenerationJobCardProps> = ({ job, onSelect }) => {
  return (
    <div
      className="p-4 bg-white rounded-lg shadow-md cursor-pointer hover:bg-gray-50"
      onClick={() => onSelect(job.id)}
    >
      <h3 className="text-lg font-semibold">{job.title}</h3>
      <p className="text-sm text-gray-600">Status: {job.status}</p>
      <p className="text-sm text-gray-600">
        Created: {new Date(job.createdAt).toLocaleDateString()}
      </p>
    </div>
  );
};

export default GenerationJobCard;