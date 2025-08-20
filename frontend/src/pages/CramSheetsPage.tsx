// frontend/src/pages/CramSheetsPage.tsx
// frontend/pages/CramSheetsPage.tsx
// Placeholder page for Feature #10: High-Yield "Cram Sheets"
import React from 'react';
import Loader from '@/components/Loader'; // Assuming a Loader component

const CramSheetsPage: React.FC = () => {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 text-slate-800 dark:text-slate-50">Your Cram Sheets</h1>
      <div className="card-base p-6 text-center">
        <p className="text-slate-500 dark:text-slate-400 mb-4">
          This feature is coming soon! Here you will find your AI-generated and custom cram sheets for quick review.
        </p>
        <Loader message="Feature under construction..." />
      </div>
    </div>
  );
};

export default CramSheetsPage;