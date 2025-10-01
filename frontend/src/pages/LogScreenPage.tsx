import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { LogEntry } from '@pediaquiz/types';
import Loader from '@/components/Loader';
import { getLogs } from '@/services/apiService';
import { safeToDate } from '@/utils/dateUtils';

const LogScreenPage = () => {
    const { user } = useAuth();
    const { data: logs, isLoading } = useQuery<LogEntry[], Error>({
        queryKey: ['logs', user?.uid],
        queryFn: async () => (await getLogs()).data,
        enabled: !!user,
    });

    if (isLoading) return <Loader fullScreen message="Loading logs..." />;

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold mb-6">Activity Logs</h1>
            <div className="space-y-4">
                {logs?.length === 0 && <p className="text-center text-slate-500">No logs found.</p>}
                {logs?.map(log => (
                    <div key={log.id} className="card-base p-4">
                        <p className="text-sm text-slate-500"><span className="font-semibold">{format(safeToDate(log.timestamp), 'PPPpp')}</span></p>
                        <p className="mt-1">{log.message}</p>
                        {log.context && <pre className="whitespace-pre-wrap break-all bg-slate-100 dark:bg-slate-700 p-2 rounded-md mt-1 text-xs">{JSON.stringify(log.context, null, 2)}</pre>}
                    </div>
                ))}
            </div>
        </div>
    );
};
export default LogScreenPage;