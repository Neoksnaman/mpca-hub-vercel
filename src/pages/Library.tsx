import React, { useContext, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    BookOpen,
    CheckCircle2,
    Download,
    FileText,
    Loader2,
    Pencil,
    Plus,
    Search,
    Trash2,
    Upload,
    X
} from 'lucide-react';
import { AppContext } from '../App';
import { ServiceManual, ServiceRequirement, UserRole } from '../types';
import { deleteServiceManual, normalizeId, saveServiceManual, uploadFile } from '../services/googleSheetsService';

const emptyManual = (): ServiceManual => ({
    id: '',
    serviceID: '',
    title: '',
    overview: '',
    manualGuide: '',
    notes: '',
    requirements: [],
    lastUpdatedBy: '',
    lastUpdatedAt: ''
});

const newRequirement = (sortOrder: number): ServiceRequirement => ({
    id: `tmp-${Date.now()}-${sortOrder}`,
    title: '',
    description: '',
    isRequired: true,
    templateFileId: '',
    templateFileName: '',
    templateUrl: '',
    sortOrder,
    status: 'Active'
});

const formatDateTime = (value?: string) => {
    if (!value) return 'Not updated yet';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('default', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const getDriveUrl = (idOrUrl?: string) => {
    if (!idOrUrl) return '';
    if (idOrUrl.startsWith('http')) return idOrUrl;
    return `https://drive.google.com/file/d/${idOrUrl}/view?usp=sharing`;
};

const Library: React.FC = () => {
    const context = useContext(AppContext);
    const manuals = context?.serviceManuals || [];
    const users = context?.allUsers || [];
    const currentUser = context?.user;
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedManualId, setSelectedManualId] = useState<string | null>(null);
    const [draftManual, setDraftManual] = useState<ServiceManual | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [uploadingRequirementId, setUploadingRequirementId] = useState<string | null>(null);

    const canEdit = [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPERVISOR].includes(currentUser?.role as UserRole);

    const userById = useMemo(() => {
        const lookup = new Map<string, string>();
        users.forEach(user => lookup.set(normalizeId(user.id), `${user.firstName} ${user.lastName}`.trim()));
        return lookup;
    }, [users]);

    const filteredManuals = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        return [...manuals]
            .filter(manual => !query || [
                manual.title,
                manual.overview,
                manual.manualGuide,
                manual.notes,
                ...(manual.requirements || []).map(requirement => requirement.title)
            ].some(value => String(value || '').toLowerCase().includes(query)))
            .sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
    }, [manuals, searchQuery]);

    const openManual = (manual: ServiceManual) => {
        setSelectedManualId(manual.id);
        setDraftManual(JSON.parse(JSON.stringify(manual)));
        setIsEditing(false);
    };

    const openNewManual = () => {
        setSelectedManualId(null);
        setDraftManual(emptyManual());
        setIsEditing(true);
    };

    const closeDrawer = () => {
        setSelectedManualId(null);
        setDraftManual(null);
        setIsEditing(false);
    };

    const updateRequirement = (id: string, updates: Partial<ServiceRequirement>) => {
        setDraftManual(prev => prev ? {
            ...prev,
            requirements: prev.requirements.map(requirement => requirement.id === id ? { ...requirement, ...updates } : requirement)
        } : prev);
    };

    const removeRequirement = (id: string) => {
        setDraftManual(prev => prev ? {
            ...prev,
            requirements: prev.requirements.filter(requirement => requirement.id !== id)
        } : prev);
    };

    const handleUploadTemplate = async (requirementId: string, file?: File) => {
        if (!file) return;
        try {
            setUploadingRequirementId(requirementId);
            const result = await uploadFile(file, 'Library');
            updateRequirement(requirementId, {
                templateFileId: result.id,
                templateFileName: file.name,
                templateUrl: result.url
            });
            context?.showToast('Template uploaded.', 'success');
        } catch (error: any) {
            context?.showToast(error.message || 'Unable to upload template.', 'error');
        } finally {
            setUploadingRequirementId(null);
        }
    };

    const handleSave = async () => {
        if (!draftManual || !currentUser) return;
        const title = draftManual.title.trim();
        if (!title) {
            context?.showToast('Manual title is required.', 'error');
            return;
        }

        try {
            setIsSaving(true);
            const cleanedRequirements = draftManual.requirements
                .map((requirement, index) => ({ ...requirement, sortOrder: index }))
                .filter(requirement => requirement.title.trim());

            const result = await saveServiceManual({
                ...draftManual,
                title,
                userID: currentUser.id,
                requirements: cleanedRequirements
            });

            context?.showToast('Service manual saved.', 'success');
            await context?.refreshData(true);
            setSelectedManualId(result.manual.id);
            setDraftManual(result.manual);
            setIsEditing(false);
        } catch (error: any) {
            context?.showToast(error.message || 'Unable to save service manual.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (manual: ServiceManual) => {
        if (!manual.id) return;
        const confirmed = window.confirm(`Delete "${manual.title || 'this manual'}" from the Library?`);
        if (!confirmed) return;

        try {
            setDeletingId(manual.id);
            await deleteServiceManual(manual.id);
            context?.showToast('Service manual deleted.', 'success');
            if (selectedManualId === manual.id) closeDrawer();
            await context?.refreshData(true);
        } catch (error: any) {
            context?.showToast(error.message || 'Unable to delete service manual.', 'error');
        } finally {
            setDeletingId(null);
        }
    };

    const selectedManual = draftManual;
    const lastUpdatedBy = selectedManual?.lastUpdatedBy ? userById.get(normalizeId(selectedManual.lastUpdatedBy)) || selectedManual.lastUpdatedBy : 'No updater yet';

    const drawer = selectedManual ? (
        <div className="fixed inset-0 z-[30000] flex justify-end bg-black/35 backdrop-blur-[2px]" onClick={closeDrawer}>
            <div className="w-full max-w-2xl bg-white dark:bg-gray-900 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300" onClick={(e) => e.stopPropagation()}>
                <div className="px-6 py-5 border-b border-neutral-medium dark:border-gray-700 flex items-start justify-between gap-4 bg-white dark:bg-gray-900">
                    <div className="min-w-0 flex-1">
                        <span className="inline-flex mb-2 rounded-md bg-primary/5 px-2 py-1 text-[10px] font-black text-primary uppercase tracking-widest">Service Manual</span>
                        {isEditing ? (
                            <input
                                value={selectedManual.title}
                                onChange={(e) => setDraftManual(prev => prev ? { ...prev, title: e.target.value } : prev)}
                                placeholder="Manual title"
                                className="w-full rounded-xl border border-neutral-medium dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-2xl font-black text-neutral-dark dark:text-white outline-none focus:border-primary"
                            />
                        ) : (
                            <h2 className="text-2xl font-black text-neutral-dark dark:text-white leading-tight truncate">{selectedManual.title || 'Untitled Manual'}</h2>
                        )}
                        <p className="text-xs font-bold text-secondary mt-2">Last updated by {lastUpdatedBy} - {formatDateTime(selectedManual.lastUpdatedAt)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {canEdit && (
                            <button
                                onClick={() => setIsEditing(prev => !prev)}
                                className="h-10 w-10 rounded-full border border-neutral-medium dark:border-gray-700 text-secondary hover:text-primary hover:border-primary/30 transition-colors flex items-center justify-center"
                                title={isEditing ? 'Cancel editing' : 'Edit manual'}
                            >
                                {isEditing ? <X size={18} /> : <Pencil size={18} />}
                            </button>
                        )}
                        <button onClick={closeDrawer} className="h-10 w-10 rounded-full text-secondary hover:text-primary transition-colors flex items-center justify-center">
                            <X size={22} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-gradient-to-br from-neutral-light/50 via-white to-primary/5 dark:from-gray-900 dark:via-gray-900 dark:to-primary/10 custom-scrollbar">
                    <section className="space-y-4">
                        <SectionTitle title="Service Overview" />
                        <InfoCard>
                            {isEditing ? (
                                <textarea
                                    value={selectedManual.overview}
                                    onChange={(e) => setDraftManual(prev => prev ? { ...prev, overview: e.target.value } : prev)}
                                    placeholder="Summarize what this manual covers..."
                                    className="w-full min-h-[110px] resize-none rounded-xl border border-neutral-medium dark:border-gray-700 bg-white dark:bg-gray-900 p-3 text-sm font-medium text-neutral-dark dark:text-white outline-none focus:border-primary"
                                />
                            ) : (
                                <p className="text-sm font-semibold leading-relaxed text-neutral-dark dark:text-white whitespace-pre-wrap">{selectedManual.overview || 'No overview recorded yet.'}</p>
                            )}
                        </InfoCard>
                    </section>

                    <section className="space-y-4">
                        <SectionTitle title="Manual / Guide" />
                        <InfoCard>
                            {isEditing ? (
                                <textarea
                                    value={selectedManual.manualGuide}
                                    onChange={(e) => setDraftManual(prev => prev ? { ...prev, manualGuide: e.target.value } : prev)}
                                    placeholder="Add internal procedure, step-by-step guidance, or handling notes..."
                                    className="w-full min-h-[160px] resize-none rounded-xl border border-neutral-medium dark:border-gray-700 bg-white dark:bg-gray-900 p-3 text-sm font-medium text-neutral-dark dark:text-white outline-none focus:border-primary"
                                />
                            ) : (
                                <p className="text-sm font-semibold leading-relaxed text-neutral-dark dark:text-white whitespace-pre-wrap">{selectedManual.manualGuide || 'No manual or guide recorded yet.'}</p>
                            )}
                        </InfoCard>
                    </section>

                    <section className="space-y-4">
                        <div className="flex items-center justify-between">
                            <SectionTitle title="Requirements & Templates" />
                            {isEditing && (
                                <button
                                    onClick={() => setDraftManual(prev => prev ? { ...prev, requirements: [...prev.requirements, newRequirement(prev.requirements.length)] } : prev)}
                                    className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-emerald-600 hover:bg-emerald-100 transition-colors"
                                >
                                    <Plus size={14} /> Add Requirement
                                </button>
                            )}
                        </div>

                        <div className="space-y-3">
                            {selectedManual.requirements.length > 0 ? selectedManual.requirements.map((requirement, index) => (
                                <div key={requirement.id} className="bg-white/85 dark:bg-gray-800/70 backdrop-blur-md rounded-2xl border border-neutral-medium/60 dark:border-gray-700 shadow-sm p-4">
                                    {isEditing ? (
                                        <div className="space-y-3">
                                            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2">
                                                <input
                                                    value={requirement.title}
                                                    onChange={(e) => updateRequirement(requirement.id, { title: e.target.value })}
                                                    placeholder="Requirement title"
                                                    className="rounded-xl border border-neutral-medium dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm font-bold outline-none focus:border-primary"
                                                />
                                                <select
                                                    value={requirement.isRequired ? 'Required' : 'Optional'}
                                                    onChange={(e) => updateRequirement(requirement.id, { isRequired: e.target.value === 'Required' })}
                                                    className="rounded-xl border border-neutral-medium dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-xs font-black outline-none focus:border-primary"
                                                >
                                                    <option>Required</option>
                                                    <option>Optional</option>
                                                </select>
                                                <button onClick={() => removeRequirement(requirement.id)} className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-rose-500 hover:bg-rose-100">
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                            <textarea
                                                value={requirement.description}
                                                onChange={(e) => updateRequirement(requirement.id, { description: e.target.value })}
                                                placeholder="Requirement notes or instructions..."
                                                className="w-full min-h-[72px] resize-none rounded-xl border border-neutral-medium dark:border-gray-700 bg-white dark:bg-gray-900 p-3 text-xs font-medium outline-none focus:border-primary"
                                            />
                                            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-neutral-medium dark:border-gray-700 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-secondary hover:border-primary hover:text-primary transition-colors">
                                                    {uploadingRequirementId === requirement.id ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                                                    Upload Template
                                                    <input type="file" className="hidden" onChange={(e) => handleUploadTemplate(requirement.id, e.target.files?.[0])} />
                                                </label>
                                                {requirement.templateFileName && (
                                                    <span className="text-xs font-bold text-secondary truncate">{requirement.templateFileName}</span>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex items-start gap-3 min-w-0">
                                                <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                                                    <span className="text-xs font-black">{index + 1}</span>
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <h4 className="text-sm font-black text-neutral-dark dark:text-white">{requirement.title || 'Untitled Requirement'}</h4>
                                                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${requirement.isRequired ? 'bg-rose-50 text-rose-500 border border-rose-100' : 'bg-neutral-light text-secondary border border-neutral-medium'}`}>
                                                            {requirement.isRequired ? 'Required' : 'Optional'}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs font-medium text-secondary mt-1 whitespace-pre-wrap">{requirement.description || 'No notes provided.'}</p>
                                                </div>
                                            </div>
                                            {requirement.templateFileId || requirement.templateUrl ? (
                                                <a
                                                    href={getDriveUrl(requirement.templateUrl || requirement.templateFileId)}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="flex-shrink-0 inline-flex items-center gap-2 rounded-xl bg-primary text-white px-3 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-primary-dark"
                                                >
                                                    <Download size={13} /> Template
                                                </a>
                                            ) : (
                                                <span className="flex-shrink-0 text-[10px] font-black text-secondary/40 uppercase tracking-widest">No template</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )) : (
                                <div className="rounded-2xl border border-dashed border-neutral-medium dark:border-gray-700 bg-white/50 dark:bg-gray-800/40 py-12 text-center">
                                    <FileText size={22} className="mx-auto mb-3 text-secondary/30" />
                                    <p className="text-[10px] font-black uppercase tracking-widest text-secondary/40">No requirements recorded yet</p>
                                </div>
                            )}
                        </div>
                    </section>

                    <section className="space-y-4">
                        <SectionTitle title="Common Issues / Reminders / Notes" />
                        <InfoCard>
                            {isEditing ? (
                                <textarea
                                    value={selectedManual.notes}
                                    onChange={(e) => setDraftManual(prev => prev ? { ...prev, notes: e.target.value } : prev)}
                                    placeholder="Add common issues, reminders, client handling notes, or office-specific guidance..."
                                    className="w-full min-h-[130px] resize-none rounded-xl border border-neutral-medium dark:border-gray-700 bg-white dark:bg-gray-900 p-3 text-sm font-medium text-neutral-dark dark:text-white outline-none focus:border-primary"
                                />
                            ) : (
                                <p className="text-sm font-semibold leading-relaxed text-neutral-dark dark:text-white whitespace-pre-wrap">{selectedManual.notes || 'No common issues or reminders recorded yet.'}</p>
                            )}
                        </InfoCard>
                    </section>
                </div>

                {isEditing && (
                    <div className="px-8 py-4 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-t border-neutral-medium dark:border-gray-700 flex gap-3">
                        <button onClick={() => selectedManualId ? openManual(manuals.find(item => item.id === selectedManualId) || selectedManual) : closeDrawer()} className="flex-1 rounded-xl border border-neutral-medium px-4 py-3 text-[10px] font-black uppercase tracking-widest text-secondary hover:bg-neutral-light transition-colors">
                            Cancel
                        </button>
                        <button onClick={handleSave} disabled={isSaving} className="flex-[2] rounded-xl bg-primary px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white hover:bg-primary-dark shadow-xl shadow-primary/20 disabled:opacity-50 flex items-center justify-center gap-2">
                            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                            Save Manual
                        </button>
                    </div>
                )}
            </div>
        </div>
    ) : null;

    return (
        <div className="w-full mx-auto p-2 space-y-4 animate-in fade-in duration-700">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2 px-1">
                <div className="space-y-0.5">
                    <div className="flex items-center gap-2.5">
                        <div className="w-1.5 h-7 bg-primary rounded-full" />
                        <h1 className="text-3xl font-black text-neutral-dark dark:text-white tracking-tight">Library</h1>
                    </div>
                    <p className="text-sm text-secondary dark:text-gray-300 font-medium pl-4 opacity-70 dark:opacity-100">
                        Service manuals, documentary requirements, templates, and office guidance
                    </p>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 p-1.5 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-sm shadow-neutral-dark/5">
                <div className="flex flex-col md:flex-row md:items-center gap-2">
                    <div className="relative group flex-1">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-secondary/40 group-focus-within:text-primary transition-colors" size={16} />
                        <input
                            type="text"
                            placeholder="Search service manuals..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-neutral-light/50 dark:bg-gray-900/50 border border-transparent focus:border-primary/20 rounded-xl text-[13px] font-medium text-neutral-dark dark:text-white outline-none focus:ring-4 focus:ring-primary/5 transition-all placeholder:text-secondary/30"
                        />
                    </div>
                    {canEdit && (
                        <button
                            onClick={openNewManual}
                            className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest bg-primary text-white hover:bg-primary-dark shadow-lg shadow-primary/20 active:scale-95 transition-all"
                        >
                            <Plus size={16} /> Add Library
                        </button>
                    )}
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-sm overflow-hidden">
                <div className="grid grid-cols-[1.6fr_0.7fr_0.9fr_0.4fr] gap-4 px-5 py-3 border-b border-neutral-medium dark:border-gray-700 text-[10px] font-black uppercase tracking-[0.25em] text-secondary">
                    <span>Manual</span>
                    <span>Requirements</span>
                    <span>Last Updated</span>
                    <span className="text-right">Action</span>
                </div>
                {filteredManuals.length > 0 ? filteredManuals.map(manual => {
                    const requirementsCount = manual.requirements?.filter(req => req.status !== 'Inactive').length || 0;
                    return (
                        <div
                            key={manual.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => openManual(manual)}
                            onKeyDown={(e) => e.key === 'Enter' && openManual(manual)}
                            className="w-full grid grid-cols-[1.6fr_0.7fr_0.9fr_0.4fr] gap-4 px-5 py-4 text-left border-b border-neutral-medium/70 dark:border-gray-700/70 last:border-b-0 hover:bg-primary/5 transition-colors cursor-pointer"
                        >
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="h-10 w-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                                    <BookOpen size={18} />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-black text-neutral-dark dark:text-white truncate">{manual.title || 'Untitled Manual'}</p>
                                    <p className="text-[10px] font-bold text-secondary truncate">{manual.overview || 'No overview recorded yet.'}</p>
                                </div>
                            </div>
                            <div className="flex items-center">
                                <span className="text-xs font-black text-neutral-dark dark:text-white">{requirementsCount} item{requirementsCount === 1 ? '' : 's'}</span>
                            </div>
                            <div className="flex items-center">
                                <span className="text-xs font-bold text-secondary">{formatDateTime(manual.lastUpdatedAt)}</span>
                            </div>
                            <div className="flex items-center justify-end">
                                {canEdit && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDelete(manual);
                                        }}
                                        disabled={deletingId === manual.id}
                                        className="h-9 w-9 rounded-xl border border-rose-100 bg-rose-50 text-rose-500 hover:bg-rose-100 disabled:opacity-50 flex items-center justify-center"
                                        title="Delete manual"
                                    >
                                        {deletingId === manual.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={15} />}
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                }) : (
                    <div className="py-16 text-center">
                        <BookOpen size={24} className="mx-auto mb-3 text-secondary/30" />
                        <p className="text-xs font-black uppercase tracking-widest text-secondary/50">No library manuals found</p>
                    </div>
                )}
            </div>

            {drawer && createPortal(drawer, document.body)}
        </div>
    );
};

const SectionTitle: React.FC<{ title: string }> = ({ title }) => (
    <div className="flex items-center gap-2">
        <div className="w-1 h-4 bg-primary rounded-full" />
        <h3 className="text-sm font-black text-neutral-dark dark:text-white">{title}</h3>
    </div>
);

const InfoCard: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="bg-white/85 dark:bg-gray-800/70 backdrop-blur-md rounded-2xl border border-neutral-medium/60 dark:border-gray-700 shadow-sm p-5">
        {children}
    </div>
);

export default Library;
