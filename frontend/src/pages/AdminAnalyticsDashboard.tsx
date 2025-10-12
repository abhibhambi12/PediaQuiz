// frontend/src/pages/AdminAnalyticsDashboard.tsx
import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import Loader from '@/components/Loader';
import { Bar, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement } from 'chart.js';
import { getAdminAnalytics } from '@/services/apiService';
import type { AdminAnalyticsData } from '@pediaquiz/types';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

const AdminAnalyticsDashboard: React.FC = () => {
    const { user } = useAuth();
    const { data, isLoading } = useQuery<AdminAnalyticsData, Error>({
        queryKey: ['adminAnalytics'],
        queryFn: async () => (await getAdminAnalytics()).data,
        enabled: !!user?.isAdmin,
    });

    const chartOptions = { responsive: true, maintainAspectRatio: false };
    const dailyActivityChartData = {
        labels: data?.dailyActivity.map(a => a.date) || [],
        datasets: [{ label: 'New Users', data: data?.dailyActivity.map(a => a.newUsers), backgroundColor: '#3b82f6' }, { label: 'Quizzes Completed', data: data?.dailyActivity.map(a => a.quizzesCompleted), backgroundColor: '#10b981' }],
    };
    const quizModePieData = {
        labels: Object.keys(data?.quizModeBreakdown || {}),
        datasets: [{ data: Object.values(data?.quizModeBreakdown || {}), backgroundColor: ['#3b82f6', '#8b5cf6', '#10b981', '#ef4444', '#f59e0b'] }],
    };

    if (isLoading) return <Loader fullScreen message="Loading analytics..." />;

    return (
        <div className="p-6 max-w-6xl mx-auto space-y-6">
            <h1 className="text-3xl font-bold">Admin Analytics</h1>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="card-base p-6 text-center">
                    <p className="text-sm font-medium text-slate-500">Total Users</p>
                    <p className="text-3xl font-bold">{data?.totalUsers || 0}</p>
                </div>
                <div className="card-base p-6 text-center">
                    <p className="text-sm font-medium text-slate-500">Quizzes Completed</p>
                    <p className="text-3xl font-bold">{data?.totalQuizzesCompleted || 0}</p>
                </div>
                <div className="card-base p-6 text-center">
                    <p className="text-sm font-medium text-slate-500">Total Approved Content</p>
                    <p className="text-3xl font-bold">{data?.totalContentItems || 0}</p>
                </div>
            </div>
            
            <div className="card-base p-6">
                <h2 className="text-xl font-bold mb-4">Live Content Counts</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                    <div>
                        <p className="text-sm font-medium text-slate-500">General MCQs</p>
                        <p className="text-2xl font-bold">{data?.masterMcqCount || 0}</p>
                    </div>
                    <div>
                        <p className="text-sm font-medium text-slate-500">Marrow MCQs</p>
                        <p className="text-2xl font-bold">{data?.marrowMcqCount || 0}</p>
                    </div>
                    <div>
                        <p className="text-sm font-medium text-slate-500">Flashcards</p>
                        <p className="text-2xl font-bold">{data?.flashcardCount || 0}</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="card-base p-6 h-80">
                    <h2 className="text-xl font-bold mb-4">Daily Activity (Sample)</h2>
                    <Bar options={chartOptions as any} data={dailyActivityChartData} />
                </div>
                <div className="card-base p-6 h-80">
                    <h2 className="text-xl font-bold mb-4">Quiz Modes (Sample)</h2>
                    <Doughnut data={quizModePieData} options={chartOptions as any} />
                </div>
            </div>
        </div>
    );
};
export default AdminAnalyticsDashboard;