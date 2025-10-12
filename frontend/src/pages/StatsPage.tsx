import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { getUserStats } from '@/services/apiService';
import { generatePerformanceAdvice } from '@/services/aiService';
import Loader from '@/components/Loader';
import { useToast } from '@/components/Toast';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import { calculateLevelProgress } from '@/utils/gamification';
import ReactMarkdown from 'react-markdown';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

interface TopicPerformanceData {
  topic: string;
  total: number;
  correct: number;
  accuracy: number;
}

const StatsPage: React.FC = () => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [aiAdvice, setAiAdvice] = useState<string | null>(null);

  const { data: statsData, isLoading } = useQuery({
    queryKey: ['userStats', user?.uid],
    queryFn: async () => (await getUserStats()).data,
    enabled: !!user,
  });

  const { overallStats, topicPerformance } = statsData || {
    overallStats: { attempted: 0, correct: 0, accuracy: 0 },
    topicPerformance: [],
  };

  const generateAdviceMutation = useMutation({
    mutationFn: () =>
      generatePerformanceAdvice({
        overallAccuracy: overallStats.accuracy,
        strongTopics: topicPerformance
          .slice(0, 3)
          .map((t: TopicPerformanceData) => t.topic),
        weakTopics: [...topicPerformance]
          .sort((a: TopicPerformanceData, b: TopicPerformanceData) => a.accuracy - b.accuracy)
          .slice(0, 3)
          .map((t: TopicPerformanceData) => t.topic),
      }),
    onSuccess: (data) => {
      setAiAdvice(data.data.advice);
      addToast('AI advice generated!', 'success');
    },
    onError: (error: any) =>
      addToast(`Failed to generate advice: ${error.message}`, 'error'),
  });

  if (isLoading) return <Loader fullScreen message="Calculating your stats..." />;
  if (!user)
    return <div className="text-center p-10">Please log in to view stats.</div>;

  const { currentLevel, progressToNextLevel } = calculateLevelProgress(
    user.xp || 0
  );
  const pieChartData = {
    labels: ['Correct', 'Incorrect'],
    datasets: [
      {
        data: [
          overallStats.correct,
          overallStats.attempted - overallStats.correct,
        ],
        backgroundColor: ['#22c55e', '#ef4444'],
        borderColor: '#fff',
        borderWidth: 2,
      },
    ],
  };
  const barChartData = {
    labels: topicPerformance.map((d: TopicPerformanceData) => d.topic),
    datasets: [
      {
        label: 'Accuracy (%)',
        data: topicPerformance.map((d: TopicPerformanceData) => d.accuracy),
        backgroundColor: '#0ea5e9',
      },
    ],
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Performance Stats</h1>
      <div className="card-base p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-sm text-slate-500">Level</p>
            <p className="text-2xl font-bold text-sky-500">{currentLevel}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Total XP</p>
            <p className="text-2xl font-bold text-purple-500">{user.xp || 0}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Attempted</p>
            <p className="text-2xl font-bold">{overallStats.attempted}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Accuracy</p>
            <p className="text-2xl font-bold text-green-500">
              {overallStats.accuracy.toFixed(1)}%
            </p>
          </div>
        </div>
        <div className="mt-4">
          <div className="w-full bg-slate-300 dark:bg-slate-600 rounded-full h-2">
            <div
              className="bg-sky-500 h-2 rounded-full"
              style={{ width: `${progressToNextLevel}%` }}
            ></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card-base p-6 h-80">
          <h2 className="text-xl font-bold mb-4">Accuracy</h2>
          <Doughnut
            data={pieChartData}
            options={{ responsive: true, maintainAspectRatio: false }}
          />
        </div>
        <div className="card-base p-6 h-80">
          <h2 className="text-xl font-bold mb-4">Topic Performance</h2>
          <Bar
            data={barChartData}
            options={{ responsive: true, maintainAspectRatio: false }}
          />
        </div>
      </div>

      <div className="card-base p-6">
        <h2 className="text-xl font-bold mb-4">AI Performance Advisor</h2>
        <button
          onClick={() => generateAdviceMutation.mutate()}
          disabled={generateAdviceMutation.isPending}
          className="btn-primary w-full"
        >
          {generateAdviceMutation.isPending
            ? 'Analyzing...'
            : '🤖 Get AI-Powered Advice'}
        </button>
        {aiAdvice && (
          <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg prose dark:prose-invert max-w-none">
            <ReactMarkdown>{aiAdvice}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
};
export default StatsPage;