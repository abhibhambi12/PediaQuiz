import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '@/firebase';
import type { UserUpload, UploadStatus } from '@pediaquiz/types';
import Loader from '@/components/Loader';

const getStatusColor = (status: UploadStatus) => {
    if (status === 'completed') return 'text-green-500';
    if (status.startsWith('failed') || status === 'error') return 'text-red-500';
    if (status.startsWith('pending')) return 'text-amber-500 animate-pulse';
    if (status === 'archived') return 'text-slate-500';
    return 'text-sky-500 animate-pulse';
};

const LogScreenPage: React.FC = () => {
    const { data: jobs, isLoading, error } = useQuery<UserUpload[]>({
        queryKey: ['allUploads'],
        queryFn: async () => {
            const q = query(collection(db, 'userUploads'), orderBy('createdAt', 'desc'));
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => {
                const data = doc.data();
                return { 
                    ...data,
                    id: doc.id,
                    createdAt: data.createdAt.toDate(),
                    updatedAt: data.updatedAt?.toDate(),
                } as UserUpload;
            });
        }
    });

    if (isLoading) return <Loader message="Loading job logs..." />;
    if (error) return <div className="text-center text-red-500">Error: {error.message}</div>;

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">AI Processing Logs</h1>
            <p className="text-slate-500">A real-time log of all content generation jobs.</p>
            <div className="space-y-4">
                {jobs && jobs.length > 0 ? (
                    jobs.map((job: UserUpload) => (
                        <div key={job.id} className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-md">
                            <div className="flex justify-between items-start">
                                <p className="font-bold font-mono text-sm truncate" title={job.fileName}>{job.fileName}</p>
                                <p className={`font-bold text-sm capitalize ${getStatusColor(job.status)}`}>
                                    {job.status.replace(/_/g, ' ')}
                                </p>
                            </div>
                            <p className="text-xs text-slate-400 mt-1">Started: {job.createdAt.toLocaleString()}</p>
                            {job.updatedAt && <p className="text-xs text-slate-400 mt-1">Updated: {job.updatedAt.toLocaleString()}</p>}
                            {job.error && <p className="text-xs text-red-600 mt-1 font-mono break-all">Error: {job.error}</p>}
                        </div>
                    ))
                ) : (
                    <p className="text-center py-8 text-slate-500">No jobs have been initiated yet.</p>
                )}
            </div>
        </div>
    );
};

export default LogScreenPage;