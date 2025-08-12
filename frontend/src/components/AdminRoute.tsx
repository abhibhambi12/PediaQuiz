import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import Loader from './Loader';

interface AdminRouteProps {
    children: React.ReactElement;
}

const AdminRoute: React.FC<AdminRouteProps> = ({ children }) => {
    const { user, loading } = useAuth();

    if (loading) {
        return <Loader message="Verifying permissions..." />;
    }

    if (!user || !user.isAdmin) {
        // Redirect non-admins to the home page
        return <Navigate to="/" replace />;
    }

    return children;
};

export default AdminRoute;