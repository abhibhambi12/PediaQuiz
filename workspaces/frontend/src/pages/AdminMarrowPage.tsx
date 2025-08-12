// --- CORRECTED FILE: workspaces/frontend/src/pages/AdminMarrowPage.tsx ---

import React, { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { storage } from '@/firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { processMarrowText } from '@/services/aiService';
import clsx from 'clsx';

const AdminMarrowPage: React.FC = () => {
    const { user } = useAuth();
    const { addToast } = useToast();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [pastedText, setPastedText] = useState('');

    const processTextMutation = useMutation<any, Error, { rawText: string, fileName: string, isMarrow: boolean }>({ // FIX: added isMarrow to match backend schema
        mutationFn: (vars) => processMarrowText(vars),
        onSuccess: (data) => {
            // NOTE: The `processMarrowText` callable in the backend should ideally return `extractedMcqs` and `suggestedNewMcqCount`
            // even if it just stages the text, to match this frontend success message.
            addToast(`Text processed! It is ready for further generation in the Review Queue.`, "success", 6000); // FIX: Adjusted message as backend might not extract counts directly here.
            queryClient.invalidateQueries({ queryKey: ['pendingUploads'] });
            setPastedText('');
            navigate('/admin/review');
        },
        onError: (error) => {
            addToast(`Error processing text: ${error.message}`, "danger");
        },
    });

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !user) {
            addToast('Please select a file and ensure you are logged in.', 'warning');
            return;
        }
        if (file.type !== 'application/pdf') {
            addToast('Only PDF files are allowed for the Marrow pipeline.', 'warning');
            return;
        }

        setIsUploading(true);
        setUploadProgress(0);
        addToast(`Uploading "${file.name}"...`, "info");

        const storageRef = ref(storage, `uploads/${user.uid}/MARROW_${Date.now()}_${file.name}`);
        const metadata = { customMetadata: { owner: user.uid } };
        const uploadTask = uploadBytesResumable(storageRef, file, metadata);

        uploadTask.on('state_changed',
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                setUploadProgress(progress);
            },
            (error) => {
                addToast(`File upload failed: ${error.message}`, "danger");
                setIsUploading(false);
            },
            () => {
                getDownloadURL(uploadTask.snapshot.ref).then(() => {
                    addToast("File uploaded! OCR will begin in the background.", "success", 5000);
                    setIsUploading(false);
                    if (fileInputRef.current) {
                        fileInputRef.current.value = '';
                    }
                    addToast("Check the Review Queue to continue the process.", "info", 5000);
                    navigate('/admin/review');
                });
            }
        );
    };
    
    const handleProcessText = () => {
        if (!pastedText.trim() || !user) {
            addToast('Please paste some text and ensure you are logged in.', 'warning');
            return;
        }
        // For pasted text, `isMarrow` should be true to trigger the Marrow text pipeline in backend
        processTextMutation.mutate({ rawText: pastedText.trim(), fileName: 'Pasted_Marrow_Text', isMarrow: true }); // FIX: Added isMarrow
    };

    return (
        <div className="space-y-6 animate-fade-in-up">
            <h1 className="text-3xl font-bold">Marrow Content Pipeline</h1>
            <p className="text-neutral-500 dark:text-neutral-400">
                Upload image-based Marrow PDFs or paste text directly. The system will process the content, and it will then appear in the{" "}
                <Link to="/admin/review" className="text-primary-500 hover:underline">Review Queue</Link>{" "}
                for the multi-stage AI extraction and generation process.
            </p>

            <div className="bg-white dark:bg-neutral-800 p-6 rounded-xl shadow-md">
                <h2 className="text-xl font-bold mb-4">Option 1: Upload Marrow PDF</h2>
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="application/pdf"
                    className={clsx(
                        "block w-full text-sm text-neutral-500",
                        "file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0",
                        "file:text-sm file:font-semibold file:bg-success-50 file:text-success-700",
                        "hover:file:bg-success-100 dark:file:bg-success-900/50 dark:file:text-success-300 dark:hover:file:bg-success-900",
                        "disabled:opacity-50"
                    )}
                    disabled={isUploading || !user || processTextMutation.isPending}
                />
                {isUploading && (
                    <div className="mt-4">
                        <div className="w-full bg-neutral-200 rounded-full h-2.5 dark:bg-neutral-700">
                            <div className="bg-success-600 h-2.5 rounded-full" style={{ width: `${uploadProgress}%` }}></div>
                        </div>
                        <p className="mt-2 text-sm text-center text-success-500 animate-pulse-subtle">
                            Uploading... {uploadProgress.toFixed(0)}%
                        </p>
                    </div>
                )}
                 {!user && <p className="text-danger-500 text-sm mt-2">Please log in to upload files.</p>}
            </div>

            <div className="bg-white dark:bg-neutral-800 p-6 rounded-xl shadow-md">
                <h2 className="text-xl font-bold mb-4">Option 2: Paste Marrow Text</h2>
                 <textarea
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder="Paste raw text from Marrow or another source here..."
                    className="w-full h-60 p-3 border rounded-md dark:bg-neutral-700 dark:border-neutral-600 focus:outline-none focus:ring-2 focus:ring-success-500"
                    disabled={processTextMutation.isPending || isUploading}
                 />
                 <button
                    onClick={handleProcessText}
                    disabled={processTextMutation.isPending || !pastedText.trim() || isUploading}
                    className="mt-4 w-full bg-success-600 hover:bg-success-700 text-white font-bold py-3 px-4 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                 >
                    {processTextMutation.isPending ? 'Processing Text...' : 'Process Pasted Text'}
                 </button>
            </div>
        </div>
    );
};

export default AdminMarrowPage;