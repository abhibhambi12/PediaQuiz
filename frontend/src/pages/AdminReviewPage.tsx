import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/firebase';
import Loader from '@/components/Loader';
import AdminUploadCard from '@/components/AdminUploadCard'; // The unified card component
import type { ContentGenerationJob, Topic } from '@pediaquiz/types';
import { useTopics } from '@/hooks/useTopics'; // To get all topics for assignment suggestions

const AdminReviewPage: React.FC = () => {
  const { user } = useAuth();
  const { data: allTopics, isLoading: isLoadingTopics, error: topicsError } = useTopics();

  // Query to fetch pending content generation jobs
  const { data: pendingJobs, isLoading: isLoadingJobs, error: jobsError } = useQuery<ContentGenerationJob[], Error>({
    queryKey: ['pendingUploads'],
    queryFn: async () => {
      // Fetch jobs that require admin intervention (e.g., planning, assignment)
      const q = query(
        collection(db, 'contentGenerationJobs'),
        where('status', 'in', [
          'processed',             // General: Text processed, ready for planning
          'pending_planning',      // General: Plan ready, awaiting batch generation
          'pending_generation',    // General: Batch generation started/in progress
          'generating_content',    // General: Actively generating
          'generation_failed_partially', // General: Generation hit an error but might be resumable
          'pending_assignment',    // General/Marrow: Content generated, needs assignment approval
          'pending_generation_decision', // Marrow: Extraction done, decide on generating more MCQs
        ])
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), createdAt: doc.data().createdAt.toDate() })) as ContentGenerationJob[];
    },
    enabled: !!user?.isAdmin, // Only run this query if user is an admin
    refetchInterval: 1000 * 15, // Refetch every 15 seconds to see status updates
  });

  if (!user || !user.isAdmin) {
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
      <h1 className="text-3xl font-bold mb-6">Admin Content Review</h1>

      {pendingJobs?.length === 0 ? (
        <div className="bg-green-100 dark:bg-green-900 p-4 rounded-lg text-green-800 dark:text-green-200">
          <p className="font-semibold">All caught up!</p>
          <p className="text-sm">No content generation jobs require your review at this moment.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {pendingJobs?.map(job => (
            <AdminUploadCard key={job.id} job={job} allTopics={allTopics || []} />
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminReviewPage;