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

const AdminReviewPage: React.FC = () => {
  const { user } = useAuth();
  const { data: allTopics, isLoading: isLoadingTopics, error: topicsError } = useTopics();

  // Query to fetch pending content generation jobs for the 'general' pipeline, or general steps
  const { data: pendingJobs, isLoading: isLoadingJobs, error: jobsError } = useQuery<ContentGenerationJob[], Error>({
    queryKey: ['pendingUploads'],
    queryFn: async () => {
      // Fetch jobs that are specifically for the 'general' pipeline and require admin intervention
      const q = query(
        collection(db, 'contentGenerationJobs'),
        where('pipeline', '==', 'general'), // Focus on the 'general' pipeline here
        where('status', 'in', [
          'pending_ocr',             // Waiting for OCR (applies to both, but general workflow starts here)
          'processed',             // General: Text processed, ready for planning
          'pending_classification', // Status for "AI Classify Content" button to appear (Proposed Fix Item 4)
          'pending_approval',      // General: Plan created, awaiting batch generation
          'batch_ready',           // General: Ready to start batch generation
          'generating_batch',    // General: Actively generating (changed from generating_content)
          'generation_failed_partially', // General: Generation hit an error but might be resumable
          'pending_final_review',    // General: Content generated, needs assignment approval
          'pending_assignment_review', // General: AI auto-assignment needs review
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
    return <Loader message="Loading admin dashboard..." />;
  }

  if (jobsError || topicsError) {
    return <div className="p-6 text-center text-red-500">Error loading data: {jobsError?.message || topicsError?.message}</div>;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Admin General Content Review</h1>

      {pendingJobs?.length === 0 ? (
        <div className="bg-green-100 dark:bg-green-900 p-4 rounded-lg text-green-800 dark:text-green-200">
          <p className="font-semibold">All caught up!</p>
          <p className="text-sm">No general content generation jobs require your review at this moment.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {pendingJobs?.map(job => (
            // Passing allTopics prop as required by AdminUploadCard
            <AdminUploadCard key={job.id} job={job} allTopics={allTopics || []} />
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminReviewPage;