// frontend/pages/SettingsPage.tsx
// frontend/pages/SettingsPage.tsx
import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';
import ConfirmationModal from '@/components/ConfirmationModal';
import { updateTheme } from '@/services/aiService'; // Import the callable function for theme updates

const SettingsPage: React.FC = () => {
    const { user, updateUserDoc, logout } = useAuth();
    const { addToast } = useToast();
    const [isConfirmLogoutOpen, setIsConfirmLogoutOpen] = useState(false);
    const [selectedTheme, setSelectedTheme] = useState(user?.theme || 'default');

    // Define available themes with their unlock requirements
    const availableThemes = useMemo(() => ([
        { id: 'default', name: 'Default (Light/Dark)', requiredLevel: 1 },
        { id: 'ocean-blue', name: 'Ocean Blue', requiredLevel: 5 }, // Unlocked at Level 5
        { id: 'forest-green', name: 'Forest Green', requiredLevel: 10 }, // Unlocked at Level 10
    ]), []);

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const displayNameInput = form.elements.namedItem('displayName') as HTMLInputElement;
        const displayName = displayNameInput.value;

        if (!displayName.trim()) {
            addToast("Display name cannot be empty.", "error");
            return;
        }

        try {
            // Call updateUserDoc from AuthContext to update Firestore user document
            await updateUserDoc({ displayName });
            addToast("Profile updated successfully!", "success");
        } catch (error: any) {
            addToast(`Failed to update profile: ${error.message}`, "error");
            console.error('Failed to update profile:', error);
        }
    };

    const confirmLogout = () => {
        setIsConfirmLogoutOpen(true);
    };

    const handleLogout = async () => {
        await logout(); // Calls logout from AuthContext
        addToast("Logged out successfully!", "success");
        setIsConfirmLogoutOpen(false);
    };

    // Handle theme change logic (Feature #1.1 fix)
    const handleThemeChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
        const newTheme = event.target.value;
        const themeOption = availableThemes.find(theme => theme.id === newTheme);
        const currentUserLevel = user?.level ?? 1;

        // Check if theme is unlocked
        if (themeOption?.requiredLevel && currentUserLevel < themeOption.requiredLevel) {
            addToast(`Theme "${themeOption.name}" requires Level ${themeOption.requiredLevel}. You are Level ${currentUserLevel}.`, "warning");
            setSelectedTheme(user?.theme || 'default'); // Revert selection to current user theme
            return;
        }

        setSelectedTheme(newTheme); // Optimistic update of UI
        try {
            // Call backend callable function to update theme in Firestore
            await updateTheme({ themeName: newTheme });

            // CRITICAL FIX: Apply theme to HTML element by toggling 'dark' class based on themeName
            // This assumes 'default' is light mode and others are dark mode variants.
            // For more complex themes (e.g., 'ocean-blue' being a specific color scheme class),
            // you'd manage those classes explicitly.
            if (newTheme === 'default') {
                document.documentElement.classList.remove('dark');
                document.documentElement.removeAttribute('data-theme'); // Remove any custom theme attribute
            } else {
                document.documentElement.classList.add('dark'); // Enable dark mode styles
                // Add a data-theme attribute or specific class for visual variants if needed
                // document.documentElement.setAttribute('data-theme', newTheme); // Example for custom theming
            }

            addToast(`Theme updated to ${themeOption?.name || newTheme}!`, "success");
        } catch (error: any) {
            addToast(`Failed to update theme: ${error.message}`, "error");
            setSelectedTheme(user?.theme || 'default'); // Revert selection on error
            console.error('Failed to update theme:', error);
        }
    };

    // Apply theme on component mount based on user's current theme from Firestore
    useEffect(() => {
        if (user?.theme) {
            // CRITICAL FIX: Apply initial theme using classList based on user's saved preference
            if (user.theme === 'default') {
                document.documentElement.classList.remove('dark');
            } else {
                document.documentElement.classList.add('dark');
                // If you had complex custom theme classes, they would be applied here
                // document.documentElement.setAttribute('data-theme', user.theme); 
            }
            setSelectedTheme(user.theme);
        }
    }, [user?.theme]);


    return (
        <div className="p-6 max-w-2xl mx-auto">
            <h1 className="text-3xl font-bold mb-6 text-slate-800 dark:text-slate-50">Settings</h1>
            <div className="card-base p-6 mb-6">
                <h2 className="text-xl font-semibold mb-4 text-slate-700 dark:text-slate-300">Profile Information</h2>
                <form onSubmit={handleUpdateProfile} className="space-y-4">
                    <div>
                        <label htmlFor="displayName" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                            Display Name
                        </label>
                        <input
                            id="displayName"
                            type="text"
                            name="displayName"
                            defaultValue={user?.displayName || ''}
                            className="input-field"
                            required
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

            <div className="card-base p-6 mb-6">
                <h2 className="text-xl font-semibold mb-4 text-slate-700 dark:text-slate-300">Display Settings</h2>
                <div>
                    <label htmlFor="themeSelect" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        App Theme
                    </label>
                    <select
                        id="themeSelect"
                        className="input-field"
                        value={selectedTheme}
                        onChange={handleThemeChange}
                    >
                        {availableThemes.map(theme => (
                            <option
                                key={theme.id}
                                value={theme.id}
                                disabled={!!(theme.requiredLevel && (user?.level ?? 1) < theme.requiredLevel)}
                            >
                                {theme.name} {theme.requiredLevel && theme.requiredLevel > 1 && `(Level ${theme.requiredLevel})`}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {user?.badges && user.badges.length > 0 && (
                <div className="card-base p-6 mb-6">
                    <h2 className="text-xl font-semibold mb-4 text-slate-700 dark:text-slate-300">Your Badges</h2>
                    <div className="flex flex-wrap gap-2">
                        {user.badges.map(badge => (
                            <span key={badge} className="px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300">
                                {badge}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            <div className="card-base p-6">
                <h2 className="text-xl font-semibold mb-4 text-slate-700 dark:text-slate-300">Account Actions</h2>
                <button
                    onClick={confirmLogout}
                    className="btn-danger"
                >
                    Sign Out
                </button>
            </div>

            <ConfirmationModal
                isOpen={isConfirmLogoutOpen}
                onClose={() => setIsConfirmLogoutOpen(false)}
                onConfirm={handleLogout}
                title="Confirm Logout"
                message="Are you sure you want to sign out?"
            />
        </div>
    );
};

export default SettingsPage;