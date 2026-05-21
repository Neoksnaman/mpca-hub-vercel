import React, { useContext, useState, useRef } from 'react';
import { AppContext } from '../App';
import { UserRole } from '../types';
import { CHROME_PRESET_AVATARS } from '../utils/avatarPresets';
import { updateUserProfile, updateUserPassword, uploadAvatar } from '../services/googleSheetsService';
import { 
    User as UserIcon, 
    Settings as SettingsIcon, 
    Shield, 
    Check, 
    RefreshCw, 
    Building2, 
    Database, 
    ToggleLeft, 
    ToggleRight, 
    Key, 
    Sparkles,
    UserCheck,
    Volume2,
    Calendar,
    Camera,
    Upload
} from 'lucide-react';

const getInitialsAvatarUrl = (firstName: string, lastName: string, bgColor: string = 'b4262a') => {
    const initials = `${firstName || ''} ${lastName || ''}`.trim() || 'User';
    return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(initials)}&radius=50&backgroundColor=${bgColor}`;
};

const Settings: React.FC = () => {
    const context = useContext(AppContext);
    if (!context) return null;
    
    const { theme, toggleTheme, user, setUser, allUsers, refreshData, showToast, playAudioCue } = context;

    // Tabs state
    const [activeTab, setActiveTab] = useState<'profile' | 'preferences' | 'admin'>('profile');

    // Tab 1: Profile form states
    const [firstName, setFirstName] = useState(user?.firstName || '');
    const [lastName, setLastName] = useState(user?.lastName || '');
    const [email, setEmail] = useState((user as any).email || `${user?.username.toLowerCase()}@mpca.com`);
    const [selectedAvatar, setSelectedAvatar] = useState(user?.avatarUrl || getInitialsAvatarUrl(user?.firstName || '', user?.lastName || ''));

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [customPhoto, setCustomPhoto] = useState<string | null>(() => {
        return user?.avatarUrl?.startsWith('data:image/') && !user.avatarUrl.includes('data:image/svg+xml') ? user.avatarUrl : null;
    });
    const [isSavingProfile, setIsSavingProfile] = useState(false);

    const userInitials = `${firstName} ${lastName}`.trim() || user?.username || 'User';

    const initialsAvatars = React.useMemo(() => {
        return [
            `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(userInitials)}&radius=50&backgroundColor=b4262a`,
            `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(userInitials)}&radius=50&backgroundColor=3b82f6`,
            `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(userInitials)}&radius=50&backgroundColor=10b981`,
            `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(userInitials)}&radius=50&backgroundColor=8b5cf6`,
        ];
    }, [userInitials]);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 2 * 1024 * 1024) {
            showToast('Image size should be less than 2MB.', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const base64String = event.target?.result as string;
            setCustomPhoto(base64String);
            setSelectedAvatar(base64String);
            showToast('Custom profile picture uploaded!', 'success');
        };
        reader.readAsDataURL(file);
    };

    // Profile security (Password Reset)
    const [isPasswordFormOpen, setIsPasswordFormOpen] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isSavingPassword, setIsSavingPassword] = useState(false);

    // Tab 2: Preferences states
    const [startTab, setStartTab] = useState(() => localStorage.getItem('startTab') || 'dashboard');
    const [soundAlerts, setSoundAlerts] = useState(() => localStorage.getItem('pref_sound') !== 'false');
    const [emailDigest, setEmailDigest] = useState(() => localStorage.getItem('pref_email') !== 'false');

    const handleToggleSound = () => {
        const nextVal = !soundAlerts;
        setSoundAlerts(nextVal);
        if (nextVal && playAudioCue) {
            playAudioCue('success', true);
        }
    };

    // Tab 3: Admin Company states
    const [firmName, setFirmName] = useState(() => localStorage.getItem('firm_name') || 'MPCA & Associates');
    const [firmTin, setFirmTin] = useState(() => localStorage.getItem('firm_tin') || '009-123-456-000');
    const [firmAddress, setFirmAddress] = useState(() => localStorage.getItem('firm_address') || 'Ayala Avenue, Makati City, Philippines');

    const [isSyncing, setIsSyncing] = useState(false);

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!firstName.trim() || !lastName.trim()) {
            showToast('First and Last names are required.', 'error');
            return;
        }

        setIsSavingProfile(true);
        try {
            let finalAvatarUrl = selectedAvatar;

            // If it's a custom uploaded photo, upload it to Google Drive first
            const isCustomUpload = selectedAvatar.startsWith('data:image/') && selectedAvatar.includes(';base64,');
            if (isCustomUpload) {
                showToast('Uploading profile picture...', 'success');
                const uploadResult = await uploadAvatar(selectedAvatar, user!.username);
                finalAvatarUrl = uploadResult.url;
            }

            showToast('Saving profile settings...', 'success');
            const result = await updateUserProfile(user!.id, {
                firstName,
                lastName,
                email,
                avatarUrl: finalAvatarUrl
            });

            if (result.success && result.user) {
                setUser(result.user);
                setSelectedAvatar(result.user.avatarUrl);
                // If it was a base64 upload, now set it to the finalized Drive URL
                if (isCustomUpload) {
                    setCustomPhoto(result.user.avatarUrl);
                }
                showToast('Profile settings saved successfully!', 'success');
            } else {
                throw new Error('Failed to update profile settings.');
            }
        } catch (error: any) {
            showToast(error.message || 'Error saving profile changes.', 'error');
        } finally {
            setIsSavingProfile(false);
        }
    };

    const handlePasswordReset = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentPassword) {
            showToast('Please enter your current password.', 'error');
            return;
        }
        if (newPassword.length < 6) {
            showToast('New password must be at least 6 characters.', 'error');
            return;
        }
        if (newPassword !== confirmPassword) {
            showToast('Passwords do not match.', 'error');
            return;
        }

        setIsSavingPassword(true);
        try {
            await updateUserPassword(user!.id, currentPassword, newPassword);
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setIsPasswordFormOpen(false);
            showToast('Password updated successfully!', 'success');
        } catch (error: any) {
            showToast(error.message || 'Error updating password. Verify your current password.', 'error');
        } finally {
            setIsSavingPassword(false);
        }
    };

    const handleSavePreferences = () => {
        localStorage.setItem('startTab', startTab);
        localStorage.setItem('pref_sound', String(soundAlerts));
        localStorage.setItem('pref_email', String(emailDigest));
        showToast('Application preferences updated!', 'success');
    };

    const handleSaveFirmProfile = (e: React.FormEvent) => {
        e.preventDefault();
        localStorage.setItem('firm_name', firmName);
        localStorage.setItem('firm_tin', firmTin);
        localStorage.setItem('firm_address', firmAddress);
        showToast('Firm profile metadata updated!', 'success');
    };

    const handleForceSync = async () => {
        setIsSyncing(true);
        try {
            await refreshData();
            showToast('Database fully synchronized!', 'success');
        } catch (e: any) {
            showToast('Database synchronization failed: ' + e.message, 'error');
        } finally {
            setIsSyncing(false);
        }
    };

    // Promote/Demote Roster simulated action
    const toggleRosterRole = (userId: string, currentRole: UserRole) => {
        const targetUser = allUsers.find(u => u.id === userId);
        if (!targetUser) return;
        
        const newRole = currentRole === UserRole.SENIOR ? UserRole.STAFF : UserRole.SENIOR;
        
        showToast(`Simulated: ${targetUser.firstName} promoted to ${newRole}`, 'success');
    };

    return (
        <div className="w-full mx-auto p-2 space-y-6 animate-in fade-in duration-500">
            {/* Premium Header Section */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2 px-1">
                <div className="space-y-0.5">
                    <div className="flex items-center gap-2.5">
                        <div className="w-1.5 h-7 bg-primary rounded-full" />
                        <h1 className="text-3xl font-black text-neutral-dark dark:text-white tracking-tight">System Settings</h1>
                    </div>
                    <p className="text-sm text-secondary dark:text-gray-300 font-medium pl-4 opacity-70 dark:opacity-100">
                        Manage your profile, set UI preferences, and configure integration services.
                    </p>
                </div>
            </div>

            {/* Layout Split: Left Menu Tab List, Right Config Box */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                
                {/* 1. Left Tab Menu */}
                <div className="md:col-span-1 flex flex-row md:flex-col gap-2 overflow-x-auto md:overflow-x-visible pb-2 md:pb-0 border-b md:border-b-0 md:border-r border-neutral-medium/50 dark:border-gray-700/50 pr-0 md:pr-4">
                    <button
                        onClick={() => setActiveTab('profile')}
                        className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all w-full shrink-0 ${activeTab === 'profile' ? 'bg-primary text-white shadow-md shadow-primary/20' : 'text-secondary hover:text-neutral-dark dark:hover:text-white hover:bg-neutral-light/50 dark:hover:bg-gray-800'}`}
                    >
                        <UserIcon size={16} />
                        My Profile
                    </button>
                    <button
                        onClick={() => setActiveTab('preferences')}
                        className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all w-full shrink-0 ${activeTab === 'preferences' ? 'bg-primary text-white shadow-md shadow-primary/20' : 'text-secondary hover:text-neutral-dark dark:hover:text-white hover:bg-neutral-light/50 dark:hover:bg-gray-800'}`}
                    >
                        <SettingsIcon size={16} />
                        Preferences
                    </button>
                    
                    {/* Protected Admin console tab */}
                    {user?.role === UserRole.ADMIN && (
                        <button
                            onClick={() => setActiveTab('admin')}
                            className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all w-full shrink-0 ${activeTab === 'admin' ? 'bg-primary text-white shadow-md shadow-primary/20' : 'text-secondary hover:text-neutral-dark dark:hover:text-white hover:bg-neutral-light/50 dark:hover:bg-gray-800'}`}
                        >
                            <Shield size={16} />
                            Admin Console
                        </button>
                    )}
                </div>

                {/* 2. Right Config Box Panel */}
                <div className="md:col-span-3 space-y-6">
                    
                    {/* TAB A: My Profile & Settings */}
                    {activeTab === 'profile' && (
                        <div className="space-y-6">
                            
                            {/* Profile details card */}
                            <div className="bg-white dark:bg-gray-800 p-8 rounded-[2rem] border border-neutral-medium dark:border-gray-700 shadow-xl space-y-6">
                                <div>
                                    <h3 className="text-base font-black text-neutral-dark dark:text-white">Profile Details</h3>
                                    <p className="text-xs text-secondary dark:text-gray-400 font-medium">Configure how your name and avatar appear across the workspace.</p>
                                </div>

                                {/* Google Chrome inspired "Pick an avatar" Grid */}
                                <div className="space-y-4 pt-2">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-medium dark:border-gray-700 pb-2">
                                        <div>
                                            <h4 className="text-xs font-black text-neutral-dark dark:text-white uppercase tracking-widest">Choose your avatar</h4>
                                        </div>
                                        {/* Upload trigger hidden input */}
                                        <input 
                                            type="file" 
                                            ref={fileInputRef} 
                                            onChange={handleFileUpload} 
                                            accept="image/*" 
                                            className="hidden" 
                                        />
                                    </div>

                                    {/* Grid of Avatars */}
                                    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-7 lg:grid-cols-8 gap-4 max-h-[360px] overflow-y-auto pr-2 py-2 scrollbar-thin">
                                        
                                        {/* Slot 1: Custom Photo Uploader / Active Custom Photo */}
                                        <div className="flex flex-col items-center gap-1.5">
                                            <div className="relative">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (customPhoto) {
                                                            setSelectedAvatar(customPhoto);
                                                        } else {
                                                            fileInputRef.current?.click();
                                                        }
                                                    }}
                                                    className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full transition-all relative overflow-hidden flex items-center justify-center bg-neutral-light dark:bg-gray-900 border-2 ${
                                                        selectedAvatar === customPhoto && customPhoto
                                                            ? 'border-[#1a73e8] ring-4 ring-[#1a73e8]/20 scale-105 p-[2px]' 
                                                            : 'border-dashed border-neutral-dark/30 dark:border-gray-600 hover:border-primary hover:scale-105'
                                                    }`}
                                                >
                                                    {customPhoto ? (
                                                        <img src={customPhoto} alt="Custom upload" className="w-full h-full rounded-full object-cover" />
                                                    ) : (
                                                        <div className="flex flex-col items-center justify-center text-secondary hover:text-primary transition-all">
                                                            <Upload size={16} className="mb-0.5" />
                                                            <span className="text-[8px] font-black uppercase tracking-wider">Upload</span>
                                                        </div>
                                                    )}

                                                    {/* Hover Overlay to change custom image */}
                                                    {customPhoto && (
                                                        <div 
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                fileInputRef.current?.click();
                                                            }}
                                                            className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center text-white cursor-pointer"
                                                            title="Change photo"
                                                        >
                                                            <Camera size={14} />
                                                        </div>
                                                    )}
                                                </button>

                                                {/* Selected Blue Checkmark Badge */}
                                                {customPhoto && selectedAvatar === customPhoto && (
                                                    <div className="absolute -top-1 -right-1 bg-[#1a73e8] text-white w-5 h-5 rounded-full border-2 border-white dark:border-gray-800 flex items-center justify-center shadow-md animate-in zoom-in duration-300">
                                                        <Check size={10} className="stroke-[3]" />
                                                    </div>
                                                )}
                                            </div>
                                            <span className="text-[9px] font-bold text-secondary text-center truncate w-14 sm:w-16">
                                                {customPhoto ? 'My Photo' : 'Add Photo'}
                                            </span>
                                        </div>

                                        {/* Name Initials Presets */}
                                        {initialsAvatars.map((avatar, idx) => (
                                            <div key={`initial-${idx}`} className="flex flex-col items-center gap-1.5">
                                                <div className="relative">
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedAvatar(avatar)}
                                                        className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full transition-all relative overflow-hidden flex items-center justify-center bg-neutral-light dark:bg-gray-900 border-2 ${
                                                            selectedAvatar === avatar 
                                                                ? 'border-[#1a73e8] ring-4 ring-[#1a73e8]/20 scale-105 p-[2px]' 
                                                                : 'border-transparent hover:scale-105 hover:shadow-md'
                                                        }`}
                                                    >
                                                        <img src={avatar} alt="Initials preset" className="w-full h-full rounded-full object-cover" />
                                                    </button>
                                                    {selectedAvatar === avatar && (
                                                        <div className="absolute -top-1 -right-1 bg-[#1a73e8] text-white w-5 h-5 rounded-full border-2 border-white dark:border-gray-800 flex items-center justify-center shadow-md animate-in zoom-in duration-300">
                                                            <Check size={10} className="stroke-[3]" />
                                                        </div>
                                                    )}
                                                </div>
                                                <span className="text-[9px] font-bold text-secondary text-center truncate w-14 sm:w-16">
                                                    Initials {idx + 1}
                                                </span>
                                            </div>
                                        ))}

                                        {/* Chrome-style Illustrated Presets */}
                                        {CHROME_PRESET_AVATARS.map((preset) => (
                                            <div key={preset.id} className="flex flex-col items-center gap-1.5">
                                                <div className="relative">
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedAvatar(preset.url)}
                                                        className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full transition-all relative overflow-hidden flex items-center justify-center bg-neutral-light dark:bg-gray-900 border-2 ${
                                                            selectedAvatar === preset.url 
                                                                ? 'border-[#1a73e8] ring-4 ring-[#1a73e8]/20 scale-105 p-[2px]' 
                                                                : 'border-transparent hover:scale-105 hover:shadow-md'
                                                        }`}
                                                    >
                                                        <img src={preset.url} alt={preset.name} className="w-full h-full rounded-full object-cover" />
                                                    </button>
                                                    {selectedAvatar === preset.url && (
                                                        <div className="absolute -top-1 -right-1 bg-[#1a73e8] text-white w-5 h-5 rounded-full border-2 border-white dark:border-gray-800 flex items-center justify-center shadow-md animate-in zoom-in duration-300">
                                                            <Check size={10} className="stroke-[3]" />
                                                        </div>
                                                    )}
                                                </div>
                                                <span className="text-[9px] font-bold text-secondary text-center truncate w-14 sm:w-16">
                                                    {preset.name}
                                                </span>
                                            </div>
                                        ))}

                                    </div>
                                </div>

                                {/* Form Fields */}
                                <form onSubmit={handleSaveProfile} className="space-y-4 pt-4 border-t border-neutral-medium/30 dark:border-gray-700/50 mt-6">
                                    <div className="mb-2">
                                        <h4 className="text-xs font-black text-neutral-dark dark:text-white uppercase tracking-widest">Personal Information</h4>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-secondary ml-1">First Name</label>
                                            <input
                                                type="text"
                                                value={firstName}
                                                onChange={(e) => setFirstName(e.target.value)}
                                                className="px-4 py-2.5 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium dark:border-gray-700 rounded-2xl text-xs font-black text-neutral-dark dark:text-white outline-none focus:ring-2 focus:ring-primary/20"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-secondary ml-1">Last Name</label>
                                            <input
                                                type="text"
                                                value={lastName}
                                                onChange={(e) => setLastName(e.target.value)}
                                                className="px-4 py-2.5 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium dark:border-gray-700 rounded-2xl text-xs font-black text-neutral-dark dark:text-white outline-none focus:ring-2 focus:ring-primary/20"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-secondary ml-1">Username (ID)</label>
                                            <input
                                                type="text"
                                                value={user?.username || ''}
                                                readOnly
                                                className="px-4 py-2.5 bg-neutral-medium/30 dark:bg-gray-900/50 border border-neutral-medium dark:border-gray-700 rounded-2xl text-xs font-black text-secondary outline-none cursor-not-allowed"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-secondary ml-1">Email Address</label>
                                            <input
                                                type="email"
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                className="px-4 py-2.5 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium dark:border-gray-700 rounded-2xl text-xs font-black text-neutral-dark dark:text-white outline-none focus:ring-2 focus:ring-primary/20"
                                            />
                                        </div>
                                    </div>

                                    {/* Role and Team read-only items */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-neutral-medium dark:border-gray-700 pt-4">
                                        <div className="flex items-center gap-3">
                                            <UserCheck size={16} className="text-primary" />
                                            <div>
                                                <h5 className="text-[9px] font-black uppercase tracking-widest text-secondary">System Assignment</h5>
                                                <p className="text-xs font-black text-neutral-dark dark:text-white uppercase tracking-wider">{user?.role || 'Staff'}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <Building2 size={16} className="text-primary" />
                                            <div>
                                                <h5 className="text-[9px] font-black uppercase tracking-widest text-secondary">Assigned Team</h5>
                                                <p className="text-xs font-black text-neutral-dark dark:text-white uppercase tracking-wider">{user?.team || 'General Staff'}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex justify-end pt-3">
                                        <button
                                            type="submit"
                                            disabled={isSavingProfile}
                                            className="bg-primary text-white px-6 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest shadow-md shadow-primary/20 hover:bg-primary/95 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isSavingProfile && <RefreshCw size={12} className="animate-spin" />}
                                            Save Profile changes
                                        </button>
                                    </div>
                                </form>
                            </div>

                            {/* Security (Password Collapsible) */}
                            <div className="bg-white dark:bg-gray-800 p-8 rounded-[2rem] border border-neutral-medium dark:border-gray-700 shadow-xl space-y-4">
                                <button
                                    onClick={() => setIsPasswordFormOpen(!isPasswordFormOpen)}
                                    className="flex items-center justify-between w-full text-left"
                                >
                                    <div className="flex items-center gap-3">
                                        <Key size={18} className="text-primary" />
                                        <div>
                                            <h3 className="text-sm font-black text-neutral-dark dark:text-white uppercase tracking-widest">Update Account Password</h3>
                                            <p className="text-[10px] text-secondary font-medium mt-0.5">Secure your portal with a new credentials lock.</p>
                                        </div>
                                    </div>
                                    <div className="w-8 h-8 rounded-full border border-neutral-medium dark:border-gray-700 flex items-center justify-center text-secondary hover:text-primary transition-all font-black text-xs">
                                        {isPasswordFormOpen ? '−' : '+'}
                                    </div>
                                </button>

                                {isPasswordFormOpen && (
                                    <form onSubmit={handlePasswordReset} className="space-y-4 pt-4 border-t border-neutral-medium dark:border-gray-700 animate-in slide-in-from-top-3 duration-300">
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                            <div className="flex flex-col gap-1.5">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-secondary ml-1">Current Password</label>
                                                <input
                                                    type="password"
                                                    value={currentPassword}
                                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                                    required
                                                    className="px-4 py-2.5 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium dark:border-gray-700 rounded-2xl text-xs font-black text-neutral-dark dark:text-white outline-none focus:ring-2 focus:ring-primary/20"
                                                />
                                            </div>
                                            <div className="flex flex-col gap-1.5">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-secondary ml-1">New Password</label>
                                                <input
                                                    type="password"
                                                    value={newPassword}
                                                    onChange={(e) => setNewPassword(e.target.value)}
                                                    required
                                                    className="px-4 py-2.5 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium dark:border-gray-700 rounded-2xl text-xs font-black text-neutral-dark dark:text-white outline-none focus:ring-2 focus:ring-primary/20"
                                                />
                                            </div>
                                            <div className="flex flex-col gap-1.5">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-secondary ml-1">Confirm New Password</label>
                                                <input
                                                    type="password"
                                                    value={confirmPassword}
                                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                                    required
                                                    className="px-4 py-2.5 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium dark:border-gray-700 rounded-2xl text-xs font-black text-neutral-dark dark:text-white outline-none focus:ring-2 focus:ring-primary/20"
                                                />
                                            </div>
                                        </div>
                                        <div className="flex justify-end pt-2">
                                            <button
                                                type="submit"
                                                disabled={isSavingPassword}
                                                className="bg-primary text-white px-6 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest shadow-md shadow-primary/20 hover:bg-primary/95 transition-all flex items-center gap-2"
                                            >
                                                {isSavingPassword && <RefreshCw size={12} className="animate-spin" />}
                                                Save Secure password
                                            </button>
                                        </div>
                                    </form>
                                )}
                            </div>

                        </div>
                    )}

                    {/* TAB B: Preferences & Customization */}
                    {activeTab === 'preferences' && (
                        <div className="space-y-6">
                            
                            {/* Theme and General UI settings */}
                            <div className="bg-white dark:bg-gray-800 p-8 rounded-[2rem] border border-neutral-medium dark:border-gray-700 shadow-xl space-y-6">
                                <div>
                                    <h3 className="text-base font-black text-neutral-dark dark:text-white">Workspace Theme</h3>
                                    <p className="text-xs text-secondary dark:text-gray-400 font-medium">Select your preferred color profile for eye comfort.</p>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {/* Light Mode Card */}
                                    <button
                                        onClick={() => theme === 'dark' && toggleTheme()}
                                        className={`p-5 rounded-3xl border-2 text-left transition-all ${theme === 'light' ? 'border-primary bg-primary/[0.02] shadow-lg ring-4 ring-primary/5' : 'border-neutral-medium dark:border-gray-700 hover:border-neutral-dark dark:hover:border-white bg-transparent'}`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <Sparkles size={16} className="text-primary" />
                                            <h4 className="text-xs font-black uppercase tracking-widest text-neutral-dark dark:text-white">Light Mode</h4>
                                        </div>
                                        <p className="text-[10px] text-secondary font-medium mt-1">Sleek, pristine, high-luminance layout.</p>
                                    </button>

                                    {/* Dark Mode Card */}
                                    <button
                                        onClick={() => theme === 'light' && toggleTheme()}
                                        className={`p-5 rounded-3xl border-2 text-left transition-all ${theme === 'dark' ? 'border-primary bg-primary/[0.02] shadow-lg ring-4 ring-primary/5' : 'border-neutral-medium dark:border-gray-700 hover:border-neutral-dark dark:hover:border-white bg-transparent'}`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <Shield size={16} className="text-primary" />
                                            <h4 className="text-xs font-black uppercase tracking-widest text-neutral-dark dark:text-white">Dark Mode</h4>
                                        </div>
                                        <p className="text-[10px] text-secondary font-medium mt-1">Harmonious obsidian/glassmorphic night view.</p>
                                    </button>
                                </div>

                                {/* Default Starting tab dropdown */}
                                <div className="flex flex-col gap-2 pt-2 border-t border-neutral-medium dark:border-gray-700">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-secondary ml-1">Startup Landing Page</label>
                                    <select
                                        value={startTab}
                                        onChange={(e) => setStartTab(e.target.value)}
                                        className="px-4 py-3 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium dark:border-gray-700 rounded-2xl text-xs font-black uppercase tracking-wider text-secondary dark:text-white outline-none cursor-pointer focus:ring-2 focus:ring-primary/20"
                                    >
                                        <option value="dashboard">Dashboard (Firm-Wide)</option>
                                        <option value="engagements">Engagements (Tasks & Monitoring)</option>
                                        <option value="clients">Clients Portfolio</option>
                                        <option value="operations">Operations (Transmittals & Meetings)</option>
                                    </select>
                                    <p className="text-[9px] text-secondary ml-1">Decides where the browser lands immediately upon login.</p>
                                </div>
                            </div>

                            {/* Notifications & Sound Toggles */}
                            <div className="bg-white dark:bg-gray-800 p-8 rounded-[2rem] border border-neutral-medium dark:border-gray-700 shadow-xl space-y-6">
                                <div>
                                    <h3 className="text-base font-black text-neutral-dark dark:text-white">Alerts & System Cues</h3>
                                    <p className="text-xs text-secondary dark:text-gray-400 font-medium">Control notifications and live workspace feedback.</p>
                                </div>

                                <div className="space-y-4">
                                    {/* Sound Toggle */}
                                    <div className="flex items-center justify-between p-3.5 rounded-2xl bg-neutral-light/30 dark:bg-gray-900/30 border border-neutral-medium/40 dark:border-gray-700/40">
                                        <div className="flex items-center gap-3">
                                            <Volume2 size={16} className="text-primary" />
                                            <div>
                                                <h4 className="text-xs font-black text-neutral-dark dark:text-white uppercase tracking-widest">In-App Sound Cues</h4>
                                                <p className="text-[9px] text-secondary font-medium mt-0.5">Sound alerts when marking compliance as filed or logging meetings.</p>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleToggleSound}
                                            className="text-primary hover:scale-105 transition-all shrink-0"
                                        >
                                            {soundAlerts ? <ToggleRight size={32} /> : <ToggleLeft size={32} className="opacity-50 text-secondary dark:text-gray-400" />}
                                        </button>
                                    </div>

                                    {/* Email alerts Toggle */}
                                    <div className="flex items-center justify-between p-3.5 rounded-2xl bg-neutral-light/30 dark:bg-gray-900/30 border border-neutral-medium/40 dark:border-gray-700/40">
                                        <div className="flex items-center gap-3">
                                            <Calendar size={16} className="text-primary" />
                                            <div>
                                                <h4 className="text-xs font-black text-neutral-dark dark:text-white uppercase tracking-widest">Compliance Email reminders</h4>
                                                <p className="text-[9px] text-secondary font-medium mt-0.5">Daily audit digests sent to your corporate address.</p>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setEmailDigest(!emailDigest)}
                                            className="text-primary hover:scale-105 transition-all shrink-0"
                                        >
                                            {emailDigest ? <ToggleRight size={32} /> : <ToggleLeft size={32} className="opacity-50 text-secondary dark:text-gray-400" />}
                                        </button>
                                    </div>
                                </div>

                                <div className="flex justify-end pt-2 border-t border-neutral-medium dark:border-gray-700 pt-4">
                                    <button
                                        type="button"
                                        onClick={handleSavePreferences}
                                        className="bg-primary text-white px-6 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest shadow-md shadow-primary/20 hover:bg-primary/95 transition-all"
                                    >
                                        Save Preferences
                                    </button>
                                </div>
                            </div>

                        </div>
                    )}

                    {/* TAB C: Admin Control Panel (Protected Renders) */}
                    {activeTab === 'admin' && user?.role === UserRole.ADMIN && (
                        <div className="space-y-6">
                            
                            {/* Database Sync and Sheets integration */}
                            <div className="bg-white dark:bg-gray-800 p-8 rounded-[2rem] border border-neutral-medium dark:border-gray-700 shadow-xl space-y-6">
                                <div className="flex items-center justify-between flex-wrap gap-3">
                                    <div>
                                        <h3 className="text-base font-black text-neutral-dark dark:text-white">Database Synchronization</h3>
                                        <p className="text-xs text-secondary dark:text-gray-400 font-medium">Bypass cache and force refresh all Google Sheets records.</p>
                                    </div>
                                    
                                    <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-3.5 py-1.5 rounded-full text-emerald-600 dark:text-emerald-400">
                                        <Database size={12} className="animate-pulse" />
                                        <span className="text-[9px] font-black uppercase tracking-widest">SHEETS INTEGRATION: ONLINE</span>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between flex-wrap gap-4 p-4 rounded-3xl bg-neutral-light/50 dark:bg-gray-900/30 border border-neutral-medium dark:border-gray-700">
                                    <p className="text-xs text-secondary font-semibold max-w-md">
                                        Use this toggle if staff have directly edited cells inside the google sheets workspace and you need changes to render locally immediately.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={handleForceSync}
                                        disabled={isSyncing}
                                        className="bg-primary text-white px-6 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest shadow-md shadow-primary/20 hover:bg-primary/95 transition-all flex items-center gap-2 shrink-0 disabled:opacity-60"
                                    >
                                        <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
                                        {isSyncing ? 'Synchronizing...' : 'Force Sync Data'}
                                    </button>
                                </div>
                            </div>

                            {/* Firm profile configurations (Used to dynamically fill PDF/Header titles) */}
                            <div className="bg-white dark:bg-gray-800 p-8 rounded-[2rem] border border-neutral-medium dark:border-gray-700 shadow-xl space-y-6">
                                <div>
                                    <h3 className="text-base font-black text-neutral-dark dark:text-white">Firm Profile & Metadata</h3>
                                    <p className="text-xs text-secondary dark:text-gray-400 font-medium">Corporate values populated inside transmittals slips and printed PDF layouts.</p>
                                </div>

                                <form onSubmit={handleSaveFirmProfile} className="space-y-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-secondary ml-1">Official Firm Name</label>
                                            <input
                                                type="text"
                                                value={firmName}
                                                onChange={(e) => setFirmName(e.target.value)}
                                                required
                                                className="px-4 py-2.5 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium dark:border-gray-700 rounded-2xl text-xs font-black text-neutral-dark dark:text-white outline-none focus:ring-2 focus:ring-primary/20"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-secondary ml-1">Firm TIN (Tax Identification)</label>
                                            <input
                                                type="text"
                                                value={firmTin}
                                                onChange={(e) => setFirmTin(e.target.value)}
                                                required
                                                className="px-4 py-2.5 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium dark:border-gray-700 rounded-2xl text-xs font-black text-neutral-dark dark:text-white outline-none focus:ring-2 focus:ring-primary/20"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-secondary ml-1">Official Address</label>
                                        <input
                                            type="text"
                                            value={firmAddress}
                                            onChange={(e) => setFirmAddress(e.target.value)}
                                            required
                                            className="px-4 py-2.5 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium dark:border-gray-700 rounded-2xl text-xs font-black text-neutral-dark dark:text-white outline-none focus:ring-2 focus:ring-primary/20"
                                        />
                                    </div>

                                    <div className="flex justify-end pt-2 border-t border-neutral-medium dark:border-gray-700 pt-4">
                                        <button
                                            type="submit"
                                            className="bg-primary text-white px-6 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest shadow-md shadow-primary/20 hover:bg-primary/95 transition-all"
                                        >
                                            Update Corporate Profile
                                        </button>
                                    </div>
                                </form>
                            </div>

                            {/* Staff promotions roster review list */}
                            <div className="bg-white dark:bg-gray-800 p-8 rounded-[2rem] border border-neutral-medium dark:border-gray-700 shadow-xl space-y-6">
                                <div>
                                    <h3 className="text-base font-black text-neutral-dark dark:text-white">Workspace Roster & Roles Management</h3>
                                    <p className="text-xs text-secondary dark:text-gray-400 font-medium">Toggle staff assignments and promote team members.</p>
                                </div>

                                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                                    {allUsers.filter(u => u.status === 'Active' && u.id !== user?.id).map((member, idx) => (
                                        <div key={idx} className="flex items-center justify-between p-3 rounded-2xl bg-neutral-light/30 dark:bg-gray-900/30 border border-neutral-medium/40 dark:border-gray-700/40 gap-4">
                                            <div className="flex items-center gap-3">
                                                <img src={member.avatarUrl || getInitialsAvatarUrl(member.firstName, member.lastName)} alt="Avatar" className="w-8 h-8 rounded-xl object-cover bg-neutral-light" />
                                                <div className="flex flex-col flex-1 min-w-0">
                                                    <span className="text-xs font-black text-neutral-dark dark:text-white">{member.firstName} {member.lastName}</span>
                                                    <span className="text-[8px] font-black uppercase tracking-widest text-secondary">{member.role} · {member.team || 'No Team'}</span>
                                                </div>
                                            </div>

                                            {member.role !== UserRole.ADMIN && (
                                                <button
                                                    type="button"
                                                    onClick={() => toggleRosterRole(member.id, member.role)}
                                                    className="bg-neutral-light hover:bg-neutral-medium/50 dark:bg-gray-900 dark:hover:bg-gray-700 border border-neutral-medium dark:border-gray-700 px-3.5 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest text-secondary hover:text-primary transition-all"
                                                >
                                                    {member.role === UserRole.SENIOR ? 'Change to Staff' : 'Promote to Senior'}
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                        </div>
                    )}

                </div>

            </div>
        </div>
    );
};

export default Settings;
