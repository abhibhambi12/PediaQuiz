// frontend/src/pages/AdminUserManagementPage.tsx
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getUsers, setUserRole } from '@/services/apiService';
import Loader from '@/components/Loader';
import { useToast } from '@/components/Toast';
import { User } from '@pediaquiz/types';

const AdminUserManagementPage: React.FC = () => {
    const queryClient = useQueryClient();
    const { addToast } = useToast();
    const [pageToken, setPageToken] = useState<string | undefined>();

    const { data, isLoading, isFetching } = useQuery({
        queryKey: ['users', pageToken],
        queryFn: () => getUsers({ limit: 20, pageToken }),
        staleTime: 1000 * 60 * 5, // 5 minutes
    });

    const mutation = useMutation({
        mutationFn: ({ targetUid, newRole }: { targetUid: string; newRole: User['role'] }) => setUserRole({ targetUid, newRole }),
        onSuccess: () => {
            addToast('User role updated successfully!', 'success');
            queryClient.invalidateQueries({ queryKey: ['users'] });
        },
        onError: (error: any) => {
            addToast(`Error updating role: ${error.message}`, 'error');
        }
    });

    if (isLoading) return <Loader fullScreen message="Loading users..." />;

    const users = data?.data.users || [];
    const nextPageToken = data?.data.nextPageToken;

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <h1 className="text-3xl font-bold">User Management</h1>
            <div className="card-base overflow-x-auto">
                <table className="w-full text-left">
                    <thead>
                        <tr className="border-b dark:border-slate-700">
                            <th className="p-4">Name</th>
                            <th className="p-4">Email</th>
                            <th className="p-4">Role</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map((user: User) => (
                            <tr key={user.uid} className="border-b dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                <td className="p-4">{user.displayName}</td>
                                <td className="p-4">{user.email}</td>
                                <td className="p-4">
                                    <select
                                        value={user.role}
                                        onChange={(e) => mutation.mutate({ targetUid: user.uid, newRole: e.target.value as User['role'] })}
                                        className="input-field py-1"
                                        disabled={mutation.isPending}
                                    >
                                        <option value="student">Student</option>
                                        <option value="resident">Resident</option>
                                        <option value="faculty">Faculty</option>
                                        <option value="admin">Admin</option>
                                    </select>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="flex justify-center">
                {nextPageToken && (
                    <button onClick={() => setPageToken(nextPageToken)} disabled={isFetching} className="btn-neutral">
                        {isFetching ? 'Loading...' : 'Load More'}
                    </button>
                )}
            </div>
        </div>
    );
};

export default AdminUserManagementPage;