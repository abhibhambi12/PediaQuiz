import React, { useState, useEffect } from 'react';
import { db } from '@/firebase';
import { collection, query, orderBy, onSnapshot, limit, Timestamp } from 'firebase/firestore';
import { ContentGenerationJob, UploadStatus } from '@pediaquiz/types';
import { format } from 'date-fns';
import Loader from '@/components/Loader';

const getStatusColor = (status: UploadStatus): string => {
  switch (status) {
    case 'completed': return 'text-green-500';
    case 'error': return 'text-red-500';
    case 'generating_content': return 'text-blue-500 animate-pulse';
    case 'pending_planning': return 'text-amber-500 animate-pulse';
    case 'pending_generation': return 'text-sky-500 animate-pulse';
    case 'pending_assignment': return 'text-purple-500 animate-pulse';
    case 'archived': return 'text-slate-500';
    case 'processing_ocr': return 'text-gray-500 animate-pulse';
    case 'generation_failed_partially': return 'text-red-500'; 
    default: return 'text-slate-500';
  }
};

const LogScreenPage: React.FC = () => {
  const [jobs, setJobs] = useState<ContentGenerationJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'contentGenerationJobs'), orderBy('createdAt', 'desc'), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedJobs: ContentGenerationJob[] = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          userId: data.userId || 'N/A',
          title: data.title || data.fileName || doc.id,
          pipeline: data.pipeline || 'general',
          status: data.status as UploadStatus,
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
          updatedAt: (data.updatedAt instanceof Timestamp) ? data.updatedAt.toDate() : undefined,
          errors: data.errors || undefined,
          suggestedPlan: data.suggestedPlan || undefined,
          totalMcqCount: data.totalMcqCount || undefined,
          totalFlashcardCount: data.totalFlashcardCount || undefined,
          totalBatches: data.totalBatches || undefined,
          completedBatches: data.completedBatches || undefined,
        } as ContentGenerationJob;
      });
      setJobs(fetchedJobs);
      setLoading(false);
    }, (error) => {
      setLoading(false);
      console.error("Error fetching logs:", error);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return <Loader message="Loading job logs..." />;
  }

  return (
    <div className="container mx-auto p-6 bg-white dark:bg-slate-900 min-h-screen">
      <h1 className="text-3xl font-bold text-neutral-800 dark:text-white mb-6">Content Generation Logs</h1>

      {jobs.length === 0 ? (
        <p className="text-neutral-600 dark:text-neutral-300">No content generation jobs found.</p>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => (
            <div key={job.id} className="card-base p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-bold font-mono text-sm truncate" title={job.title}>{job.title}</p>
                  <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">ID: {job.id}</p>
                </div>
                <div className={`text-sm font-semibold ${getStatusColor(job.status)}`}>
                  {job.status.replace(/_/g, ' ')}
                </div>
              </div>
              <div className="text-sm text-neutral-500 dark:text-neutral-400 mt-2">
                <p>Status: {job.status.replace(/_/g, ' ')}</p>
                {job.pipeline && <p>Pipeline: {job.pipeline}</p>}
                {job.createdAt && <p>Created: {format(job.createdAt, 'PPpp')}</p>}
                {job.updatedAt && <p>Updated: {format(job.updatedAt, 'PPpp')}</p>}
                {job.suggestedPlan?.mcqCount !== undefined && job.suggestedPlan?.flashcardCount !== undefined && (
                    <p>Planned: {job.suggestedPlan.mcqCount} MCQs, {job.suggestedPlan.flashcardCount} Flashcards</p>
                )}
                {job.totalMcqCount !== undefined && job.totalFlashcardCount !== undefined && (
                    <p>Generated: {job.totalMcqCount} MCQs, {job.totalFlashcardCount} Flashcards</p>
                )}
                {job.totalBatches !== undefined && job.completedBatches !== undefined && 
                  <p>Batches: {job.completedBatches} / {job.totalBatches}</p>
                }
                {job.errors && job.errors.length > 0 && (
                  <div className="text-xs text-red-600 mt-1 font-mono break-all">
                    Error: {job.errors.join(', ')}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LogScreenPage;