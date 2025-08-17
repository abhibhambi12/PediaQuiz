import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getGoals, setGoal } from '../services/userDataService';

const GoalsPage: React.FC = () => {
    const { user } = useAuth();
    const [goals, setGoals] = useState<any[]>([]);
    const [newGoal, setNewGoal] = useState('');

    useEffect(() => {
        if (user) {
            getGoals(user.uid).then(setGoals).catch(console.error);
        }
    }, [user]);

    const handleAddGoal = async () => {
        if (!newGoal.trim() || !user) return;
        try {
            await setGoal(user.uid, { title: newGoal });
            setGoals([...goals, { title: newGoal }]);
            setNewGoal('');
        } catch (error) {
            console.error('Failed to add goal:', error);
        }
    };

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-4">Goals</h1>
            <div className="mb-4">
                <input
                    type="text"
                    value={newGoal}
                    onChange={(e) => setNewGoal(e.target.value)}
                    className="p-2 border rounded mr-2"
                    placeholder="Add a new goal"
                />
                <button
                    onClick={handleAddGoal}
                    className="p-2 bg-blue-600 text-white rounded"
                >
                    Add
                </button>
            </div>
            <ul>
                {goals.map((goal, index) => (
                    <li key={index} className="p-2 border-b">
                        {goal.title}
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default GoalsPage;