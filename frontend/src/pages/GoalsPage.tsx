import React, { useState } from 'react';
import { SparklesIcon } from '@heroicons/react/24/outline';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { getGoals as fetchGoals, setGoal, deleteGoal } from '@/services/apiService';
import { suggestNewGoal, getDailyGoal } from '@/services/aiService';
import Loader from '@/components/Loader';
import { Goal, GoalInput } from '@pediaquiz/types';
import { format } from 'date-fns';
import { safeToDate } from '@/utils/dateUtils';

const GoalsPage: React.FC = () => {
    const { user } = useAuth();
    const { addToast } = useToast();
    const queryClient = useQueryClient();

    const [newGoal, setNewGoal] = useState<Omit<GoalInput, 'id' | 'userId'>>({ title: '', targetDate: '', type: 'mcq_count', targetValue: 100, currentValue: 0 });
    
    const { data: goals, isLoading: isLoadingGoals } = useQuery<Goal[], Error>({ queryKey: ['userGoals', user?.uid], queryFn: async () => (await fetchGoals()).data, enabled: !!user?.uid });

    const mutationOptions = {
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['userGoals'] }); addToast("Goal saved!", "success"); },
        onError: (error: any) => addToast(`Error: ${error.message}`, "error"),
    };

    const setGoalMutation = useMutation({ mutationFn: setGoal, ...mutationOptions });
    const deleteGoalMutation = useMutation({ mutationFn: (id: string) => deleteGoal({ goalId: id }), ...mutationOptions });
    
    const suggestGoalMutation = useMutation({ 
        mutationFn: () => suggestNewGoal({ userId: user!.uid }), 
        onSuccess: (data) => {
            if (data.data.goal) {
                const date = safeToDate(data.data.goal.targetDate);
                const formattedDate = date.toISOString().split('T')[0];
                setNewGoal(prev => ({ ...prev, ...data.data.goal, targetDate: formattedDate }));
                addToast("AI has suggested a new goal for you!", "info");
            }
        },
        onError: (error: any) => addToast(`Suggestion failed: ${error.message}`, "error") 
    });

    const dailyGoalMutation = useMutation({
        mutationFn: () => getDailyGoal({ userId: user!.uid }),
        onSuccess: (data) => {
            if (data.data.goal) {
                const date = safeToDate(data.data.goal.targetDate);
                const formattedDate = date.toISOString().split('T')[0];
                setNewGoal(prev => ({ ...prev, ...data.data.goal, targetDate: formattedDate }));
                addToast("Here is your AI-suggested daily goal!", "info");
            }
        },
        onError: (error: any) => addToast(`AI Daily Goal failed: ${error.message}`, "error") 
    });

    const handleAddGoal = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newGoal.title || !newGoal.targetDate) {
            addToast("Please provide a title and target date.", "error");
            return;
        }
        setGoalMutation.mutate({ ...newGoal, targetDate: new Date(newGoal.targetDate).toISOString() });
        setNewGoal({ title: '', targetDate: '', type: 'mcq_count', targetValue: 100, currentValue: 0 });
    };

    if (isLoadingGoals) return <Loader fullScreen message="Loading goals..." />;

    return (
        <div className="space-y-6 max-w-2xl mx-auto">
            <h1 className="text-3xl font-bold flex items-center gap-3"><SparklesIcon className="h-8 w-8 text-sky-500" />Your Study Goals</h1>
            <div className="card-base p-6">
                <h2 className="text-xl font-bold mb-4">Add a New Goal</h2>
                <form onSubmit={handleAddGoal} className="space-y-3">
                    <input type="text" value={newGoal.title} onChange={(e) => setNewGoal(g => ({ ...g, title: e.target.value }))} placeholder="Goal Title" className="input-field" required />
                    <input type="date" value={newGoal.targetDate.toString().split('T')[0]} onChange={(e) => setNewGoal(g => ({ ...g, targetDate: e.target.value }))} className="input-field" required />
                    <button type="submit" className="btn-primary w-full" disabled={setGoalMutation.isPending}>Add Goal</button>
                    <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => dailyGoalMutation.mutate()} disabled={dailyGoalMutation.isPending} className="btn-secondary w-full mt-2">🧠 Get Daily Goal</button>
                        <button type="button" onClick={() => suggestGoalMutation.mutate()} disabled={suggestGoalMutation.isPending} className="btn-secondary w-full mt-2">✨ Suggest a Goal</button>
                    </div>
                </form>
            </div>
            <div className="card-base p-6">
                <h2 className="text-xl font-bold mb-4">Active Goals</h2>
                {goals?.length === 0 && <p className="text-center text-slate-500 py-4">No active goals. Add one to get started!</p>}
                {goals?.map((goal: Goal) => (
                    <div key={goal.id} className="p-3 bg-slate-50 dark:bg-slate-700 rounded-lg mb-3">
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="font-semibold">{goal.title}</h3>
                                <p className="text-sm text-slate-500">Target: {format(safeToDate(goal.targetDate), 'PPP')}</p>
                            </div>
                            <button onClick={() => deleteGoalMutation.mutate(goal.id)} className="btn-danger p-1 text-xs">Delete</button>
                        </div>
                        <div className="w-full bg-slate-300 dark:bg-slate-600 rounded-full h-2 mt-2">
                            <div className="bg-sky-500 h-2 rounded-full" style={{ width: `${goal.progress}%` }} title={`${goal.progress}%`}></div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
export default GoalsPage;