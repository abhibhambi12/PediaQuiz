// FILE: frontend/src/pages/GeneratorPage.tsx

import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { storage } from '@/firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import clsx from 'clsx'; // NEW IMPORT for conditional styling

const GeneratorPage: React.FC = () => {
  const { user } = useAuth(); // user is now UserContextType
  const { addToast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) { // user.uid implicitly checked by useAuth() context
      addToast('Please select a file and ensure you are logged in.', 'info');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    addToast(`Uploading "${file.name}"...`, "info");

    const storageRef = ref(storage, `uploads/${user.uid}/${Date.now()}_${file.name}`); // user.uid is on UserContextType
    const uploadTask = uploadBytesResumable(storageRef, file);

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
          addToast(
            "File uploaded successfully! Processing will begin shortly in the background.",
            "success",
            5000
          );
          setIsUploading(false);
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
          addToast("You will be able to see its status in the Review Queue.", "info", 5000);
        });
      }
    );
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">General Content Pipeline</h1>
      <p className="text-slate-500 dark:text-slate-400">
        Upload a file (PDF or TXT). The content will be processed and will then appear in the{" "}
        <Link to="/admin/review" className="text-sky-500 hover:underline">
          Review Queue
        </Link>{" "}
        for AI content generation and approval.
      </p>

      {/* --- UPDATED CLASSES: using card-base utility class --- */}
      <div className="card-base">
        <h2 className="text-xl font-bold mb-4">Upload File</h2>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="application/pdf,text/plain"
          // --- UPDATED CLASSES: using clsx for conditional styles ---
          className={clsx(
            "block w-full text-sm text-slate-500",
            "file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0",
            "file:text-sm file:font-semibold file:bg-sky-50 file:text-sky-700",
            "hover:file:bg-sky-100 dark:file:bg-sky-900/50 dark:file:text-sky-300 dark:hover:file:bg-sky-900",
            "disabled:opacity-50"
          )}
          disabled={isUploading || !user}
        />
        {isUploading && (
          <div className="mt-4">
            <div className="w-full bg-slate-200 rounded-full h-2.5 dark:bg-slate-700">
              <div className="bg-sky-600 h-2.5 rounded-full" style={{ width: `${uploadProgress}%` }}></div>
            </div>
            <p className="mt-2 text-sm text-center text-sky-500 animate-pulse">
                Uploading... {uploadProgress.toFixed(0)}%
            </p>
          </div>
        )}
        {!user && <p className="text-red-500 text-sm mt-2">Please log in to upload files.</p>}
      </div>
    </div>
  );
};

export default GeneratorPage;