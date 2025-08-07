// frontend/src/pages/AdminMarrowPage.tsx
import React, { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { storage } from '@/firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { processMarrowText } from '@/services/aiService';

const AdminMarrowPage: React.FC = () => {
    const { user } = useAuth();
    const { addToast } = useToast();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [pastedText, setPastedText] = useState('');

    const processTextMutation = useMutation<any, Error, { rawText: string }>({
        mutationFn: ({ rawText }) => processMarrowText({ rawText, fileName: 'Pasted Text' }),
        onSuccess: (data) => {
            const { extractedMcqs, suggestedNewMcqCount } = data.data;
            addToast(`Text processed! Extracted ${extractedMcqs.length} MCQs. AI suggests generating ${suggestedNewMcqCount} new ones.`, "success", 6000);
            queryClient.invalidateQueries({ queryKey: ['pendingUploads'] });
            setPastedText('');
            navigate('/admin/review');
        },
        onError: (error) => {
            addToast(`Error processing text: ${error.message}`, "error");
        },
    });

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !user) {
            addToast('Please select a file and ensure you are logged in.', 'error');
            return;
        }
        if (file.type !== 'application/pdf') {
            addToast('Only PDF files are allowed for the Marrow pipeline.', 'error');
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
                addToast(`File upload failed: ${error.message}`, "error");
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
            addToast('Please paste some text and ensure you are logged in.', 'error');
            return;
        }
        processTextMutation.mutate({ rawText: pastedText.trim() });
    };

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">Marrow Content Pipeline</h1>
            <p className="text-slate-500 dark:text-slate-400">
                Upload image-based Marrow PDFs or paste text directly. The system will process the content, and it will then appear in the{" "}
                <Link to="/admin/review" className="text-sky-500 hover:underline">Review Queue</Link>{" "}
                for the multi-stage AI extraction and generation process.
            </p>

            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-md">
                <h2 className="text-xl font-bold mb-4">Option 1: Upload Marrow PDF</h2>
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="application/pdf"
                    className="block w-full text-sm text-slate-500
                      file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0
                      file:text-sm file:font-semibold file:bg-teal-50 file:text-teal-700
                      hover:file:bg-teal-100 dark:file:bg-teal-900/50 dark:file:text-teal-300 dark:hover:file:bg-teal-900
                      disabled:opacity-50"
                    disabled={isUploading || !user}
                />
                {isUploading && (
                    <div className="mt-4">
                        <div className="w-full bg-slate-200 rounded-full h-2.5 dark:bg-slate-700">
                            <div className="bg-teal-600 h-2.5 rounded-full" style={{ width: `${uploadProgress}%` }}></div>
                        </div>
                        <p className="mt-2 text-sm text-center text-teal-500 animate-pulse">
                            Uploading... {uploadProgress.toFixed(0)}%
                        </p>
                    </div>
                )}
                 {!user && <p className="text-red-500 text-sm mt-2">Please log in to upload files.</p>}
            </div>

            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-md">
                <h2 className="text-xl font-bold mb-4">Option 2: Paste Marrow Text</h2>
                 <textarea
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder="Paste raw text from Marrow or another source here..."
                    className="w-full h-60 p-3 border rounded-md dark:bg-slate-700 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    disabled={processTextMutation.isPending}
                 />
                 <button
                    onClick={handleProcessText}
                    disabled={processTextMutation.isPending || !pastedText.trim()}
                    className="mt-4 w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 px-4 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                 >
                    {processTextMutation.isPending ? 'Processing Text...' : 'Process Pasted Text'}
                 </button>
            </div>
        </div>
    );
};

export default AdminMarrowPage;