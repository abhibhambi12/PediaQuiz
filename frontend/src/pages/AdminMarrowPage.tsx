import React from 'react';
import { useAuth } from '../contexts/AuthContext';

const AdminMarrowPage: React.FC = () => {
  const { user } = useAuth();

  if (!user || !user.isAdmin) {
    return <div>Access Denied</div>;
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Admin Marrow Dashboard</h1>
      <p>Manage Marrow content and configurations here.</p>
      {/* Add admin-specific UI for managing Marrow content */}
    </div>
  );
};

export default AdminMarrowPage;