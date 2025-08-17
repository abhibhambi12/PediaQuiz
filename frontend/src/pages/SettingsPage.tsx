import React from 'react';
import { useAuth } from '../contexts/AuthContext';

const SettingsPage: React.FC = () => {
    const { user, updateProfile, signOut } = useAuth();

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await updateProfile({ displayName: 'Updated Name' }); // Example
            alert('Profile updated');
        } catch (error) {
            console.error('Failed to update profile:', error);
        }
    };

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-4">Settings</h1>
            <form onSubmit={handleUpdate}>
                <div className="mb-4">
                    <label className="block text-sm font-medium mb-1">Name</label>
                    <input
                        type="text"
                        defaultValue={user?.displayName || ''}
                        className="p-2 border rounded"
                    />
                </div>
                <button
                    type="submit"
                    className="p-2 bg-blue-600 text-white rounded"
                >
                    Update Profile
                </button>
            </form>
            <button
                onClick={signOut}
                className="mt-4 p-2 bg-red-600 text-white rounded"
            >
                Sign Out
            </button>
        </div>
    );
};

export default SettingsPage;