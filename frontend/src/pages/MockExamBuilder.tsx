// frontend/src/pages/MockExamBuilder.tsx
// frontend/pages/MockExamBuilder.tsx
// Placeholder page for Feature #8: True Mock Exam Mode
import React from 'react';
import Loader from '@/components/Loader'; // Assuming a Loader component

const MockExamBuilder: React.FC = () => {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 text-slate-800 dark:text-slate-50">Build a Mock Exam</h1>
      <div className="card-base p-6 text-center">
        <p className="text-slate-500 dark:text-slate-400 mb-4">
          Prepare for your boards with full-length mock exams. This feature is currently under development.
        </p>
        <Loader message="Feature under construction..." />
      </div>
    </div>
  );
};

export default MockExamBuilder;