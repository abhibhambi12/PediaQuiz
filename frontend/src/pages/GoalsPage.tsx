// frontend/pages/GoalsPage.tsx
// frontend/src/pages/GoalsPage.tsx
import React, { useState, useEffect } from 'react';
import { SparklesIcon } from '@heroicons/react/24/outline';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { getGoals, setGoal, updateGoal, deleteGoal } from '@/services/userDataService';
import { suggestNewGoal } from '@/services/aiService'; // CRITICAL FIX: Import AI suggested goal callable
import ConfirmationModal from '@/components/ConfirmationModal';
import Loader from '@/components/Loader';
// Direct type imports
import { GoalInput, Goal } from '@pediaquiz/types';
import { format, isValid, parseISO } from 'date-fns'; // Used for date formatting
import clsx from 'clsx';
import { Timestamp } from 'firebase/firestore'; // Import Timestamp for date handling

const GoalsPage: React.FC = () => {
    const { user } = useAuth();
    const { addToast } = useToast();
    const queryClient = useQueryClient();

    const [newGoalTitle, setNewGoalTitle] = useState('');
    const [newGoalTargetDate, setNewGoalTargetDate] = useState('');
    const [newGoalType, setNewGoalType] = useState<'chapter' | 'mcq_count' | 'study_time'>('mcq_count');
    const [newGoalTargetValue, setNewGoalTargetValue] = useState<number>(100);
    const [newGoalReward, setNewGoalReward] = useState<string>('');

    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
    const [editGoalTitle, setEditGoalTitle] = useState('');
    const [editGoalTargetDate, setEditGoalTargetDate] = useState('');
    const [editGoalProgress, setEditGoalProgress] = useState(0);
    const [editGoalIsCompleted, setEditGoalIsCompleted] = useState(false);
    const [editGoalReward, setEditGoalReward] = useState<string>('');

    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [goalToDelete, setGoalToDelete] = useState<string | null>(null);

    // CRITICAL FIX: State for AI suggested goal
    const [isAISuggestionModalOpen, setIsAISuggestionModalOpen] = useState(false);
    const [aiSuggestedGoal, setAiSuggestedGoal] = useState<GoalInput | null>(null);

    const { data: goals, isLoading: isLoadingGoals, error: goalsError } = useQuery<Goal[], Error>({
        queryKey: ['userGoals', user?.uid],
        queryFn: () => getGoals(user!.uid),
        enabled: !!user?.uid,
    });

    useEffect(() => {
        if (goalsError) addToast(`Error loading goals: ${goalsError.message}`, 'error');
    }, [goalsError, addToast]);

    const setGoalMutation = useMutation({
        mutationFn: (goalData: Omit<GoalInput, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => setGoal(goalData),
        onSuccess: () => {
            addToast("Goal added successfully!", "success");
            queryClient.invalidateQueries({ queryKey: ['userGoals'] });
            setNewGoalTitle('');
            setNewGoalTargetDate('');
            setNewGoalTargetValue(100);
            setNewGoalReward('');
            setIsAISuggestionModalOpen(false); // Close suggestion modal after accepting
        },
        onError: (error: any) => addToast(`Failed to add goal: ${error.message}`, "error"),
    });

    const updateGoalMutation = useMutation({
        mutationFn: (goalData: Partial<GoalInput> & { id: string }) => updateGoal(goalData),
        onSuccess: () => {
            addToast("Goal updated successfully!", "success");
            queryClient.invalidateQueries({ queryKey: ['userGoals'] });
            setIsEditModalOpen(false);
            setEditingGoal(null);
        },
        onError: (error: any) => addToast(`Failed to update goal: ${error.message}`, "error"),
    });

    const deleteGoalMutation = useMutation({
        mutationFn: (goalId: string) => deleteGoal(goalId),
        onSuccess: () => {
            addToast("Goal deleted successfully!", "success");
            queryClient.invalidateQueries({ queryKey: ['userGoals'] });
            setIsDeleteModalOpen(false);
            setGoalToDelete(null);
        },
        onError: (error: any) => addToast(`Failed to delete goal: ${error.message}`, "error"),
    });

    // CRITICAL FIX: AI Suggested Goal Mutation
    const suggestNewGoalMutation = useMutation({
        mutationFn: () => suggestNewGoal({ userId: user!.uid }), // Assuming userId is passed implicitly or directly
        onSuccess: (data) => {
            if (data.data.success && data.data.goal) {
                setAiSuggestedGoal(data.data.goal);
                setIsAISuggestionModalOpen(true);
            } else {
                addToast("AI could not suggest a new goal at this time.", "info");
            }
        },
        onError: (error: any) => addToast(`Failed to get AI goal suggestion: ${error.message}`, "error"),
    });


    const handleAddGoal = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newGoalTitle.trim() || !newGoalTargetDate || (newGoalType !== 'chapter' && newGoalTargetValue <= 0)) {
            addToast("Please fill all required fields correctly.", "error");
            return;
        }

        const goalData: Omit<GoalInput, 'id' | 'userId' | 'createdAt' | 'updatedAt'> = {
            title: newGoalTitle.trim(),
            // Ensure targetDate is a valid Date object or string as per GoalInput
            targetDate: new Date(newGoalTargetDate),
            progress: 0,
            type: newGoalType,
            targetValue: newGoalType === 'chapter' ? undefined : newGoalTargetValue,
            currentValue: 0,
            reward: newGoalReward.trim() || undefined,
        };

        setGoalMutation.mutate(goalData);
    };

    const handleEditGoalClick = (goal: Goal) => {
        setEditingGoal(goal);
        setEditGoalTitle(goal.title);
        // Ensure targetDate is converted correctly to a string for date input
        const targetDate = goal.targetDate instanceof Timestamp ? goal.targetDate.toDate() : (goal.targetDate as Date);
        setEditGoalTargetDate(isValid(targetDate) ? format(targetDate, 'yyyy-MM-dd') : '');
        setEditGoalProgress(goal.progress);
        setEditGoalIsCompleted(goal.isCompleted || false);
        setEditGoalReward(goal.reward || '');
        setIsEditModalOpen(true);
    };

    const handleSaveEditGoal = () => {
        if (!editingGoal || !editGoalTitle.trim() || !editGoalTargetDate) return;

        const updates: Partial<GoalInput> & { id: string } = {
            id: editingGoal.id,
            title: editGoalTitle.trim(),
            // Ensure targetDate is a valid Date object or string as per GoalInput
            targetDate: new Date(editGoalTargetDate),
            progress: editGoalProgress,
            isCompleted: editGoalIsCompleted,
            reward: editGoalReward.trim() || undefined,
        };
        updateGoalMutation.mutate(updates);
    };

    const handleDeleteGoalClick = (goalId: string) => {
        setGoalToDelete(goalId);
        setIsDeleteModalOpen(true);
    };

    const handleConfirmDelete = () => {
        if (goalToDelete) {
            deleteGoalMutation.mutate(goalToDelete);
        }
    };

    // CRITICAL FIX: Handle accepting AI suggested goal
    const handleAcceptSuggestedGoal = () => {
        if (aiSuggestedGoal) {
            setGoalMutation.mutate(aiSuggestedGoal);
        }
    };


    if (isLoadingGoals) return <Loader message="Loading goals..." />;
    if (!user) return <div className="text-center p-10 text-slate-500">Please log in to manage your goals.</div>;

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold flex items-center gap-3 text-slate-800 dark:text-slate-50">
                <SparklesIcon className="h-8 w-8 text-sky-500" />
                <span>Your Study Goals</span>
            </h1>

            <div className="card-base p-6">
                <h2 className="text-xl font-bold mb-4 text-slate-700 dark:text-slate-300">Add a New Goal</h2>
                <form onSubmit={handleAddGoal} className="space-y-3">
                    <div>
                        <label htmlFor="newGoalTitle" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Goal Title</label>
                        <input id="newGoalTitle" type="text" value={newGoalTitle} onChange={(e) => setNewGoalTitle(e.target.value)} placeholder="e.g., Master Cardiology" className="input-field" required disabled={setGoalMutation.isPending} />
                    </div>
                    <div>
                        <label htmlFor="newGoalTargetDate" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Target Date</label>
                        <input id="newGoalTargetDate" type="date" value={newGoalTargetDate} onChange={(e) => setNewGoalTargetDate(e.target.value)} className="input-field" required disabled={setGoalMutation.isPending} />
                    </div>
                    <div>
                        <label htmlFor="newGoalType" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Goal Type</label>
                        <select id="newGoalType" value={newGoalType} onChange={(e) => setNewGoalType(e.target.value as any)} className="input-field" disabled={setGoalMutation.isPending}>
                            <option value="mcq_count">MCQ Count</option>
                            <option value="chapter">Master a Chapter</option>
                            <option value="study_time">Study Time (hours)</option>
                        </select>
                    </div>
                    {newGoalType !== 'chapter' && (
                        <div>
                            <label htmlFor="newGoalTargetValue" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Target Value</label>
                            <input id="newGoalTargetValue" type="number" value={newGoalTargetValue} onChange={(e) => setNewGoalTargetValue(Number(e.target.value))} className="input-field" min={1} required disabled={setGoalMutation.isPending} />
                        </div>
                    )}
                    <div>
                        <label htmlFor="newGoalReward" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Optional Reward</label>
                        <input id="newGoalReward" type="text" value={newGoalReward} onChange={(e) => setNewGoalReward(e.target.value)} placeholder="e.g., New Theme unlocked!" className="input-field" disabled={setGoalMutation.isPending} />
                    </div>
                    <button type="submit" className="btn-primary w-full" disabled={setGoalMutation.isPending}>
                        {setGoalMutation.isPending ? 'Adding...' : 'Add Goal'}
                    </button>
                    {/* CRITICAL FIX: AI Suggested Goals button */}
                    <button
                        type="button"
                        onClick={() => suggestNewGoalMutation.mutate()}
                        disabled={suggestNewGoalMutation.isPending}
                        className="btn-secondary w-full mt-2"
                    >
                        {suggestNewGoalMutation.isPending ? 'Suggesting...' : '✨ AI Suggest a Goal'}
                    </button>
                </form>
            </div>
            
            <div className="card-base p-6">
                <h2 className="text-xl font-bold mb-4 text-slate-700 dark:text-slate-300">Active Goals</h2>
                {goals && goals.length > 0 ? (
                    <div className="space-y-3">
                        {goals.map((goal) => (
                            <div key={goal.id} className="p-3 bg-slate-50 dark:bg-slate-700 rounded-lg shadow-sm">
                                <div className="flex justify-between items-center mb-1">
                                    <h3 className="font-semibold text-slate-800 dark:text-slate-200">{goal.title}</h3>
                                    <span className={clsx("px-2 py-0.5 rounded-full text-xs font-medium", goal.isCompleted ? "bg-green-100 text-green-800" : "bg-sky-100 text-sky-800")}>{goal.isCompleted ? 'Completed' : 'Active'}</span>
                                </div>
                                <p className="text-sm text-slate-600 dark:text-slate-400">
                                  {/* Ensure formatting is robust for Date or Timestamp */}
                                  Target: {goal.targetDate instanceof Timestamp ? format(goal.targetDate.toDate(), 'PPP') : (goal.targetDate instanceof Date ? format(goal.targetDate, 'PPP') : 'N/A')}
                                </p>
                                <div className="w-full bg-slate-300 dark:bg-slate-600 rounded-full h-2 mt-2"><div className="bg-sky-500 h-2 rounded-full" style={{ width: `${goal.progress}%` }}></div></div>
                                <div className="flex justify-end space-x-2 mt-3">
                                    <button onClick={() => handleEditGoalClick(goal)} className="btn-neutral text-xs py-1 px-2">Edit</button>
                                    <button onClick={() => handleDeleteGoalClick(goal.id)} className="btn-danger text-xs py-1 px-2">Delete</button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : <p className="text-center text-slate-500 py-4">No active goals. Add one above!</p>}
            </div>

            {isEditModalOpen && editingGoal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-sm w-full shadow-xl">
                        <h2 className="text-lg font-semibold mb-4">Edit Goal</h2>
                        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); handleSaveEditGoal(); }}>
                            <input type="text" value={editGoalTitle} onChange={e => setEditGoalTitle(e.target.value)} className="input-field" />
                            <input type="date" value={editGoalTargetDate} onChange={e => setEditGoalTargetDate(e.target.value)} className="input-field" />
                            <input type="number" value={editGoalProgress} onChange={e => setEditGoalProgress(Number(e.target.value))} className="input-field" min="0" max="100" />
                            <input type="text" value={editGoalReward} onChange={e => setEditGoalReward(e.target.value)} className="input-field" placeholder="Reward..." />
                            <label className="flex items-center"><input type="checkbox" checked={editGoalIsCompleted} onChange={e => setEditGoalIsCompleted(e.target.checked)} className="mr-2" /> Mark as Completed</label>
                            <div className="flex justify-end gap-2"><button type="button" onClick={() => setIsEditModalOpen(false)} className="btn-neutral">Cancel</button><button type="submit" className="btn-primary">Save</button></div>
                        </form>
                    </div>
                </div>
            )}

            <ConfirmationModal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} onConfirm={handleConfirmDelete} title="Delete Goal" message="Are you sure you want to delete this goal?" variant="danger" isLoading={deleteGoalMutation.isPending} />

            {/* CRITICAL FIX: AI Suggested Goal Modal */}
            <ConfirmationModal
                isOpen={isAISuggestionModalOpen}
                onClose={() => setIsAISuggestionModalOpen(false)}
                onConfirm={handleAcceptSuggestedGoal}
                title="AI Suggested Goal"
                message="PediaQuiz suggests a new goal for you!"
                confirmText="Accept Goal"
                cancelText="Decline"
                variant="confirm"
                isLoading={setGoalMutation.isPending}
            >
                {aiSuggestedGoal && (
                    <div className="text-left text-slate-700 dark:text-slate-300">
                        <p className="font-semibold text-lg mb-2">{aiSuggestedGoal.title}</p>
                        <p>Type: {aiSuggestedGoal.type}</p>
                        {aiSuggestedGoal.targetValue && <p>Target: {aiSuggestedGoal.targetValue}</p>}
                        {aiSuggestedGoal.reward && <p>Reward: {aiSuggestedGoal.reward}</p>}
                        {aiSuggestedGoal.targetDate && <p>Due: {format(new Date(aiSuggestedGoal.targetDate), 'PPP')}</p>}
                    </div>
                )}
            </ConfirmationModal>
        </div>
    );
};

export default GoalsPage;