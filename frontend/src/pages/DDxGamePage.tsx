// frontend/src/pages/DDxGamePage.tsx
// frontend/pages/DDxGamePage.tsx
// Placeholder page for Feature #9: Differential Diagnosis (DDx) Generator
import React from 'react';
import Loader from '@/components/Loader'; // Assuming a Loader component

const DDxGamePage: React.FC = () => {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 text-slate-800 dark:text-slate-50">Differential Diagnosis Game</h1>
      <div className="card-base p-6 text-center">
        <p className="text-slate-500 dark:text-slate-400 mb-4">
          Challenge your clinical reasoning by generating and solving differential diagnosis scenarios. Coming soon!
        </p>
        <Loader message="Feature under construction..." />
      </div>
    </div>
  );
};

export default DDxGamePage;