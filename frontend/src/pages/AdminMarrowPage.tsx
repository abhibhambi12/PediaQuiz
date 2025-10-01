import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import Loader from '@/components/Loader';
import AdminJobCard from '@/components/AdminJobCard';
import { ContentGenerationJob } from '@pediaquiz/types';
import { getAdminReviewJobs } from '@/services/apiService';

const AdminMarrowPage: React.FC = () => {
  const { user } = useAuth();

  const { data: marrowJobs, isLoading: isLoadingJobs, error } = useQuery({
    queryKey: ['adminReviewJobs', 'marrow'],
    queryFn: async () => (await getAdminReviewJobs({ pipeline: 'marrow' })).data,
    enabled: !!user?.isAdmin,
    refetchInterval: 15000,
  });

  if (!user?.isAdmin) return <div className="p-6 text-center text-red-500">Access Denied.</div>;
  if (isLoadingJobs) return <Loader fullScreen message="Loading Marrow dashboard..." />;
  if (error) return <div className="p-6 text-center text-red-500">Error: {error.message}</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Admin Marrow Content Review</h1>
      {marrowJobs?.length === 0 ? (
        <div className="card-base text-center py-8"><p className="font-semibold text-lg">No Marrow jobs require attention.</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {marrowJobs?.map((job: ContentGenerationJob) => <AdminJobCard key={job.id} job={job} />)}
        </div>
      )}
    </div>
  );
};
export default AdminMarrowPage;