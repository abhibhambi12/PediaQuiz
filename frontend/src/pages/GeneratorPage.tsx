import React, { useState } from 'react';
import { ref, uploadBytes } from 'firebase/storage';
import { storage } from '@/firebase';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { CloudArrowUpIcon } from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';

const GeneratorPage: React.FC = () => {
    const { user } = useAuth();
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const { addToast } = useToast();
    const navigate = useNavigate();

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            const file = e.target.files[0];
            if (file.type !== 'application/pdf') {
                addToast('Invalid file type. Please upload a PDF.', 'error');
                return;
            }
            if (file.size > 40 * 1024 * 1024) { // 40MB limit
                addToast('File is too large. Maximum size is 40MB.', 'error');
                return;
            }
            setSelectedFile(file);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !selectedFile) {
            return addToast("A PDF file is required.", "error");
        }
        setIsProcessing(true);
        
        const storageRef = ref(storage, `uploads/${user.uid}/${Date.now()}_${selectedFile.name}`);
        try {
            const metadata = { customMetadata: { owner: user.uid } };
            await uploadBytes(storageRef, selectedFile, metadata);
            addToast("File uploaded successfully! Processing has begun.", "success");
            navigate('/admin/review'); // Redirect to see the job status
        } catch (error: any) { 
            addToast(`File upload failed: ${error.message}`, "error"); 
            setIsProcessing(false);
        }
    };

    return (
        <div className="p-6 max-w-3xl mx-auto">
            <h1 className="text-3xl font-bold mb-6">Content Uploader</h1>
            <form onSubmit={handleSubmit} className="card-base p-6 space-y-4">
                <label htmlFor="file-upload" className="flex flex-col items-center justify-center p-10 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <CloudArrowUpIcon className="h-12 w-12 text-sky-500 mb-2" />
                    <span className="font-semibold text-slate-700 dark:text-slate-300">{selectedFile ? `File: ${selectedFile.name}` : 'Click or Drag & Drop to Upload PDF'}</span>
                    <p className="text-sm text-slate-500">Max file size: 40MB</p>
                    <input id="file-upload" type="file" accept=".pdf" onChange={handleFileChange} className="sr-only" />
                </label>
                <button type="submit" className="btn-primary w-full" disabled={isProcessing || !selectedFile}>
                    {isProcessing ? 'Uploading...' : 'Upload & Process'}
                </button>
            </form>
        </div>
    );
};
export default GeneratorPage;