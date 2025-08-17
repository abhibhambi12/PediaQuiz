import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/firebase';
import Loader from '@/components/Loader';
import AdminUploadCard from '@/components/AdminUploadCard'; // The unified card component
import type { ContentGenerationJob, Topic } from '@pediaquiz/types';
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
          'pending_planning',
          'pending_generation_decision',
          'pending_generation',
          'generating_content',
          'generation_failed_partially',
          'pending_assignment',
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
    return <Loader message="Loading Marrow dashboard..." />;
  }

  if (jobsError || topicsError) {
    return <div className="p-6 text-center text-red-500">Error loading data: {jobsError?.message || topicsError?.message}</div>;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Admin Marrow Content</h1>

      {marrowJobs?.length === 0 ? (
        <div className="bg-green-100 dark:bg-green-900 p-4 rounded-lg text-green-800 dark:text-green-200">
          <p className="font-semibold">No Marrow content jobs currently require attention.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {marrowJobs?.map(job => (
            <AdminUploadCard key={job.id} job={job} allTopics={allTopics || []} />
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminMarrowPage;