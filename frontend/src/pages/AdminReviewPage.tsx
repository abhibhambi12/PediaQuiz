// frontend/src/pages/AdminReviewPage.tsx
import React from 'react';
import { useAuth } from '../contexts/AuthContext';

const AdminReviewPage: React.FC = () => {
  const { user } = useAuth();

  if (!user || !user.isAdmin) {
    return <div>Access Denied</div>;
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Admin Review Dashboard</h1>
      <p>Review and approve generated content here.</p>
      {/* Add review-specific UI */}
    </div>
  );
};

export default AdminReviewPage;