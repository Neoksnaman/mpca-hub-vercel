import React, { useContext, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    BookOpen,
    CheckCircle2,
    ExternalLink,
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
import { ServiceManual, ServiceRequirement } from '../types';
import { deleteFile, deleteServiceManual, normalizeId, saveServiceManual, uploadFile } from '../services/googleSheetsService';
import { MAX_TEMPLATE_SIZE } from '../constants';

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

const DeleteConfirmationModal = ({ isOpen, onClose, onConfirm, title, message, isDeleting }: any) => {
    if (!isOpen) return null;
    return createPortal(
        <div className="fixed inset-0 z-[20000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-rose-100 dark:border-rose-900/30 w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 text-center">
                    <div className="w-16 h-16 bg-rose-100 dark:bg-rose-900/30 rounded-full flex items-center justify-center mx-auto mb-4 text-rose-600 dark:text-rose-400">
                        <Trash2 size={32} />
                    </div>

                    <h3 className="text-lg font-bold text-neutral-dark dark:text-white mb-2">
                        {title}
                    </h3>
                    <p className="text-sm text-secondary dark:text-gray-400 mb-6">
                        {message}
                    </p>

                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            disabled={isDeleting}
                            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-secondary hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={onConfirm}
                            disabled={isDeleting}
                            className="flex-1 px-4 py-2.5 bg-rose-600 text-white rounded-xl text-sm font-bold hover:bg-rose-700 shadow-lg shadow-rose-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {isDeleting ? (
                                <>
                                    <Loader2 size={16} className="animate-spin" />
                                    Deleting...
                                </>
                            ) : (
                                'Yes, Delete'
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
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
    const [originalManual, setOriginalManual] = useState<ServiceManual | null>(null);
    const [uploadingRequirementId, setUploadingRequirementId] = useState<string | null>(null);
    const [pendingUploads, setPendingUploads] = useState<Record<string, File>>({});
    const [deleteModal, setDeleteModal] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => Promise<void>;
        isDeleting: boolean;
    }>({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: async () => {},
        isDeleting: false
    });

    const closeDeleteModal = () => setDeleteModal(prev => ({ ...prev, isOpen: false, isDeleting: false }));

    const openDeleteModal = (title: string, message: string, onConfirm: () => Promise<void>) => {
        setDeleteModal({
            isOpen: true,
            title,
            message,
            onConfirm: async () => {
                setDeleteModal(prev => ({ ...prev, isDeleting: true }));
                try {
                    await onConfirm();
                    closeDeleteModal();
                } catch (e) {
                    setDeleteModal(prev => ({ ...prev, isDeleting: false }));
                }
            },
            isDeleting: false
        });
    };

    const canEdit = !!currentUser;

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

    const openManual = async (manual: ServiceManual) => {
        setPendingUploads({});
        setSelectedManualId(manual.id);
        setOriginalManual(JSON.parse(JSON.stringify(manual)));
        setDraftManual(JSON.parse(JSON.stringify(manual)));
        setIsEditing(false);
    };

    const openNewManual = async () => {
        setPendingUploads({});
        setSelectedManualId(null);
        setOriginalManual(null);
        setDraftManual(emptyManual());
        setIsEditing(true);
    };

    const closeDrawer = async () => {
        setPendingUploads({});
        setSelectedManualId(null);
        setDraftManual(null);
        setOriginalManual(null);
        setIsEditing(false);
    };

    const updateRequirement = (id: string, updates: Partial<ServiceRequirement>) => {
        setDraftManual(prev => prev ? {
            ...prev,
            requirements: prev.requirements.map(requirement => requirement.id === id ? { ...requirement, ...updates } : requirement)
        } : prev);
    };

    const removeRequirement = (id: string) => {
        setPendingUploads(prev => {
            const next = { ...prev };
            delete next[id];
            return next;
        });
        setDraftManual(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                requirements: prev.requirements.filter(requirement => requirement.id !== id)
            };
        });
    };

    const handleUploadTemplate = async (requirementId: string, file?: File) => {
        if (!file) return;
        if (file.size > MAX_TEMPLATE_SIZE) {
            context?.showToast(`File "${file.name}" exceeds the ${MAX_TEMPLATE_SIZE / (1024 * 1024)} MB limit.`, 'error');
            return;
        }
        
        setPendingUploads(prev => ({ ...prev, [requirementId]: file }));
        const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
        updateRequirement(requirementId, {
            templateFileId: '', // Clear any existing ID since it will be replaced on save
            templateFileName: `${file.name} (${fileSizeMB} MB)`,
            templateUrl: '' // Clear URL as it's not uploaded yet
        });
        context?.showToast('Template attached and will be uploaded upon saving.', 'success');
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

            let cleanedRequirements = draftManual.requirements
                .map((requirement, index) => ({ ...requirement, sortOrder: index }))
                .filter(requirement => requirement.title.trim());

            // Process pending uploads
            const successfulUploadIds: string[] = [];
            const pendingEntries = Object.entries(pendingUploads) as [string, File][];
            if (pendingEntries.length > 0) {
                context?.showToast(`Uploading ${pendingEntries.length} attached file(s)...`, 'success');
            }

            for (const [reqId, file] of pendingEntries) {
                // Ensure this requirement still exists (wasn't deleted before save)
                if (!cleanedRequirements.find(r => r.id === reqId)) continue;

                try {
                    setUploadingRequirementId(reqId);
                    const result = await uploadFile(file, 'Library');
                    successfulUploadIds.push(result.id);
                    
                    cleanedRequirements = cleanedRequirements.map(req => 
                        req.id === reqId 
                            ? { ...req, templateFileId: result.id, templateUrl: result.url } 
                            : req
                    );
                } catch (uploadError: any) {
                    // Rollback successful uploads to prevent partial-save orphans
                    for (const id of successfulUploadIds) {
                        deleteFile(id).catch(() => {});
                    }
                    throw new Error(`Failed to upload ${file.name}. Save aborted.`);
                }
            }
            setUploadingRequirementId(null);

            // Compute Google Drive file IDs to delete (removed/replaced templates)
            const idsToDelete: string[] = [];
            if (originalManual) {
                originalManual.requirements?.forEach(orig => {
                    const edited = cleanedRequirements.find(r => r.id === orig.id);
                    if (!edited && orig.templateFileId) {
                        // Requirement removed entirely — delete its template file
                        idsToDelete.push(orig.templateFileId);
                    } else if (edited && orig.templateFileId && edited.templateFileId !== orig.templateFileId) {
                        // Template replaced — delete the old file
                        idsToDelete.push(orig.templateFileId);
                    }
                });
            }

            const result = await saveServiceManual({
                ...draftManual,
                title,
                userID: currentUser.id,
                requirements: cleanedRequirements
            });

            // Delete removed/replaced template files from Google Drive
            for (const fileId of idsToDelete) {
                try {
                    await deleteFile(fileId);
                } catch (e: any) {
                    context?.showToast(`Failed to delete template file from Drive: ${e.message || 'Unknown error'}`, 'error');
                }
            }

            context?.showToast('Service manual saved.', 'success');
            await context?.refreshData(true);
            setSelectedManualId(result.manual.id);
            setDraftManual(result.manual);
            setOriginalManual(JSON.parse(JSON.stringify(result.manual)));
            setPendingUploads({});
            setIsEditing(false);
        } catch (error: any) {
            context?.showToast(error.message || 'Unable to save service manual.', 'error');
        } finally {
            setIsSaving(false);
            setUploadingRequirementId(null);
        }
    };

    const handleDelete = (manual: ServiceManual) => {
        if (!manual.id) return;
        openDeleteModal(
            'Delete Service Manual?',
            `Are you sure you want to delete "${manual.title || 'this manual'}" from the Library? This action cannot be undone.`,
            async () => {
                try {
                    setDeletingId(manual.id);
                    await deleteServiceManual(manual.id);
                    context?.showToast('Service manual deleted.', 'success');
                    if (selectedManualId === manual.id) closeDrawer();
                    await context?.refreshData(true);
                } catch (error: any) {
                    context?.showToast(error.message || 'Unable to delete service manual.', 'error');
                    throw error;
                } finally {
                    setDeletingId(null);
                }
            }
        );
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
                        {canEdit && !isSaving && (
                            <button
                                onClick={async () => {
                                    if (isEditing) {
                                        setPendingUploads({});
                                        // Restore draft from original
                                        setDraftManual(originalManual ? JSON.parse(JSON.stringify(originalManual)) : emptyManual());
                                    }
                                    setIsEditing(prev => !prev);
                                }}
                                disabled={isEditing && !!uploadingRequirementId}
                                className="h-10 w-10 rounded-full border border-neutral-medium dark:border-gray-700 text-secondary hover:text-primary hover:border-primary/30 transition-colors flex items-center justify-center disabled:opacity-50"
                                title={isEditing ? 'Cancel editing' : 'Edit manual'}
                            >
                                {isEditing ? <X size={18} /> : <Pencil size={18} />}
                            </button>
                        )}
                        <button onClick={closeDrawer} disabled={isSaving || !!uploadingRequirementId} className="h-10 w-10 rounded-full text-secondary hover:text-primary transition-colors flex items-center justify-center disabled:opacity-50">
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
                                    disabled={isSaving}
                                    className="w-full min-h-[110px] resize-none rounded-xl border border-neutral-medium dark:border-gray-700 bg-white dark:bg-gray-900 p-3 text-sm font-medium text-neutral-dark dark:text-white outline-none focus:border-primary disabled:opacity-50"
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
                                    disabled={isSaving}
                                    className="w-full min-h-[160px] resize-none rounded-xl border border-neutral-medium dark:border-gray-700 bg-white dark:bg-gray-900 p-3 text-sm font-medium text-neutral-dark dark:text-white outline-none focus:border-primary disabled:opacity-50"
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
                                    disabled={isSaving}
                                    className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-emerald-600 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                                >
                                    <Plus size={14} /> Add Requirement
                                </button>
                            )}
                        </div>

                        <div className="space-y-3">
                            {selectedManual.requirements.length > 0 ? selectedManual.requirements.map((requirement, index) => (
                                <div key={requirement.id} className="bg-white/85 dark:bg-gray-800/70 backdrop-blur-md rounded-xl border border-neutral-medium/60 dark:border-gray-700 shadow-sm px-3 py-2.5">
                                    {isEditing ? (
                                        <div className="space-y-2">
                                            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-1.5">
                                                <input
                                                    value={requirement.title}
                                                    onChange={(e) => updateRequirement(requirement.id, { title: e.target.value })}
                                                    placeholder="Requirement title"
                                                    disabled={isSaving}
                                                    className="rounded-lg border border-neutral-medium dark:border-gray-700 bg-white dark:bg-gray-900 px-2.5 py-1.5 text-xs font-bold outline-none focus:border-primary disabled:opacity-50"
                                                />
                                                <select
                                                    value={requirement.isRequired ? 'Required' : 'Optional'}
                                                    onChange={(e) => updateRequirement(requirement.id, { isRequired: e.target.value === 'Required' })}
                                                    disabled={isSaving}
                                                    className="rounded-lg border border-neutral-medium dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 text-[11px] font-black outline-none focus:border-primary disabled:opacity-50"
                                                >
                                                    <option>Required</option>
                                                    <option>Optional</option>
                                                </select>
                                                <button onClick={() => removeRequirement(requirement.id)} disabled={isSaving} className="rounded-lg border border-rose-100 bg-rose-50 px-2.5 py-1.5 text-rose-500 hover:bg-rose-100 disabled:opacity-50">
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                            <textarea
                                                value={requirement.description}
                                                onChange={(e) => updateRequirement(requirement.id, { description: e.target.value })}
                                                placeholder="Requirement notes or instructions..."
                                                disabled={isSaving}
                                                className="w-full min-h-[52px] resize-none rounded-lg border border-neutral-medium dark:border-gray-700 bg-white dark:bg-gray-900 px-2.5 py-1.5 text-xs font-medium outline-none focus:border-primary disabled:opacity-50"
                                            />
                                            <div className="flex items-center gap-2">
                                                <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-neutral-medium dark:border-gray-700 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-secondary hover:border-primary hover:text-primary transition-colors${isSaving ? ' pointer-events-none opacity-50' : ''}`}>
                                                    {uploadingRequirementId === requirement.id ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
                                                    {requirement.templateFileName ? requirement.templateFileName : `Upload Template`}
                                                    <input type="file" className="hidden" onChange={(e) => handleUploadTemplate(requirement.id, e.target.files?.[0])} />
                                                </label>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <div className="h-6 w-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                                                    <span className="text-[10px] font-black">{index + 1}</span>
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                        <h4 className="text-xs font-black text-neutral-dark dark:text-white">{requirement.title || 'Untitled Requirement'}</h4>
                                                        <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-black ${requirement.isRequired ? 'bg-rose-50 text-rose-500 border border-rose-100' : 'bg-neutral-light text-secondary border border-neutral-medium'}`}>
                                                            {requirement.isRequired ? 'Required' : 'Optional'}
                                                        </span>
                                                    </div>
                                                    {requirement.description && (
                                                        <p className="text-[11px] font-medium text-secondary mt-0.5 whitespace-pre-wrap">{requirement.description}</p>
                                                    )}
                                                </div>
                                            </div>
                                            {requirement.templateFileId || requirement.templateUrl ? (
                                                <a
                                                    href={getDriveUrl(requirement.templateUrl || requirement.templateFileId)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="p-1.5 text-primary hover:bg-primary/10 rounded-lg transition-all"
                                                >
                                                    <ExternalLink size={14} />
                                                </a>
                                            ) : (
                                                <div className="p-1.5 text-secondary dark:text-gray-500 opacity-20 dark:opacity-40"><ExternalLink size={14} /></div>
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
                                    disabled={isSaving}
                                    className="w-full min-h-[130px] resize-none rounded-xl border border-neutral-medium dark:border-gray-700 bg-white dark:bg-gray-900 p-3 text-sm font-medium text-neutral-dark dark:text-white outline-none focus:border-primary disabled:opacity-50"
                                />
                            ) : (
                                <p className="text-sm font-semibold leading-relaxed text-neutral-dark dark:text-white whitespace-pre-wrap">{selectedManual.notes || 'No common issues or reminders recorded yet.'}</p>
                            )}
                        </InfoCard>
                    </section>
                </div>

                {isEditing && (
                    <div className="px-8 py-4 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-t border-neutral-medium dark:border-gray-700 flex gap-3">
                        <button onClick={() => selectedManualId ? openManual(manuals.find(item => item.id === selectedManualId) || selectedManual) : closeDrawer()} disabled={isSaving || !!uploadingRequirementId} className="flex-1 rounded-xl border border-neutral-medium px-4 py-3 text-[10px] font-black uppercase tracking-widest text-secondary hover:bg-neutral-light transition-colors disabled:opacity-50">
                            Cancel
                        </button>
                        <button onClick={handleSave} disabled={isSaving} className="flex-[2] rounded-xl bg-primary px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white hover:bg-primary-dark shadow-xl shadow-primary/20 disabled:opacity-50 flex items-center justify-center gap-2">
                            {isSaving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : <><CheckCircle2 size={14} /> Save Manual</>}
                        </button>
                    </div>
                )}
            </div>
        </div>
    ) : null;

    return (
        <div className="w-full mx-auto p-2 space-y-2 animate-in fade-in duration-700">
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
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-secondary/40 dark:text-gray-400/60 group-focus-within:text-primary transition-colors" size={16} />
                        <input
                            type="text"
                            placeholder="Search service manuals..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-neutral-light/50 dark:bg-gray-900/50 border border-transparent focus:border-primary/20 rounded-xl text-[13px] font-medium text-neutral-dark dark:text-white outline-none focus:ring-4 focus:ring-primary/5 transition-all placeholder:text-secondary/30 dark:placeholder:text-gray-500"
                        />
                    </div>

                    <div className="w-px h-6 bg-neutral-medium dark:bg-gray-700 mx-1 hidden md:block" />

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
                <div className="grid grid-cols-[1.6fr_0.7fr_0.9fr_0.4fr] gap-4 px-5 py-3 border-b border-neutral-medium dark:border-gray-700 text-[9px] font-black uppercase tracking-widest text-secondary dark:text-gray-400">
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
                            className="w-full grid grid-cols-[1.6fr_0.7fr_0.9fr_0.4fr] gap-4 px-5 py-2.5 text-left border-b border-neutral-medium/30 dark:border-gray-700/30 last:border-b-0 group cursor-pointer transition-all duration-300 hover:bg-primary/[0.02] dark:hover:bg-primary/[0.05] relative hover:z-[10]"
                        >
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="h-8 w-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                                    <BookOpen size={18} />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[13px] font-black text-neutral-dark dark:text-white truncate group-hover:text-primary transition-colors">{manual.title || 'Untitled Manual'}</p>
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
                                        className="p-1.5 rounded-lg text-secondary dark:text-gray-400 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-500/10 disabled:opacity-50 flex items-center justify-center transition-all"
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
                        <div className="relative inline-flex mb-4">
                            <BookOpen size={32} className="text-primary/15 dark:text-primary/10" />
                            <Search className="absolute bottom-0 right-0 text-primary/30" size={24} />
                        </div>
                        <h3 className="text-xl font-black text-neutral-dark dark:text-white tracking-tight">No library manuals found</h3>
                        <p className="text-sm text-secondary/60 font-medium mt-1">
                            {searchQuery ? "No records match your search query." : "There are no service manuals recorded in the system yet."}
                        </p>
                    </div>
                )}
            </div>

            {drawer && createPortal(drawer, document.body)}

            <DeleteConfirmationModal
                {...deleteModal}
                onClose={closeDeleteModal}
            />
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