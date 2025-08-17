import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';

const SettingsPage: React.FC = () => {
    const { user, updateUserDoc, logout } = useAuth(); // CORRECTED: Use correct function names
    const { addToast } = useToast();

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const displayNameInput = form.elements.namedItem('displayName') as HTMLInputElement;
        const displayName = displayNameInput.value;

        if (!displayName.trim()) {
            addToast("Display name cannot be empty.", "error");
            return;
        }

        try {
            await updateUserDoc({ displayName });
            addToast("Profile updated successfully!", "success");
        } catch (error) {
            console.error('Failed to update profile:', error);
            addToast("Failed to update profile.", "error");
        }
    };

    return (
        <div className="p-6 max-w-2xl mx-auto">
            <h1 className="text-3xl font-bold mb-6">Settings</h1>
            <div className="card-base p-6">
                <form onSubmit={handleUpdate}>
                    <div className="mb-4">
                        <label htmlFor="displayName" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                            Display Name
                        </label>
                        <input
                            id="displayName"
                            type="text"
                            name="displayName"
                            defaultValue={user?.displayName || ''}
                            className="input-field"
                        />
                    </div>
                    <button
                        type="submit"
                        className="btn-primary"
                    >
                        Update Profile
                    </button>
                </form>
            </div>
            <div className="card-base p-6 mt-6">
                <h2 className="text-xl font-semibold mb-4">Account</h2>
                <button
                    onClick={logout}
                    className="btn-danger"
                >
                    Sign Out
                </button>
            </div>
        </div>
    );
};

export default SettingsPage;