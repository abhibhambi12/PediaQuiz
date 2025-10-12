import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ref, uploadBytes } from 'firebase/storage';
import { storage } from '@/firebase';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { CloudArrowUpIcon } from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { processManualTextInput } from '@/services/apiService'; // Import the new service

type UploadMode = 'pdf' | 'text';

const GeneratorPage: React.FC = () => {
  const { user } = useAuth();
  const [mode, setMode] = useState<UploadMode>('pdf');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState('');
  const [fileName, setFileName] = useState('');
  const [isMarrow, setIsMarrow] = useState(false);
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
      setFileName(file.name.replace(/\.[^/.]+$/, '')); // Set filename from file
    }
  };
  
  const manualInputMutation = useMutation({
    mutationFn: processManualTextInput,
    onSuccess: () => {
        addToast("Text submitted successfully! Processing has begun.", "success");
        navigate('/admin/review');
    },
    onError: (error: any) => {
        addToast(`Text submission failed: ${error.message}`, "error");
    },
    onSettled: () => {
        setIsProcessing(false);
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsProcessing(true);

    if (mode === 'pdf') {
        if (!selectedFile) {
            setIsProcessing(false);
            return addToast("A PDF file is required for this upload mode.", "error");
        }
        const storageRef = ref(storage, `uploads/${user.uid}/${Date.now()}_${selectedFile.name}`);
        try {
            const metadata = { customMetadata: { owner: user.uid, isMarrow: String(isMarrow) } };
            await uploadBytes(storageRef, selectedFile, metadata);
            addToast("File uploaded successfully! Processing has begun.", "success");
            navigate('/admin/review');
        } catch (error: any) { 
            addToast(`File upload failed: ${error.message}`, "error"); 
            setIsProcessing(false);
        }
    } else { // Manual text mode
        if (!rawText.trim() || !fileName.trim()) {
            setIsProcessing(false);
            return addToast("File name and text content are required for manual input.", "error");
        }
        manualInputMutation.mutate({ fileName: fileName.trim(), rawText, isMarrow });
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Content Uploader</h1>
      
      <div className="mb-4 flex justify-center border border-slate-300 dark:border-slate-600 rounded-lg p-1 bg-slate-100 dark:bg-slate-800">
        <button onClick={() => setMode('pdf')} className={clsx("w-1/2 py-2 rounded-md font-semibold transition-colors", mode === 'pdf' && 'bg-white dark:bg-sky-600 text-sky-700 dark:text-white shadow-sm')}>PDF Upload</button>
        <button onClick={() => setMode('text')} className={clsx("w-1/2 py-2 rounded-md font-semibold transition-colors", mode === 'text' && 'bg-white dark:bg-sky-600 text-sky-700 dark:text-white shadow-sm')}>Manual Text Input</button>
      </div>
      
      <form onSubmit={handleSubmit} className="card-base p-6 space-y-4">
        {mode === 'pdf' ? (
          <label htmlFor="file-upload" className="flex flex-col items-center justify-center p-10 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50">
            <CloudArrowUpIcon className="h-12 w-12 text-sky-500 mb-2" />
            <span className="font-semibold text-slate-700 dark:text-slate-300">{selectedFile ? `File: ${selectedFile.name}` : 'Click or Drag & Drop to Upload PDF'}</span>
            <p className="text-sm text-slate-500">Max file size: 40MB</p>
            <input id="file-upload" type="file" accept=".pdf" onChange={handleFileChange} className="sr-only" />
          </label>
        ) : (
          <div className="space-y-4">
             <label className="block text-sm font-medium">
                File Name / Title
                <input type="text" value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder="e.g., Marrow Pediatrics - Cardiology" className="input-field mt-1" required />
            </label>
            <label className="block text-sm font-medium">
                Raw Text Content
                <textarea value={rawText} onChange={(e) => setRawText(e.target.value)} placeholder="Paste content here..." className="input-field mt-1 h-60" required />
            </label>
          </div>
        )}
        
        <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isMarrow} onChange={(e) => setIsMarrow(e.target.checked)} className="form-checkbox h-5 w-5 rounded text-sky-600" />
            <span className="font-medium">This is Marrow Content</span>
        </label>
        
        <button type="submit" className="btn-primary w-full" disabled={isProcessing}>
          {isProcessing ? 'Processing...' : 'Submit & Process'}
        </button>
      </form>
    </div>
  );
};
export default GeneratorPage;