// frontend/src/pages/AdminAuditLogPage.tsx
import React from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { getAuditLogs } from '@/services/apiService';
import Loader from '@/components/Loader';
import { format } from 'date-fns';
import { safeToDate } from '@/utils/dateUtils';
import { LogEntry } from '@pediaquiz/types';

const AdminAuditLogPage: React.FC = () => {
    const fetchLogs = async ({ pageParam }: { pageParam?: string }) => {
        const response = await getAuditLogs({ limit: 25, startAfter: pageParam });
        return response.data;
    };

    const {
        data,
        error,
        fetchNextPage,
        hasNextPage,
        isLoading,
        isFetchingNextPage,
    } = useInfiniteQuery({
        queryKey: ['auditLogs'],
        queryFn: fetchLogs,
        initialPageParam: undefined,
        getNextPageParam: (lastPage) => lastPage.lastVisible || undefined,
    });

    if (isLoading) return <Loader fullScreen message="Loading audit logs..." />;
    if (error) return <div className="text-center py-10 text-red-500">Failed to load logs: {error.message}</div>;

    const allLogs = data?.pages.flatMap(page => page.logs) ?? [];

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <h1 className="text-3xl font-bold">Audit Logs</h1>
            <div className="card-base overflow-x-auto">
                 <table className="w-full text-left">
                    <thead>
                        <tr className="border-b dark:border-slate-700">
                            <th className="p-4">Timestamp</th>
                            <th className="p-4">User ID</th>
                            <th className="p-4">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {allLogs.map((log: LogEntry) => (
                            <tr key={log.id} className="border-b dark:border-slate-700 text-sm">
                                <td className="p-4 whitespace-nowrap">{format(safeToDate(log.timestamp), 'PPpp')}</td>
                                <td className="p-4 font-mono text-xs">{log.userId}</td>
                                <td className="p-4">{log.message}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {hasNextPage && (
                <div className="text-center mt-6">
                    <button onClick={() => fetchNextPage()} disabled={isFetchingNextPage} className="btn-neutral">
                        {isFetchingNextPage ? 'Loading more...' : 'Load More'}
                    </button>
                </div>
            )}
        </div>
    );
};

export default AdminAuditLogPage;