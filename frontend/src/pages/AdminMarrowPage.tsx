import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '@/firebase';
import Loader from '@/components/Loader';
import AdminUploadCard from '@/components/AdminUploadCard'; // The unified card component
// Using direct type imports from types package
import { ContentGenerationJob, Topic } from '@pediaquiz/types';
import { useTopics } from '@/hooks/useTopics'; // To get all topics for assignment suggestions

const AdminMarrowPage: React.FC = () => {
  const { user } = useAuth();
  const { data: allTopics, isLoading: isLoadingTopics, error: topicsError } = useTopics();

  // Query to fetch pending content generation jobs specific to the 'marrow' pipeline
  const { data: marrowJobs, isLoading: isLoadingJobs, error: jobsError } = useQuery<ContentGenerationJob[], Error>({
    queryKey: ['marrowUploads'],
    queryFn: async () => {
      // Fetch jobs that are specifically for the 'marrow' pipeline and require review
      const q = query(
        collection(db, 'contentGenerationJobs'),
        where('pipeline', '==', 'marrow'),
        where('status', 'in', [
          'pending_ocr',
          'processed',
          'pending_marrow_extraction',
          'pending_generation_decision',
          'generating_batch', // Changed from generating_content to generating_batch based on updated status
          'generation_failed_partially',
          'pending_assignment',
        ]),
        orderBy('createdAt', 'desc') // Order by creation date, most recent first
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), createdAt: doc.data().createdAt.toDate() })) as ContentGenerationJob[];
    },
    enabled: !!user?.isAdmin, // Only run this query if user is an admin
    refetchInterval: 1000 * 15, // Refetch every 15 seconds to see status updates
  });

  if (!user || !user.isAdmin) {
    // This is a client-side check. Server-side in AdminRoute provides stronger protection.
    return <div className="p-6 text-center text-red-500">Access Denied. You must be an administrator to view this page.</div>;
  }

  if (isLoadingJobs || isLoadingTopics) {
    return <Loader message="Loading Marrow dashboard..." />;
  }

  if (jobsError || topicsError) {
    return <div className="p-6 text-center text-red-500">Error loading data: {jobsError?.message || topicsError?.message}</div>;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Admin Marrow Content Review</h1>

      {marrowJobs?.length === 0 ? (
        <div className="bg-green-100 dark:bg-green-900 p-4 rounded-lg text-green-800 dark:text-green-200">
          <p className="font-semibold">No Marrow content jobs currently require attention.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {marrowJobs?.map(job => (
            // Passing allTopics prop as required by AdminUploadCard
            <AdminUploadCard key={job.id} job={job} allTopics={allTopics || []} />
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminMarrowPage;