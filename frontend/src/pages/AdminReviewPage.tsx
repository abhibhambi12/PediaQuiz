// frontend/src/pages/AdminReviewPage.tsx
import React, { useState, useEffect } from 'react'; // Restored useEffect
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import Loader from '@/components/Loader';
import AdminJobCard from '@/components/AdminJobCard';
import { ContentGenerationJob } from '@pediaquiz/types';
import { getAdminReviewJobs } from '@/services/apiService';
import clsx from 'clsx';

type PipelineType = 'general' | 'marrow';

const AdminReviewPage: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<PipelineType>('general');

  const { data: generalJobs, isLoading: isLoadingGeneral, error: generalError } = useQuery({
    queryKey: ['adminReviewJobs', 'general'],
    queryFn: async () => (await getAdminReviewJobs({ pipeline: 'general' })).data,
    enabled: !!user?.isAdmin || !!user?.role && ['faculty', 'admin'].includes(user.role),
    refetchInterval: 15000,
  });

  const { data: marrowJobs, isLoading: isLoadingMarrow, error: marrowError } = useQuery({
    queryKey: ['adminReviewJobs', 'marrow'],
    queryFn: async () => (await getAdminReviewJobs({ pipeline: 'marrow' })).data,
    enabled: !!user?.isAdmin || !!user?.role && ['faculty', 'admin'].includes(user.role),
    refetchInterval: 15000,
  });
  
  // FIX: Make the default tab smarter. If the general queue is empty but
  // the marrow queue has jobs, default to the marrow tab.
  useEffect(() => {
    if (!isLoadingGeneral && !isLoadingMarrow) {
      if ((generalJobs?.length === 0) && (marrowJobs?.length ?? 0) > 0) {
        setActiveTab('marrow');
      }
    }
  }, [isLoadingGeneral, isLoadingMarrow, generalJobs, marrowJobs]);


  const isLoading = isLoadingGeneral || isLoadingMarrow;
  const error = generalError || marrowError;
  const jobsToShow = activeTab === 'general' ? generalJobs : marrowJobs;

  if (isLoading) return <Loader fullScreen message="Loading admin dashboard..." />;
  if (error) return <div className="p-6 text-center text-red-500">Error: {error.message}</div>;
  if (!user?.isAdmin && !user?.role) return <div className="p-6 text-center text-red-500">Access Denied.</div>;


  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Admin Content Review</h1>

      <div className="mb-6 border-b border-slate-300 dark:border-slate-700">
        <nav className="-mb-px flex space-x-6" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('general')}
            className={clsx(
              'whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm',
              activeTab === 'general'
                ? 'border-sky-500 text-sky-600 dark:text-sky-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            )}
          >
            General Pipeline ({generalJobs?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('marrow')}
            className={clsx(
              'whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm',
              activeTab === 'marrow'
                ? 'border-sky-500 text-sky-600 dark:text-sky-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            )}
          >
            Marrow Pipeline ({marrowJobs?.length || 0})
          </button>
        </nav>
      </div>

      {jobsToShow?.length === 0 ? (
        <div className="card-base text-center py-8">
            <p className="font-semibold text-lg">All caught up! No jobs in the '{activeTab}' pipeline require your review.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {jobsToShow?.map((job: ContentGenerationJob) => <AdminJobCard key={job.id} job={job} />)}
        </div>
      )}
    </div>
  );
};
export default AdminReviewPage;