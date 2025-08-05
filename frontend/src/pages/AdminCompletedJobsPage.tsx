import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collection, query, where, getDocs, orderBy, QueryDocumentSnapshot } from 'firebase/firestore';
import { db, functions } from '@/firebase';
import { httpsCallable } from 'firebase/functions';
import type { UserUpload, UploadStatus } from '@pediaquiz/types';
import Loader from '@/components/Loader';
import { useToast } from '@/components/Toast';
import ConfirmationModal from '@/components/ConfirmationModal';

// Define callable functions
const resetUploadFn = httpsCallable<{ uploadId: string }, { success: boolean }>(functions, 'resetUpload');
const archiveUploadFn = httpsCallable<{ uploadId: string }, { success: boolean }>(functions, 'archiveUpload');

// Helper function getStatusColor, defined globally for scope
const getStatusColor = (status: UploadStatus) => {
    if (status === 'completed') return 'text-green-500';
    if (status.startsWith('failed') || status === 'error') return 'text-red-500';
    if (status.startsWith('pending')) return 'text-amber-500 animate-pulse';
    if (status === 'archived') return 'text-slate-500';
    return 'text-sky-500 animate-pulse';
};

const AdminCompletedJobsPage: React.FC = () => {
    const { addToast } = useToast();
    const queryClient = useQueryClient();
    const [modalState, setModalState] = useState<{ isOpen: boolean, action: 'reset' | 'archive' | null, uploadId: string | null }>({ isOpen: false, action: null, uploadId: null });

    const { data: uploads, isLoading, error } = useQuery<UserUpload[]>({
        queryKey: ['completedUploads'],
        queryFn: async () => {
            const statuses: UploadStatus[] = ['completed', 'archived', 'error', 'failed_ocr', 'failed_unsupported_type'];
            const q = query(collection(db, 'userUploads'), where('status', 'in', statuses), orderBy('createdAt', 'desc'));
            // Fix: Explicitly type `doc` parameter for QueryDocumentSnapshot
            const snapshot = await getDocs(q);
            return snapshot.docs.map((doc: QueryDocumentSnapshot) => ({ ...doc.data(), id: doc.id, createdAt: doc.data().createdAt.toDate(), updatedAt: doc.data().updatedAt?.toDate() } as UserUpload));
        }
    });

    const resetMutation = useMutation({
        mutationFn: (uploadId: string) => resetUploadFn({ uploadId }),
        onSuccess: () => {
            addToast("Upload reset successfully!", 'success');
            queryClient.invalidateQueries({ queryKey: ['completedUploads'] });
            queryClient.invalidateQueries({ queryKey: ['pendingUploads'] });
            queryClient.invalidateQueries({ queryKey: ['appData'] });
        },
        onError: (error) => addToast(`Reset failed: ${error.message}`, 'error'),
    });

    const archiveMutation = useMutation({
        mutationFn: (uploadId: string) => archiveUploadFn({ uploadId }),
        onSuccess: () => {
            addToast("Upload archived successfully!", 'success');
            queryClient.invalidateQueries({ queryKey: ['completedUploads'] });
        },
        onError: (error) => addToast(`Archive failed: ${error.message}`, 'error'),
    });
    
    const handleConfirm = () => {
        if (!modalState.uploadId || !modalState.action) return;
        if (modalState.action === 'reset') {
            resetMutation.mutate(modalState.uploadId);
        } else if (modalState.action === 'archive') {
            archiveMutation.mutate(modalState.uploadId);
        }
        setModalState({ isOpen: false, action: null, uploadId: null });
    };

    if (isLoading) return <Loader message="Loading Completed Jobs..." />;
    if (error) return <div className="text-center text-red-500">Error: {error.message}</div>;

    return (
        <>
            <ConfirmationModal
                isOpen={modalState.isOpen}
                onClose={() => setModalState({ isOpen: false, action: null, uploadId: null })}
                onConfirm={handleConfirm}
                title={`Confirm ${modalState.action === 'reset' ? 'Reset' : 'Archive'}`}
                message={modalState.action === 'reset' ? "This will delete all content from this upload and reset its status. Are you sure?" : "This will hide the upload from most views but will not delete content. Are you sure?"}
                confirmText={modalState.action === 'reset' ? 'Reset Content' : 'Archive Upload'}
                variant={modalState.action === 'reset' ? 'danger' : 'confirm'}
                isLoading={resetMutation.isPending || archiveMutation.isPending}
            />
            <div className="space-y-6">
                <h1 className="text-3xl font-bold">Content Management</h1>
                <p className="text-slate-500">Manage previously completed jobs. Resetting allows re-generation.</p>
                <div className="space-y-4">
                    {uploads && uploads.length > 0 ? (
                        uploads.map((upload) => (
                            <div key={upload.id} className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-md flex justify-between items-center">
                                <div>
                                    <p className="font-bold text-slate-800 dark:text-slate-200">{upload.fileName}</p>
                                    <p className="text-sm mt-1 text-slate-400">Status: <span className={`font-semibold capitalize ${getStatusColor(upload.status)}`}>{upload.status.replace(/_/g, ' ')}</span></p>
                                </div>
                                <div className="flex space-x-2">
                                    {upload.status === 'completed' && (<button onClick={() => setModalState({ isOpen: true, action: 'reset', uploadId: upload.id })} className="px-3 py-1 text-sm rounded-md bg-blue-500 text-white hover:bg-blue-600">Reset</button>)}
                                    {upload.status === 'completed' && (<button onClick={() => setModalState({ isOpen: true, action: 'archive', uploadId: upload.id })} className="px-3 py-1 text-sm rounded-md bg-purple-500 text-white hover:bg-purple-600">Archive</button>)}
                                </div>
                            </div>
                        ))
                    ) : (
                        <p className="text-center py-8 text-slate-500">No completed or archived jobs found.</p>
                    )}
                </div>
            </div>
        </>
    );
};

export default AdminCompletedJobsPage;