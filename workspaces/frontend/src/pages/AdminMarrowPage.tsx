// workspaces/frontend/src/pages/AdminMarrowPage.tsx
import React, { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { storage } from '@/firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { processManualTextInput } from '@/services/aiService';
import clsx from 'clsx';

const AdminMarrowPage: React.FC = () => {
    const { user } = useAuth();
    const { addToast } = useToast();
    const navigate = useNavigate();

    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [pastedText, setPastedText] = useState('');

    const handleFileUploadMutation = useMutation({
        mutationFn: async (file: File) => {
            if (!user?.uid) throw new Error("User not authenticated.");
            // File upload now creates the ContentGenerationJob document directly in onFinalize Cloud Function.
            // This mutation only handles the upload itself, and the backend trigger takes over.
            // We just need to resolve with a success message.
            const storageRef = ref(storage, `uploads/${user.uid}/MARROW_PDF_${Date.now()}_${file.name}`); 
            const uploadTask = uploadBytesResumable(storageRef, file);

            return new Promise<{ success: boolean, message: string }>((resolve, reject) => { // FIX: Explicit return type
                uploadTask.on('state_changed',
                    (snapshot) => {
                        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                        setUploadProgress(progress);
                    },
                    (error) => {
                        reject(error);
                    },
                    () => {
                        // The Cloud Function trigger 'onFinalize' handles creating the job document
                        // and setting its initial status to 'processing_ocr'.
                        // We don't need to return download URL here as it's not directly consumed by the next step in frontend.
                        resolve({ success: true, message: "File uploaded! OCR will begin in the background." }); // FIX: Resolved with explicit message
                    }
                );
            });
        },
        onSuccess: (data) => { // FIX: Data now has { success, message }
            addToast(data.message, "success"); // Use message from data
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
            addToast("Check the Review Queue to continue the process.", "info");
            navigate('/admin/review');
        },
        onError: (error: Error) => {
            addToast(`File upload failed: ${error.message}`, "danger");
            setIsUploading(false);
        },
    });

    const handleProcessTextMutation = useMutation({
        mutationFn: async (data: { fileName: string, rawText: string, isMarrow: boolean }) => {
            if (!user?.uid) throw new Error("User not authenticated.");
            // processManualTextInput now returns { success: boolean, uploadId: string, message: string }
            return processManualTextInput(data); 
        },
        onSuccess: (data) => { // data is directly { success, uploadId, message }
            addToast(data.message || "Text processed! It is ready for further generation in the Review Queue.", "success");
            setPastedText('');
            navigate('/admin/review');
        },
        onError: (error: Error) => {
            addToast(`Error processing text: ${error.message}`, "danger");
        },
    });

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (file.type !== 'application/pdf') {
            addToast('Only PDF files are allowed for the Marrow pipeline.', 'warning');
            return;
        }
        
        setIsUploading(true);
        handleFileUploadMutation.mutate(file);
    };
    
    const handleProcessPastedText = () => {
        if (!pastedText.trim() || !user) {
            addToast('Please paste some text and ensure you are logged in.', 'warning');
            return;
        }
        handleProcessTextMutation.mutate({ rawText: pastedText.trim(), fileName: `MARROW_TEXT_${Date.now()}`, isMarrow: true });
    };

    const isProcessing = isUploading || handleProcessTextMutation.isPending || handleFileUploadMutation.isPending;

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
                    disabled={isProcessing || !user}
                />
                {isUploading && (
                    <div className="mt-4">
                        <div className="w-full bg-neutral-200 rounded-full h-2.5 dark:bg-neutral-700">
                            <div className="bg-success-600 h-2.5 rounded-full" style={{ width: `${uploadProgress}%` }}></div>
                        </div>
                        <p className="mt-2 text-sm text-center text-success-500 animate-pulse">
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
                    disabled={isProcessing}
                 />
                 <button
                    onClick={handleProcessPastedText}
                    disabled={isProcessing || !pastedText.trim()}
                    className="mt-4 w-full bg-success-600 hover:bg-success-700 text-white font-bold py-3 px-4 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                 >
                    {handleProcessTextMutation.isPending ? 'Processing Text...' : 'Process Pasted Text'}
                 </button>
            </div>
        </div>
    );
};

export default AdminMarrowPage;