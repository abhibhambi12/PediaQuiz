// frontend/src/pages/SettingsPage.tsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useToast } from '@/components/Toast';
import ConfirmationModal from '@/components/ConfirmationModal';
import Loader from '@/components/Loader';
import { updateEmail, updatePassword, deleteUserAccount } from '@/services/apiService';

const SettingsPage: React.FC = () => {
    const { user, updateUserDoc, logout } = useAuth();
    const { state: settingsState, dispatch: settingsDispatch } = useSettings();
    const { addToast } = useToast();

    const [displayName, setDisplayName] = useState('');
    const [newEmail, setNewEmail] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [notificationSettings, setNotificationSettings] = useState(user?.notificationSettings || {});
    const [isProcessing, setIsProcessing] = useState(false);
    const [modalAction, setModalAction] = useState<'security' | 'delete' | 'logout' | null>(null);

    useEffect(() => {
        if (user) {
            setDisplayName(user.displayName || '');
            setNewEmail(user.email || '');
            setNotificationSettings(user.notificationSettings || {});
        }
    }, [user]);

    const handleProfileUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || (displayName.trim() === user.displayName && JSON.stringify(notificationSettings) === JSON.stringify(user.notificationSettings))) return;
        setIsProcessing(true);
        try {
            await updateUserDoc({ displayName: displayName.trim(), notificationSettings });
            addToast("Profile updated!", "success");
        } catch (error: any) { addToast(`Update failed: ${error.message}`, "error"); }
        finally { setIsProcessing(false); }
    };

    const handleConfirmAction = async (passwordInput?: string) => {
        if (!passwordInput && modalAction !== 'logout') {
            addToast("Password confirmation is required.", "error");
            return;
        }
        setIsProcessing(true);
        try {
            switch (modalAction) {
                case 'security':
                    if (newEmail !== user?.email) await updateEmail({ newEmail, password: passwordInput! });
                    if (newPassword) await updatePassword({ newPassword, currentPassword: passwordInput! });
                    addToast("Security settings updated. Please re-login.", "success");
                    await logout();
                    break;
                case 'delete':
                    await deleteUserAccount({ password: passwordInput! });
                    addToast("Account deleted successfully.", "success");
                    break;
                case 'logout':
                    await logout();
                    break;
            }
        } catch (error: any) { addToast(`Action failed: ${error.message}`, "error"); }
        finally {
            setIsProcessing(false);
            setModalAction(null);
            setNewPassword('');
        }
    };

    const handleThemeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        settingsDispatch({ type: 'SET_THEME', payload: e.target.value as 'light' | 'dark' | 'system' });
    };

    if (!user) return <Loader fullScreen />;

    return (
        <div className="p-6 max-w-2xl mx-auto space-y-6">
            <h1 className="text-3xl font-bold">Settings</h1>
            
            <form onSubmit={handleProfileUpdate} className="card-base p-6 space-y-4">
                <h2 className="text-xl font-semibold mb-2">Profile & Notifications</h2>
                <div>
                    <label htmlFor="displayName" className="block text-sm font-medium">Display Name</label>
                    <input id="displayName" type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="input-field mt-1" disabled={isProcessing} />
                </div>
                <div>
                    <label className="block text-sm font-medium">Notification Preferences</label>
                    <div className="mt-2 space-y-2">
                         <label className="flex items-center gap-2"><input type="checkbox" className="form-checkbox" checked={notificationSettings.studyReminders || false} onChange={e => setNotificationSettings(s => ({...s, studyReminders: e.target.checked}))} /> Study Reminders</label>
                         <label className="flex items-center gap-2"><input type="checkbox" className="form-checkbox" checked={notificationSettings.newContent || false} onChange={e => setNotificationSettings(s => ({...s, newContent: e.target.checked}))} /> New Content Alerts</label>
                    </div>
                </div>
                <button type="submit" className="btn-primary" disabled={isProcessing}>Save Profile</button>
            </form>

            <div className="card-base p-6 space-y-4">
                 <h2 className="text-xl font-semibold mb-2">Security</h2>
                 <div>
                    <label htmlFor="newEmail" className="block text-sm font-medium">Email Address (current: {user.email})</label>
                    <input id="newEmail" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="input-field mt-1" />
                </div>
                <div>
                    <label htmlFor="newPassword">New Password</label>
                    <input id="newPassword" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Leave blank to keep current password" className="input-field mt-1" />
                </div>
                <button onClick={() => setModalAction('security')} className="btn-secondary" disabled={isProcessing}>Save Security Changes</button>
            </div>

            <div className="card-base p-6">
                <h2 className="text-xl font-semibold mb-4">Display</h2>
                <label htmlFor="themeSelect" className="block text-sm font-medium mb-1">App Theme</label>
                <select id="themeSelect" className="input-field" value={settingsState.theme} onChange={handleThemeChange} disabled={isProcessing}>
                    <option value="system">System Default</option>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                </select>
            </div>
            
            <div className="card-base p-6 bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800">
                <h2 className="text-xl font-semibold mb-4 text-red-700 dark:text-red-300">Account Actions</h2>
                <button onClick={() => setModalAction('logout')} className="btn-neutral mr-3">Sign Out</button>
                <button onClick={() => setModalAction('delete')} className="btn-danger">Delete Account</button>
            </div>

            <ConfirmationModal 
                isOpen={!!modalAction}
                onClose={() => setModalAction(null)} 
                onConfirm={handleConfirmAction}
                title={`Confirm ${modalAction}`}
                message={modalAction === 'logout' ? 'Are you sure you want to sign out?' : 'For your security, please enter your current password to confirm this action.'}
                isInputModal={modalAction !== 'logout'}
                isLoading={isProcessing}
                variant={modalAction === 'delete' ? 'danger' : 'confirm'}
            />
        </div>
    );
};
export default SettingsPage;