import React, { useContext, useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { AppContext } from '../App';
import UserHoverCard from '../components/UserHoverCard';
import { User, UserRole } from '../types';
import { CHROME_PRESET_AVATARS } from '../utils/avatarPresets';
import { createUser, updateUserAdmin, updateUserProfile, updateUserPassword, uploadAvatar } from '../services/googleSheetsService';
import {
    User as UserIcon,
    Settings as SettingsIcon,
    Shield,
    Check,
    RefreshCw,
    Building2,
    Key,
    Sparkles,
    UserCheck,
    Volume2,
    Calendar,
    Camera,
    Upload,
    Plus,
    Pencil,
    X
} from 'lucide-react';

const getInitialsAvatarUrl = (firstName: string, lastName: string, bgColor: string = 'b4262a') => {
    const initials = `${firstName || ''} ${lastName || ''}`.trim() || 'User';
    return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(initials)}&radius=50&backgroundColor=${bgColor}`;
};

const getUserFullName = (user: any) => `${user?.firstName || ''} ${user?.lastName || ''}`.trim();
const sortUsersByName = (users: any[]) => [...users].sort((a, b) => getUserFullName(a).localeCompare(getUserFullName(b)));

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

    const initialsAvatars = useMemo(() => {
        return [
            `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(userInitials)}&radius=50&backgroundColor=b4262a`,
            `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(userInitials)}&radius=50&backgroundColor=3b82f6`,
            `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(userInitials)}&radius=50&backgroundColor=10b981`,
            `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(userInitials)}&radius=50&backgroundColor=8b5cf6`,
        ];
    }, [userInitials]);

    const managedUsers = useMemo(() => {
        if (activeTab !== 'admin') return [];
        return sortUsersByName(allUsers);
    }, [activeTab, allUsers]);

    const emptyUserForm = {
        username: '',
        password: '',
        firstName: '',
        lastName: '',
        role: UserRole.STAFF,
        team: '',
        status: 'Active' as 'Active' | 'Inactive',
        email: ''
    };
    const [isUserModalOpen, setIsUserModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [userForm, setUserForm] = useState(emptyUserForm);
    const [isSavingUser, setIsSavingUser] = useState(false);

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

    const handleToggleSound = () => {
        const nextVal = !soundAlerts;
        setSoundAlerts(nextVal);
        if (nextVal && playAudioCue) {
            playAudioCue('success', true);
        }
    };

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
        showToast('Application preferences updated!', 'success');
    };

    const openAddUserModal = () => {
        setEditingUser(null);
        setUserForm(emptyUserForm);
        setIsUserModalOpen(true);
    };

    const openEditUserModal = (member: User) => {
        setEditingUser(member);
        setUserForm({
            username: member.username || '',
            password: '',
            firstName: member.firstName || '',
            lastName: member.lastName || '',
            role: member.role,
            team: member.team || '',
            status: member.status || 'Active',
            email: member.email || ''
        });
        setIsUserModalOpen(true);
    };

    const closeUserModal = () => {
        setIsUserModalOpen(false);
        setEditingUser(null);
        setUserForm(emptyUserForm);
    };

    const handleSaveUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userForm.username.trim() || !userForm.firstName.trim() || !userForm.lastName.trim()) {
            showToast('Username, first name, and last name are required.', 'error');
            return;
        }
        if (!editingUser && !userForm.password.trim()) {
            showToast('Password is required for new users.', 'error');
            return;
        }

        setIsSavingUser(true);
        try {
            if (editingUser) {
                await updateUserAdmin(editingUser.id, {
                    username: userForm.username.trim(),
                    password: userForm.password.trim() || undefined,
                    firstName: userForm.firstName.trim(),
                    lastName: userForm.lastName.trim(),
                    role: userForm.role,
                    team: userForm.team.trim(),
                    status: userForm.status,
                    email: userForm.email.trim()
                });
                showToast('User details updated.', 'success');
            } else {
                await createUser({
                    username: userForm.username.trim(),
                    password: userForm.password.trim(),
                    firstName: userForm.firstName.trim(),
                    lastName: userForm.lastName.trim(),
                    role: userForm.role,
                    team: userForm.team.trim(),
                    status: userForm.status,
                    email: userForm.email.trim()
                });
                showToast('User created successfully.', 'success');
            }

            await refreshData(true);
            closeUserModal();
        } catch (error: any) {
            showToast(error.message || 'Unable to save user.', 'error');
        } finally {
            setIsSavingUser(false);
        }
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
                        className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-black transition-all w-full shrink-0 ${activeTab === 'profile' ? 'bg-primary text-white shadow-md shadow-primary/20' : 'text-secondary hover:text-neutral-dark dark:hover:text-white hover:bg-neutral-light/50 dark:hover:bg-gray-800'}`}
                    >
                        <UserIcon size={16} />
                        My Profile
                    </button>
                    <button
                        onClick={() => setActiveTab('preferences')}
                        className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-black transition-all w-full shrink-0 ${activeTab === 'preferences' ? 'bg-primary text-white shadow-md shadow-primary/20' : 'text-secondary hover:text-neutral-dark dark:hover:text-white hover:bg-neutral-light/50 dark:hover:bg-gray-800'}`}
                    >
                        <SettingsIcon size={16} />
                        Preferences
                    </button>

                    {/* Protected Admin console tab */}
                    {user?.role === UserRole.ADMIN && (
                        <button
                            onClick={() => setActiveTab('admin')}
                            className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-black transition-all w-full shrink-0 ${activeTab === 'admin' ? 'bg-primary text-white shadow-md shadow-primary/20' : 'text-secondary hover:text-neutral-dark dark:hover:text-white hover:bg-neutral-light/50 dark:hover:bg-gray-800'}`}
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
                            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-sm overflow-hidden">
                                <div className="px-6 py-4 border-b border-neutral-medium/70 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div>
                                        <h3 className="text-base font-black text-neutral-dark dark:text-white">Profile Details</h3>
                                        <p className="text-xs text-secondary dark:text-gray-400 font-medium mt-1">Configure how your name and avatar appear across the workspace.</p>
                                    </div>

                                    <div className="flex items-center gap-3 rounded-2xl border border-neutral-medium/70 dark:border-gray-700 bg-neutral-light/30 dark:bg-gray-900/30 px-3 py-1.5 min-w-0">
                                        <img src={selectedAvatar} alt="Selected avatar" className="w-9 h-9 rounded-xl object-cover bg-neutral-light border border-neutral-medium dark:border-gray-700 shrink-0" />
                                        <div className="min-w-0">
                                            <p className="text-sm font-black text-neutral-dark dark:text-white truncate">{firstName} {lastName}</p>
                                            <p className="text-[10px] font-semibold text-secondary dark:text-gray-400 truncate">{user?.role || 'Staff'} - {user?.team || 'General Staff'}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-6 space-y-6">
                                {/* Google Chrome inspired "Pick an avatar" Grid */}
                                <section className="space-y-3">
                                    <div className="flex items-center gap-2">
                                        <span className="w-1 h-4 bg-primary rounded-full self-start mt-0.5" />
                                        <div>
                                            <h4 className="text-sm font-black text-neutral-dark dark:text-white">Choose Avatar</h4>
                                            <p className="text-[10px] font-semibold text-secondary dark:text-gray-400 mt-0.5">Pick a preset or upload a custom profile photo.</p>
                                        </div>
                                    </div>
                                    {/* Upload trigger hidden input */}
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        onChange={handleFileUpload}
                                        accept="image/*"
                                        className="hidden"
                                    />

                                    {/* Grid of Avatars */}
                                    <div className="rounded-2xl border border-neutral-medium dark:border-gray-700 p-4">
                                    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-7 lg:grid-cols-8 gap-4 max-h-[300px] overflow-y-auto pr-2 py-2 scrollbar-thin">

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
                                </section>

                                {/* Form Fields */}
                                <form onSubmit={handleSaveProfile} className="space-y-3">
                                    <div className="flex items-center gap-2">
                                        <span className="w-1 h-4 bg-primary rounded-full self-start mt-0.5" />
                                        <div>
                                            <h4 className="text-sm font-black text-neutral-dark dark:text-white">Personal Information</h4>
                                            <p className="text-[10px] font-semibold text-secondary dark:text-gray-400 mt-0.5">Keep your display name and contact details current.</p>
                                        </div>
                                    </div>
                                    <div className="space-y-5 rounded-2xl border border-neutral-medium dark:border-gray-700 p-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-secondary ml-1">First Name</label>
                                            <input
                                                type="text"
                                                value={firstName}
                                                onChange={(e) => setFirstName(e.target.value)}
                                                className="px-4 py-3 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium dark:border-gray-700 rounded-2xl text-sm font-bold text-neutral-dark dark:text-white outline-none focus:ring-2 focus:ring-primary/20"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-secondary ml-1">Last Name</label>
                                            <input
                                                type="text"
                                                value={lastName}
                                                onChange={(e) => setLastName(e.target.value)}
                                                className="px-4 py-3 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium dark:border-gray-700 rounded-2xl text-sm font-bold text-neutral-dark dark:text-white outline-none focus:ring-2 focus:ring-primary/20"
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
                                                className="px-4 py-3 bg-neutral-medium/30 dark:bg-gray-900/50 border border-neutral-medium dark:border-gray-700 rounded-2xl text-sm font-bold text-secondary outline-none cursor-not-allowed"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-secondary ml-1">Email Address</label>
                                            <input
                                                type="email"
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                className="px-4 py-3 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium dark:border-gray-700 rounded-2xl text-sm font-bold text-neutral-dark dark:text-white outline-none focus:ring-2 focus:ring-primary/20"
                                            />
                                        </div>
                                    </div>

                                    {/* Role and Team read-only items */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-neutral-medium dark:border-gray-700 pt-4">
                                        <div className="flex items-center gap-3 rounded-2xl bg-neutral-light/40 dark:bg-gray-900/30 border border-neutral-medium/60 dark:border-gray-700 px-4 py-3">
                                            <UserCheck size={16} className="text-primary shrink-0" />
                                            <div>
                                                <h5 className="text-[9px] font-black uppercase tracking-widest text-secondary">System Assignment</h5>
                                                <p className="text-sm font-black text-neutral-dark dark:text-white">{user?.role || 'Staff'}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 rounded-2xl bg-neutral-light/40 dark:bg-gray-900/30 border border-neutral-medium/60 dark:border-gray-700 px-4 py-3">
                                            <Building2 size={16} className="text-primary shrink-0" />
                                            <div>
                                                <h5 className="text-[9px] font-black uppercase tracking-widest text-secondary">Assigned Team</h5>
                                                <p className="text-sm font-black text-neutral-dark dark:text-white">{user?.team || 'General Staff'}</p>
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
                                    </div>
                                </form>
                                </div>
                            </div>

                            {/* Security (Password Collapsible) */}
                            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-sm space-y-4">
                                <button
                                    onClick={() => setIsPasswordFormOpen(!isPasswordFormOpen)}
                                    className="flex items-center justify-between w-full text-left gap-4"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                                            <Key size={17} />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-black text-neutral-dark dark:text-white">Update Account Password</h3>
                                            <p className="text-[10px] text-secondary font-semibold mt-0.5">Change your login password when needed.</p>
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
                                                    className="px-4 py-3 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium dark:border-gray-700 rounded-2xl text-sm font-bold text-neutral-dark dark:text-white outline-none focus:ring-2 focus:ring-primary/20"
                                                />
                                            </div>
                                            <div className="flex flex-col gap-1.5">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-secondary ml-1">New Password</label>
                                                <input
                                                    type="password"
                                                    value={newPassword}
                                                    onChange={(e) => setNewPassword(e.target.value)}
                                                    required
                                                    className="px-4 py-3 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium dark:border-gray-700 rounded-2xl text-sm font-bold text-neutral-dark dark:text-white outline-none focus:ring-2 focus:ring-primary/20"
                                                />
                                            </div>
                                            <div className="flex flex-col gap-1.5">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-secondary ml-1">Confirm New Password</label>
                                                <input
                                                    type="password"
                                                    value={confirmPassword}
                                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                                    required
                                                    className="px-4 py-3 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium dark:border-gray-700 rounded-2xl text-sm font-bold text-neutral-dark dark:text-white outline-none focus:ring-2 focus:ring-primary/20"
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
                        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-sm overflow-hidden">
                            <div className="px-6 py-5 border-b border-neutral-medium/70 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div>
                                    <h3 className="text-base font-black text-neutral-dark dark:text-white">Preferences</h3>
                                    <p className="text-xs text-secondary dark:text-gray-400 font-medium mt-1">Personalize how your workspace opens, looks, and responds.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleSavePreferences}
                                    className="inline-flex items-center justify-center gap-2 bg-primary text-white px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest shadow-md shadow-primary/20 hover:bg-primary/95 transition-all"
                                >
                                    <Check size={14} />
                                    Save Preferences
                                </button>
                            </div>

                            <div className="p-6 space-y-6">
                                <section className="space-y-3">
                                    <div className="flex items-center gap-2">
                                        <span className="w-1 h-4 bg-primary rounded-full self-start mt-0.5" />
                                        <div>
                                            <h4 className="text-sm font-black text-neutral-dark dark:text-white">Appearance</h4>
                                            <p className="text-[11px] text-secondary dark:text-gray-400 font-medium">Choose the color mode that feels best for daily work.</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {[
                                            { value: 'light', title: 'Light Mode', description: 'Bright workspace for regular office use.', icon: Sparkles },
                                            { value: 'dark', title: 'Dark Mode', description: 'Lower brightness for late or dim work.', icon: Shield },
                                        ].map((option) => {
                                            const Icon = option.icon;
                                            const selected = theme === option.value;
                                            return (
                                                <button
                                                    key={option.value}
                                                    type="button"
                                                    onClick={() => theme !== option.value && toggleTheme()}
                                                    className={`p-4 rounded-2xl border text-left transition-all ${selected ? 'border-primary bg-primary/[0.03] shadow-sm ring-4 ring-primary/5' : 'border-neutral-medium dark:border-gray-700 hover:border-primary/50 bg-white dark:bg-gray-900/20'}`}
                                                >
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div className="flex items-center gap-3">
                                                            <span className={`w-9 h-9 rounded-2xl flex items-center justify-center ${selected ? 'bg-primary text-white' : 'bg-neutral-light dark:bg-gray-900 text-primary'}`}>
                                                                <Icon size={16} />
                                                            </span>
                                                            <div>
                                                                <h5 className="text-sm font-black text-neutral-dark dark:text-white">{option.title}</h5>
                                                                <p className="text-[11px] text-secondary dark:text-gray-400 font-medium mt-0.5">{option.description}</p>
                                                            </div>
                                                        </div>
                                                        {selected && <Check size={16} className="text-primary shrink-0" />}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </section>

                                <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-5 border-t border-neutral-medium/70 dark:border-gray-700">
                                    <div className="rounded-2xl border border-neutral-medium dark:border-gray-700 p-4 bg-neutral-light/20 dark:bg-gray-900/20 space-y-3">
                                        <div className="flex items-center gap-3">
                                            <span className="w-9 h-9 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                                                <Calendar size={16} />
                                            </span>
                                            <div>
                                                <h4 className="text-sm font-black text-neutral-dark dark:text-white">Startup Page</h4>
                                                <p className="text-[11px] text-secondary dark:text-gray-400 font-medium">Default page after login.</p>
                                            </div>
                                        </div>
                                        <select
                                            value={startTab}
                                            onChange={(e) => setStartTab(e.target.value)}
                                            className="w-full px-4 py-3 bg-white dark:bg-gray-900 border border-neutral-medium dark:border-gray-700 rounded-2xl text-sm font-bold text-neutral-dark dark:text-white outline-none cursor-pointer focus:ring-2 focus:ring-primary/20"
                                        >
                                            <option value="dashboard">Dashboard</option>
                                            <option value="retainers">Retainers</option>
                                            <option value="special-projects">Special Projects</option>
                                            <option value="clients">Clients</option>
                                            <option value="transmittals">Transmittals</option>
                                            <option value="meetings">Meetings</option>
                                        </select>
                                    </div>

                                    <div className="rounded-2xl border border-neutral-medium dark:border-gray-700 p-4 bg-neutral-light/20 dark:bg-gray-900/20">
                                        <div className="flex items-center justify-between gap-4">
                                            <div className="flex items-center gap-3">
                                                <span className="w-9 h-9 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                                                    <Volume2 size={16} />
                                                </span>
                                                <div>
                                                    <h4 className="text-sm font-black text-neutral-dark dark:text-white">Sound Cues</h4>
                                                    <p className="text-[11px] text-secondary dark:text-gray-400 font-medium mt-0.5">Play short sounds for completed actions.</p>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleToggleSound}
                                                className={`relative h-8 w-14 rounded-full transition-colors shrink-0 ${soundAlerts ? 'bg-primary' : 'bg-neutral-medium dark:bg-gray-700'}`}
                                                aria-pressed={soundAlerts}
                                            >
                                                <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${soundAlerts ? 'translate-x-7' : 'translate-x-1'}`} />
                                            </button>
                                        </div>
                                        <div className="mt-4 rounded-2xl bg-white dark:bg-gray-900 border border-neutral-medium/70 dark:border-gray-700 px-4 py-3">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-secondary dark:text-gray-400">Current Setting</p>
                                            <p className="text-sm font-black text-neutral-dark dark:text-white mt-1">{soundAlerts ? 'Sound cues enabled' : 'Sound cues muted'}</p>
                                        </div>
                                    </div>
                                </section>
                            </div>
                        </div>
                    )}

                    {/* TAB C: Admin Control Panel (Protected Renders) */}
                    {activeTab === 'admin' && user?.role === UserRole.ADMIN && (
                        <div className="space-y-6">


                            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-sm overflow-hidden">
                                <div className="px-6 py-5 border-b border-neutral-medium/70 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div>
                                        <h3 className="text-base font-black text-neutral-dark dark:text-white">User Management</h3>
                                        <p className="text-xs text-secondary dark:text-gray-400 font-medium mt-1">
                                            Create users, update account details, and manage access status.
                                        </p>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={openAddUserModal}
                                        className="inline-flex items-center justify-center gap-2 bg-primary text-white px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest shadow-md shadow-primary/20 hover:bg-primary/95 transition-all"
                                    >
                                        <Plus size={14} />
                                        Add User
                                    </button>
                                </div>

                                <div className="p-6">
                                <div className="rounded-2xl border border-neutral-medium dark:border-gray-700 overflow-hidden">
                                    <div className="hidden md:grid grid-cols-[minmax(0,1.7fr)_92px_minmax(72px,0.8fr)_84px_68px] gap-3 px-3 py-3 bg-neutral-light/40 dark:bg-gray-900/40 border-b border-neutral-medium dark:border-gray-700 text-[10px] font-black uppercase tracking-widest text-secondary">
                                        <span>User</span>
                                        <span>Role</span>
                                        <span>Team</span>
                                        <span>Status</span>
                                        <span className="text-right">Action</span>
                                    </div>

                                    <div className="divide-y divide-neutral-medium/60 dark:divide-gray-700 max-h-[380px] overflow-y-auto custom-scrollbar">
                                        {managedUsers.map((member) => (
                                        <div key={member.id} className="grid grid-cols-1 md:grid-cols-[minmax(0,1.7fr)_92px_minmax(72px,0.8fr)_84px_68px] gap-3 items-center px-3 py-3 hover:bg-primary/5 dark:hover:bg-gray-900/40 transition-colors">
                                            <div className="flex items-center gap-3 min-w-0">
                                                    <UserHoverCard user={member} fallbackName={`${member.firstName} ${member.lastName}`} size="lg" />
                                                <div className="min-w-0">
                                                    <p className="text-sm font-black text-neutral-dark dark:text-white truncate">{member.firstName} {member.lastName}</p>
                                                    <p className="text-[10px] font-semibold text-secondary dark:text-gray-400 truncate">{member.email || member.username}</p>
                                                </div>
                                            </div>

                                            <span className="inline-flex w-fit items-center rounded-full border border-primary/15 bg-primary/5 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-primary">
                                                {member.role}
                                            </span>

                                            <span className="text-xs font-bold text-neutral-dark dark:text-white truncate">{member.team || 'No team'}</span>

                                            <span className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${
                                                member.status === 'Active'
                                                    ? 'border-emerald-500/15 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                                    : 'border-gray-400/20 bg-gray-500/10 text-secondary dark:text-gray-400'
                                            }`}>
                                                {member.status}
                                            </span>

                                            <button
                                                type="button"
                                                onClick={() => openEditUserModal(member)}
                                                className="inline-flex md:ml-auto w-fit items-center gap-1.5 rounded-xl border border-neutral-medium dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-secondary hover:text-primary hover:border-primary/30 transition-all"
                                            >
                                                <Pencil size={12} />
                                                Edit
                                            </button>
                                        </div>
                                    ))}
                                    </div>
                                </div>
                                </div>
                            </div>

                        </div>
                    )}

                    {isUserModalOpen && createPortal((
                        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                            <div className="bg-white dark:bg-gray-800 w-full max-w-2xl rounded-[1.5rem] border border-neutral-medium dark:border-gray-700 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-neutral-medium dark:border-gray-700">
                                    <div>
                                        <h3 className="text-lg font-black text-neutral-dark dark:text-white">
                                            {editingUser ? 'Edit User' : 'Add User'}
                                        </h3>
                                        <p className="text-xs font-semibold text-secondary dark:text-gray-400 mt-0.5">
                                            {editingUser ? 'Update account details, role, team, or status.' : 'Create a new workspace login account.'}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={closeUserModal}
                                        disabled={isSavingUser}
                                        className="w-9 h-9 rounded-full border border-neutral-medium dark:border-gray-700 flex items-center justify-center text-secondary hover:text-primary hover:bg-primary/5 transition-all disabled:opacity-50"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>

                                <form onSubmit={handleSaveUser} className="p-6 space-y-5">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-secondary ml-1">Username</label>
                                            <input
                                                type="text"
                                                value={userForm.username}
                                                onChange={(e) => setUserForm(prev => ({ ...prev, username: e.target.value }))}
                                                required
                                                className="px-4 py-3 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium dark:border-gray-700 rounded-2xl text-sm font-bold text-neutral-dark dark:text-white outline-none focus:ring-2 focus:ring-primary/20"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-secondary ml-1">
                                                {editingUser ? 'New Password' : 'Password'}
                                            </label>
                                            <input
                                                type="password"
                                                value={userForm.password}
                                                onChange={(e) => setUserForm(prev => ({ ...prev, password: e.target.value }))}
                                                required={!editingUser}
                                                placeholder={editingUser ? 'Leave blank to keep current password' : ''}
                                                className="px-4 py-3 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium dark:border-gray-700 rounded-2xl text-sm font-bold text-neutral-dark dark:text-white outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-secondary/60"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-secondary ml-1">First Name</label>
                                            <input
                                                type="text"
                                                value={userForm.firstName}
                                                onChange={(e) => setUserForm(prev => ({ ...prev, firstName: e.target.value }))}
                                                required
                                                className="px-4 py-3 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium dark:border-gray-700 rounded-2xl text-sm font-bold text-neutral-dark dark:text-white outline-none focus:ring-2 focus:ring-primary/20"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-secondary ml-1">Last Name</label>
                                            <input
                                                type="text"
                                                value={userForm.lastName}
                                                onChange={(e) => setUserForm(prev => ({ ...prev, lastName: e.target.value }))}
                                                required
                                                className="px-4 py-3 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium dark:border-gray-700 rounded-2xl text-sm font-bold text-neutral-dark dark:text-white outline-none focus:ring-2 focus:ring-primary/20"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-secondary ml-1">Role</label>
                                            <select
                                                value={userForm.role}
                                                onChange={(e) => setUserForm(prev => ({ ...prev, role: e.target.value as UserRole }))}
                                                className="px-4 py-3 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium dark:border-gray-700 rounded-2xl text-sm font-bold text-neutral-dark dark:text-white outline-none focus:ring-2 focus:ring-primary/20"
                                            >
                                                {Object.values(UserRole).filter(role => role !== UserRole.HR).map(role => (
                                                    <option key={role} value={role}>{role}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-secondary ml-1">Team</label>
                                            <input
                                                type="text"
                                                value={userForm.team}
                                                onChange={(e) => setUserForm(prev => ({ ...prev, team: e.target.value }))}
                                                className="px-4 py-3 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium dark:border-gray-700 rounded-2xl text-sm font-bold text-neutral-dark dark:text-white outline-none focus:ring-2 focus:ring-primary/20"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-secondary ml-1">Status</label>
                                            <select
                                                value={userForm.status}
                                                onChange={(e) => setUserForm(prev => ({ ...prev, status: e.target.value as 'Active' | 'Inactive' }))}
                                                className="px-4 py-3 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium dark:border-gray-700 rounded-2xl text-sm font-bold text-neutral-dark dark:text-white outline-none focus:ring-2 focus:ring-primary/20"
                                            >
                                                <option value="Active">Active</option>
                                                <option value="Inactive">Inactive</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 gap-4">
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-secondary ml-1">Email</label>
                                            <input
                                                type="email"
                                                value={userForm.email}
                                                onChange={(e) => setUserForm(prev => ({ ...prev, email: e.target.value }))}
                                                className="px-4 py-3 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium dark:border-gray-700 rounded-2xl text-sm font-bold text-neutral-dark dark:text-white outline-none focus:ring-2 focus:ring-primary/20"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex justify-end gap-3 pt-4 border-t border-neutral-medium dark:border-gray-700">
                                        <button
                                            type="button"
                                            onClick={closeUserModal}
                                            disabled={isSavingUser}
                                            className="px-5 py-2.5 rounded-2xl border border-neutral-medium dark:border-gray-700 text-xs font-black uppercase tracking-widest text-secondary hover:text-primary transition-all disabled:opacity-50"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={isSavingUser}
                                            className="inline-flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest shadow-md shadow-primary/20 hover:bg-primary/95 transition-all disabled:opacity-50"
                                        >
                                            {isSavingUser && <RefreshCw size={12} className="animate-spin" />}
                                            {editingUser ? 'Save User' : 'Create User'}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    ), document.body)}

                </div>

            </div>
        </div>
    );
};

export default Settings;
