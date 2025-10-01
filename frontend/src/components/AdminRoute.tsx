import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import Loader from './Loader';
import { User } from '@pediaquiz/types';

interface AdminRouteProps {
    children: React.ReactElement;
    requiredRole: User['role'];
}

const AdminRoute: React.FC<AdminRouteProps> = ({ children, requiredRole }) => {
    const { user, loading } = useAuth();

    if (loading) {
        return <Loader fullScreen message="Verifying permissions..." />;
    }

    const userRole = user?.role || 'student';

    const roleHierarchy = {
        student: 1,
        resident: 2, 
        faculty: 3,
        admin: 4,
    };

    const hasPermission = user && (roleHierarchy[userRole] >= roleHierarchy[requiredRole]);

    if (!hasPermission) {
        return <Navigate to="/" replace />;
    }

    return children;
};

export default AdminRoute;