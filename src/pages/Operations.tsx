import React, { useState, useContext, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { AppContext } from '../App';
import UserHoverCard from '../components/UserHoverCard';
import {
    Plus,
    Search,
    FileText,
    Users,
    Upload,
    X,
    CheckCircle2,
    Loader2,
    Trash2,
    ExternalLink,
    ChevronDown,
    ChevronRight,
    Check,
    Printer,
    Pencil
} from 'lucide-react';
import { addTransmittal, addMeeting, uploadFile, updateTransmittal, updateMeeting, normalizeId, deleteFile, deleteTransmittal, deleteMeeting, addNotification, fetchAuditLogs } from '../services/googleSheetsService';
import { useReactToPrint } from 'react-to-print';
import { TransmittalPrintTemplate } from '../components/TransmittalPrintTemplate';


const getDriveUrl = (idOrUrl: string) => {
    if (!idOrUrl) return '';
    if (idOrUrl.startsWith('http')) return idOrUrl;
    return `https://drive.google.com/file/d/${idOrUrl}/view?usp=sharing`;
};

const getUserFullName = (user: any) => `${user?.firstName || ''} ${user?.lastName || ''}`.trim();
const sortUsersByName = (users: any[]) => [...users].sort((a, b) => getUserFullName(a).localeCompare(getUserFullName(b)));

const formatAuditTimestamp = (value: string) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('default', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const formatAuditFieldLabel = (key: string) => {
    const labels: Record<string, string> = {
        clientID: 'Client',
        userID: 'Representative',
        userIDs: 'Attendees',
        itemCount: 'Document Count',
        receiptUrl: 'Official Slip',
        momUrl: 'Minutes Attachment',
        receiverName: 'Receiver Name',
        receiverAddress: 'Receiver Address',
        attendeeCount: 'Attendee Count'
    };
    return labels[key] || key
        .replace(/ID$/, '')
        .replace(/Id$/, '')
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, char => char.toUpperCase())
        .trim();
};

const getOperationAuditDetailRows = (details: any) => {
    const before = details?.before || {};
    const after = details?.after || {};
    const hiddenKeys = new Set(['transmittalID', 'meetingID']);
    const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
        .filter(key => !hiddenKeys.has(key))
        .filter(key => String(before[key] ?? '') !== String(after[key] ?? ''));

    return keys.map(key => ({
        key,
        label: formatAuditFieldLabel(key),
        before: before[key],
        after: after[key]
    }));
};

const getDateSortValue = (dateStr: string) => {
    if (!dateStr) return 0;
    if (dateStr.includes('/')) {
        const [m, d, y] = dateStr.split('/').map(Number);
        return new Date(y, m - 1, d).getTime();
    }
    const parsed = new Date(dateStr).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
};

const getRefSortValue = (ref: string) => {
    const match = String(ref || '').match(/\d+/g);
    return match ? Number(match.join('')) : 0;
};

const getTransmittalClientName = (clientID: any, clientById: Map<string, any>) => {
    const text = String(clientID || '').trim();
    if (!text) return 'Unknown Client';
    const client = clientById.get(normalizeId(text)) as any;
    return client?.name || text;
};

const getTransmittalClientForPrint = (clientID: any, clientById: Map<string, any>) => {
    const text = String(clientID || '').trim();
    const client = clientById.get(normalizeId(text)) as any;
    return client || {
        id: text,
        name: text,
        contactPerson: '',
        email: '',
        tin: '',
        entityType: '',
        fiscalYearEnd: ''
    };
};

const TablePagination = ({ currentPage, totalPages, startIndex, itemsPerPage, totalItems, setCurrentPage }: any) => {
    if (totalPages <= 1) return null;

    return (
        <div className="px-4 py-3 bg-white dark:bg-gray-800 border-t border-neutral-medium/50 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-[11px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest">
                Showing {startIndex + 1}-{Math.min(startIndex + itemsPerPage, totalItems)} of {totalItems}
            </p>
            <div className="flex items-center gap-2">
                <button
                    onClick={() => setCurrentPage((page: number) => Math.max(1, page - 1))}
                    disabled={currentPage === 1}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-medium dark:border-gray-700 text-[11px] font-black uppercase tracking-wider text-neutral-dark dark:text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-light dark:hover:bg-gray-700 transition-colors"
                >
                    <ChevronRight size={14} className="rotate-180" />
                    Prev
                </button>
                <span className="px-3 py-1.5 rounded-lg bg-neutral-light dark:bg-gray-900 text-[11px] font-black text-primary">
                    {currentPage} / {totalPages}
                </span>
                <button
                    onClick={() => setCurrentPage((page: number) => Math.min(totalPages, page + 1))}
                    disabled={currentPage === totalPages}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-medium dark:border-gray-700 text-[11px] font-black uppercase tracking-wider text-neutral-dark dark:text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-light dark:hover:bg-gray-700 transition-colors"
                >
                    Next
                    <ChevronRight size={14} />
                </button>
            </div>
        </div>
    );
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

const TooltipPortal = ({ children, targetRef, showBelow, isOpen }: any) => {
    const [coords, setCoords] = React.useState<{ top: number, left: number } | null>(null);

    React.useLayoutEffect(() => {
        if (!isOpen || !targetRef.current) {
            setCoords(null);
            return;
        }

        const updatePosition = () => {
            const rect = targetRef.current.getBoundingClientRect();
            setCoords({
                top: showBelow ? rect.bottom + window.scrollY : rect.top + window.scrollY,
                left: rect.left + rect.width / 2 + window.scrollX
            });
        };

        updatePosition();
        window.addEventListener('scroll', updatePosition, true);
        window.addEventListener('resize', updatePosition);
        return () => {
            window.removeEventListener('scroll', updatePosition, true);
            window.removeEventListener('resize', updatePosition);
        };
    }, [targetRef, showBelow, isOpen]);

    if (!isOpen || !coords) return null;

    return createPortal(
        <div
            style={{
                position: 'absolute',
                top: coords.top,
                left: coords.left,
                transform: `translateX(-50%) ${showBelow ? 'translateY(8px)' : 'translateY(-8px) translateY(-100%)'}`,
                zIndex: 20000
            }}
            className="animate-in fade-in zoom-in-95 duration-200 pointer-events-auto"
        >
            {children}
            <div className={`absolute ${showBelow ? 'bottom-full -mb-1 rotate-180' : 'top-full -mt-1'} left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-dark/95`} />
        </div>,
        document.body
    );
};

const AttendeeTooltipList = ({ attendeeIds, attendeeCount, staff, showBelow }: any) => {
    const [isOpen, setIsOpen] = useState(false);
    const targetRef = useRef<HTMLDivElement>(null);

    return (
        <div
            ref={targetRef}
            className="relative"
            onMouseEnter={() => setIsOpen(true)}
            onMouseLeave={() => setIsOpen(false)}
        >
            <div className="w-7 h-7 rounded-full bg-neutral-light dark:bg-gray-700 border-2 border-white dark:border-gray-800 flex items-center justify-center text-[10px] font-black text-secondary shadow-sm cursor-help transition-transform hover:scale-110">
                +{attendeeCount - 3}
            </div>

            <TooltipPortal targetRef={targetRef} showBelow={showBelow} isOpen={isOpen}>
                <div className="bg-neutral-dark/95 backdrop-blur-md text-white text-[10px] py-2.5 px-3.5 rounded-xl shadow-2xl border border-white/10 min-w-[160px] max-h-[180px] overflow-y-auto custom-scrollbar pointer-events-auto">
                    <ul className="space-y-1.5">
                        {attendeeIds.slice(3).map((id: string, i: number) => {
                            const member = staff.find((u: any) => normalizeId(u.id) === normalizeId(id));
                            return (
                                <li key={i} className="flex items-center gap-2 whitespace-nowrap">
                                    <div className="w-1 h-1 rounded-full bg-primary shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
                                    <span className="opacity-90">{member ? `${member.firstName} ${member.lastName}` : 'Unknown User'}</span>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            </TooltipPortal>
        </div>
    );
};

const Operations: React.FC = () => {
    const context = useContext(AppContext);
    const location = useLocation();
    const activeTab: 'Transmittals' | 'Meetings' = location.pathname === '/meetings' ? 'Meetings' : 'Transmittals';
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // --- Transmittal State ---
    const [showTransmittalForm, setShowTransmittalForm] = useState(false);
    const [transmittalData, setTransmittalData] = useState({
        clientID: '',
        userID: context?.user?.id || '',
        items: [] as string[],
        date: new Date().toISOString().split('T')[0],
        receiptUrl: '',
        receiverName: '',
        receiverAddress: ''
    });
    const [newItemText, setNewItemText] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [isEditingTransmittal, setIsEditingTransmittal] = useState(false);

    // --- Meeting State ---
    const [showMeetingForm, setShowMeetingForm] = useState(false);
    const [selectedMeetingFile, setSelectedMeetingFile] = useState<File | null>(null);
    const [meetingData, setMeetingData] = useState({
        date: new Date().toISOString().split('T')[0],
        subject: '',
        userIDs: [] as string[],
        momUrl: ''
    });
    const [isEditingMeeting, setIsEditingMeeting] = useState(false);

    // --- Detail Drawer States ---
    const [selectedTransmittal, setSelectedTransmittal] = useState<any | null>(null);
    const [selectedMeeting, setSelectedMeeting] = useState<any | null>(null);

    // --- Delete Modal State ---
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

    // --- Unified Header State Mapping ---
    const handleCloseTransmittalForm = () => {
        setShowTransmittalForm(false);
        setTransmittalData({
            clientID: '',
            userID: context?.user?.id || '',
            items: [],
            date: new Date().toISOString().split('T')[0],
            receiptUrl: '',
            receiverName: '',
            receiverAddress: ''
        });
        setNewItemText('');
    };

    const handleCloseMeetingForm = () => {
        setShowMeetingForm(false);
        setMeetingData({
            date: new Date().toISOString().split('T')[0],
            subject: '',
            userIDs: [],
            momUrl: ''
        });
        setSelectedMeetingFile(null);
    };

    const showForm = activeTab === 'Transmittals' ? showTransmittalForm : showMeetingForm;
    const setShowForm = activeTab === 'Transmittals'
        ? ((val: boolean) => val ? setShowTransmittalForm(true) : handleCloseTransmittalForm())
        : ((val: boolean) => val ? setShowMeetingForm(true) : handleCloseMeetingForm());

    const clients = context?.clients || [];
    const users = context?.users || [];
    const transmittals = context?.transmittals || [];
    const meetings = context?.meetings || [];
    const currentUser = context?.user;
    const canDeleteTransmittalItem = (item: any) =>
        ['Admin', 'Manager', 'Supervisor'].includes(String(currentUser?.role || '')) ||
        normalizeId(item?.userID) === normalizeId(currentUser?.id);
    const canDeleteMeetingItem = () =>
        ['Admin', 'Manager', 'Supervisor', 'Senior'].includes(String(currentUser?.role || ''));

    const formatDateForSheet = (dateStr: string) => {
        if (!dateStr) return '';
        if (dateStr.includes('/')) return dateStr;
        const [year, month, day] = dateStr.split('-');
        if (!year || !month || !day) return dateStr;
        return `${month}/${day}/${year}`;
    };

    const formatDateForUI = (dateStr: string) => {
        if (!dateStr) return '---';
        let date;
        if (dateStr.includes('/')) {
            const [m, d, y] = dateStr.split('/');
            date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
        } else if (dateStr.includes('-')) {
            const [y, m, d] = dateStr.split('-');
            date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
        } else {
            return dateStr;
        }
        return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    };

    const parseDateToInputFormat = (dateStr: string) => {
        let formattedDate = new Date().toISOString().split('T')[0];
        if (dateStr) {
            if (dateStr.includes('/')) {
                const [mon, day, year] = dateStr.split('/');
                formattedDate = `${year}-${mon.padStart(2, '0')}-${day.padStart(2, '0')}`;
            } else if (dateStr.includes('-')) {
                formattedDate = dateStr;
            }
        }
        return formattedDate;
    };

    const handleAddTransmittal = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!transmittalData.clientID || transmittalData.items.length === 0) return;

        setIsSubmitting(true);
        try {
            // 1. Save to sheet (skip file upload here)
            const result = await addTransmittal({
                ...transmittalData,
                date: formatDateForSheet(transmittalData.date),
                receiptUrl: '', // Will be updated in drawer
                items: transmittalData.items.join('||')
            });

            context?.showToast?.('Transmittal recorded!', 'success');

            const newTransmittal = {
                ...transmittalData,
                transmittalID: result.transmittalID,
                date: formatDateForSheet(transmittalData.date),
                items: transmittalData.items.join('||'),
                receiptUrl: ''
            };

            // Automatically open the drawer for the newly added transmittal so they can download the PDF
            setSelectedTransmittal(newTransmittal);

            handleCloseTransmittalForm();
            context?.refreshData();
        } catch (error: any) {
            context?.showToast?.(error.message || 'Failed to save', 'error');
        } finally {
            setIsSubmitting(false);
            setIsUploading(false);
        }
    };

    const handleAddMeeting = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!meetingData.subject || meetingData.userIDs.length === 0) return;

        setIsSubmitting(true);
        try {
            let finalMomUrl = meetingData.momUrl;

            // 1. Upload file if selected
            if (selectedMeetingFile) {
                setIsUploading(true);
                const uploadRes = await uploadFile(selectedMeetingFile, 'Meeting');
                finalMomUrl = uploadRes.id;
                setIsUploading(false);
            }

            await addMeeting({
                ...meetingData,
                date: formatDateForSheet(meetingData.date),
                momUrl: finalMomUrl,
                userIDs: meetingData.userIDs.join(',')
            });

            context?.showToast?.('Meeting recorded!', 'success');
            handleCloseMeetingForm();
            context?.refreshData();
        } catch (error: any) {
            context?.showToast?.(error.message || 'Failed to save', 'error');
        } finally {
            setIsSubmitting(false);
            setIsUploading(false);
        }
    };

    const handleUpdateMeeting = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedMeeting || !meetingData.subject || meetingData.userIDs.length === 0) return;

        setIsSubmitting(true);
        try {
            const result = await updateMeeting(selectedMeeting.meetingID, {
                ...meetingData,
                date: formatDateForSheet(meetingData.date),
                userIDs: meetingData.userIDs.join(',')
            });

            if (result?.unchanged) {
                context?.showToast?.('No changes to save.', 'info');
                setIsEditingMeeting(false);
                return;
            }

            context?.showToast?.('Meeting updated!', 'success');
            // Update the selected item state so the drawer reflects changes immediately
            setSelectedMeeting({
                ...selectedMeeting,
                ...meetingData,
                date: meetingData.date,
                userIDs: meetingData.userIDs.join(',')
            });
            setIsEditingMeeting(false);
            context?.refreshData();
        } catch (error: any) {
            context?.showToast?.(error.message || 'Failed to update', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUpdateTransmittal = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedTransmittal || !transmittalData.clientID || transmittalData.items.length === 0) return;

        setIsSubmitting(true);
        try {
            const result = await updateTransmittal(selectedTransmittal.transmittalID, {
                ...transmittalData,
                date: formatDateForSheet(transmittalData.date),
                items: transmittalData.items.join('||')
            });

            if (result?.unchanged) {
                context?.showToast?.('No changes to save.', 'info');
                setIsEditingTransmittal(false);
                return;
            }

            context?.showToast?.('Transmittal updated!', 'success');
            // Update the selected item state so the drawer reflects changes immediately
            setSelectedTransmittal({
                ...selectedTransmittal,
                ...transmittalData,
                date: transmittalData.date,
                items: transmittalData.items.join('||')
            });
            setIsEditingTransmittal(false);
            context?.refreshData();
        } catch (error: any) {
            context?.showToast?.(error.message || 'Failed to update', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const startEditingMeeting = (m: any) => {
        setMeetingData({
            subject: m.subject || '',
            date: parseDateToInputFormat(m.date),
            userIDs: m.userIDs ? m.userIDs.split(',') : [],
            momUrl: m.momUrl || ''
        });
        setIsEditingMeeting(true);
    };

    const startEditingTransmittal = (t: any) => {
        setTransmittalData({
            clientID: t.clientID || '',
            userID: t.userID || context?.user?.id || '',
            items: t.items ? t.items.split('||') : [],
            date: parseDateToInputFormat(t.date),
            receiptUrl: t.receiptUrl || '',
            receiverName: t.receiverName || '',
            receiverAddress: t.receiverAddress || ''
        });
        setIsEditingTransmittal(true);
    };

    // Auto-reset editing states when selection cleared
    React.useEffect(() => {
        if (!selectedMeeting) setIsEditingMeeting(false);
    }, [selectedMeeting]);

    React.useEffect(() => {
        if (!selectedTransmittal) setIsEditingTransmittal(false);
    }, [selectedTransmittal]);

    // Clear form states when exiting edit mode to prevent leaking edit data into the add modals
    React.useEffect(() => {
        if (!isEditingMeeting) {
            setMeetingData({
                date: new Date().toISOString().split('T')[0],
                subject: '',
                userIDs: [],
                momUrl: ''
            });
            setSelectedMeetingFile(null);
        }
    }, [isEditingMeeting]);

    React.useEffect(() => {
        if (!isEditingTransmittal) {
            setTransmittalData({
                clientID: '',
                userID: context?.user?.id || '',
                items: [],
                date: new Date().toISOString().split('T')[0],
                receiptUrl: '',
                receiverName: '',
                receiverAddress: ''
            });
            setNewItemText('');
        }
    }, [isEditingTransmittal, context?.user?.id]);

    const addItem = () => {
        if (!newItemText.trim()) return;
        setTransmittalData(prev => ({
            ...prev,
            items: [...prev.items, newItemText.trim()]
        }));
        setNewItemText('');
    };

    const removeItem = (index: number) => {
        setTransmittalData(prev => ({
            ...prev,
            items: prev.items.filter((_, i) => i !== index)
        }));
    };

    return (
        <div className="w-full mx-auto p-2 space-y-2 animate-in fade-in duration-700">
            {/* Premium Header Section */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2 px-1">
                <div className="space-y-0.5">
                    <div className="flex items-center gap-2.5">
                        <div className="w-1.5 h-7 bg-primary rounded-full" />
                        <h1 className="text-3xl font-black text-neutral-dark dark:text-white tracking-tight">
                            {activeTab === 'Transmittals' ? 'Transmittals' : 'Meetings'}
                        </h1>
                    </div>
                    <p className="text-sm text-secondary dark:text-gray-300 font-medium pl-4 opacity-70 dark:opacity-100">
                        {activeTab === 'Transmittals'
                            ? 'Document handoffs, receipts, and receiver tracking'
                            : 'Professional meeting logs, attendees, and minutes'}
                    </p>
                </div>
            </div>

            {/* Premium Integrated Toolbar */}
            <div className="bg-white dark:bg-gray-800 p-1.5 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-sm shadow-neutral-dark/5">
                <div className="flex flex-col md:flex-row md:items-center gap-2">
                    {/* Integrated Search */}
                    <div className="relative group flex-1">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-secondary/40 dark:text-gray-400/60 group-focus-within:text-primary transition-colors" size={16} />
                        <input
                            type="text"
                            placeholder={`Search ${activeTab.toLowerCase()} by subject or client...`}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-neutral-light/50 dark:bg-gray-900/50 border border-transparent focus:border-primary/20 rounded-xl text-[13px] font-medium text-neutral-dark dark:text-white outline-none focus:ring-4 focus:ring-primary/5 transition-all placeholder:text-secondary/30 dark:placeholder:text-gray-500"
                        />
                    </div>

                    <div className="w-px h-6 bg-neutral-medium dark:bg-gray-700 mx-1 hidden md:block" />

                    <button
                        onClick={() => setShowForm(!showForm)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all duration-300 ${showForm
                            ? 'bg-rose-500 text-white hover:bg-rose-600'
                            : 'bg-primary text-white hover:bg-primary-dark shadow-lg shadow-primary/20 active:scale-95'}`}
                    >
                        {showForm ? <X size={16} /> : <Plus size={16} />}
                        {showForm ? 'Discard Draft' : `Add ${activeTab.slice(0, -1)}`}
                    </button>
                </div>
            </div>

            {/* Tab Content */}
            <div className="space-y-6">
                {activeTab === 'Transmittals' ? (
                    <TransmittalSection
                        showForm={showTransmittalForm}
                        setShowForm={setShowForm}
                        data={transmittalData}
                        setData={setTransmittalData}
                        newItemText={newItemText}
                        setNewItemText={setNewItemText}
                        addItem={addItem}
                        removeItem={removeItem}
                        onSubmit={isEditingTransmittal ? handleUpdateTransmittal : handleAddTransmittal}
                        isSubmitting={isSubmitting}
                        clients={clients}
                        staff={users}
                        history={transmittals}
                        searchQuery={searchQuery}
                        isUploadingMain={isUploading}
                        formatDateForUI={formatDateForUI}
                        selectedItem={selectedTransmittal}
                        setSelectedItem={setSelectedTransmittal}
                        openDeleteModal={openDeleteModal}
                        isEditing={isEditingTransmittal}
                        setIsEditing={setIsEditingTransmittal}
                        startEditing={startEditingTransmittal}
                        canDeleteTransmittalItem={canDeleteTransmittalItem}
                    />
                ) : (
                    <MeetingSection
                        showForm={showMeetingForm}
                        setShowForm={setShowForm}
                        data={meetingData}
                        setData={setMeetingData}
                        onSubmit={isEditingMeeting ? handleUpdateMeeting : handleAddMeeting}
                        isSubmitting={isSubmitting}
                        staff={users}
                        history={meetings}
                        searchQuery={searchQuery}
                        selectedFile={selectedMeetingFile}
                        onFileSelect={setSelectedMeetingFile}
                        isUploading={isUploading}
                        formatDateForUI={formatDateForUI}
                        selectedItem={selectedMeeting}
                        setSelectedItem={setSelectedMeeting}
                        openDeleteModal={openDeleteModal}
                        isEditing={isEditingMeeting}
                        setIsEditing={setIsEditingMeeting}
                        startEditing={startEditingMeeting}
                        canDeleteMeetingItem={canDeleteMeetingItem}
                    />
                )}
            </div>

            <DeleteConfirmationModal
                {...deleteModal}
                onClose={closeDeleteModal}
            />
        </div>
    );
};

// --- SUB-COMPONENTS ---

const ClientSearchableSelect = ({ clients, value, onChange }: any) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);
    const trimmedSearch = search.trim();

    const sortedClients = useMemo(() => {
        return [...clients].sort((a, b) => a.name.localeCompare(b.name));
    }, [clients]);

    const filteredClients = useMemo(() => {
        if (!search) return sortedClients;
        return sortedClients.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
    }, [sortedClients, search]);

    const selectedClient = clients.find((c: any) => normalizeId(c.id) === normalizeId(value));
    const selectedManualValue = !selectedClient ? String(value || '').trim() : '';

    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="relative" ref={dropdownRef}>
            <div
                onClick={() => setIsOpen(!isOpen)}
                className="w-full px-4 py-2 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium dark:border-gray-700 rounded-xl text-xs font-bold focus:ring-4 focus:ring-primary/5 outline-none transition-all cursor-pointer flex items-center justify-between"
            >
                <span className={selectedClient || selectedManualValue ? "text-neutral-dark dark:text-white truncate" : "text-secondary/50 font-medium"}>
                    {selectedClient ? selectedClient.name : selectedManualValue || "Select a client..."}
                </span>
                <ChevronDown size={14} className={`text-secondary transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </div>

            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 border border-neutral-medium dark:border-gray-700 rounded-xl shadow-xl z-[50] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="p-2 border-b border-neutral-medium dark:border-gray-700">
                        <div className="relative">
                            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-secondary/50" />
                            <input
                                type="text"
                                placeholder="Search clients..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                className="w-full pl-8 pr-3 py-1.5 bg-neutral-light dark:bg-gray-900 border-none rounded-lg text-xs font-medium outline-none focus:ring-2 focus:ring-primary/20"
                                autoFocus
                            />
                        </div>
                    </div>
                    <div className="max-h-[200px] overflow-y-auto custom-scrollbar p-1">
                        {filteredClients.length === 0 ? (
                            <div className="space-y-1 px-1 py-2">
                                <div className="px-3 py-2 text-center text-xs text-secondary/50">No clients found</div>
                                {trimmedSearch && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onChange(trimmedSearch);
                                            setIsOpen(false);
                                            setSearch('');
                                        }}
                                        className="w-full text-left px-3 py-2.5 rounded-lg text-xs font-black text-primary bg-primary/5 hover:bg-primary/10 border border-primary/10 transition-all"
                                    >
                                        Use manual entity: "{trimmedSearch}"
                                        <span className="block text-[9px] font-bold text-secondary/70 mt-0.5">This will not create a client profile.</span>
                                    </button>
                                )}
                            </div>
                        ) : (
                            filteredClients.map((c: any) => (
                                <div
                                    key={c.id}
                                    onClick={() => {
                                        onChange(c.id);
                                        setIsOpen(false);
                                        setSearch('');
                                    }}
                                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-between ${normalizeId(value) === normalizeId(c.id) ? 'bg-primary/10 text-primary' : 'text-neutral-dark dark:text-white hover:bg-neutral-light dark:hover:bg-gray-700'}`}
                                >
                                    {c.name}
                                    {normalizeId(value) === normalizeId(c.id) && <Check size={12} className="text-primary" />}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};


const TransmittalFormFields = ({ data, setData, clients, users, newItemText, setNewItemText, addItem, removeItem, context }: any) => (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <div className="space-y-1 col-span-2 relative z-20">
            <label className="text-[10px] font-black text-secondary dark:text-gray-400 ml-1">Client Entity</label>
            <ClientSearchableSelect
                clients={clients}
                value={data.clientID}
                onChange={(id: string) => setData({ ...data, clientID: id })}
            />
        </div>

        <div className="space-y-1">
            <label className="text-[10px] font-black text-secondary dark:text-gray-400 ml-1">Log Date</label>
            <input
                type="date"
                required
                value={data.date}
                onChange={(e) => setData({ ...data, date: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium/70 dark:border-gray-700 rounded-xl text-xs font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary/30 outline-none transition-all"
            />
        </div>

        <div className="space-y-1">
            <label className="text-[10px] font-black text-secondary dark:text-gray-400 ml-1">Staff</label>
            <select
                required
                value={data.userID}
                onChange={(e) => setData({ ...data, userID: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium/70 dark:border-gray-700 rounded-xl text-xs font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary/30 outline-none transition-all"
            >
                {sortUsersByName((context?.user?.role === 'Admin' ? users : users.filter((u: any) => normalizeId(u.id) === normalizeId(context?.user?.id))).filter((u: any) => u.status === 'Active')).map((u: any) => (
                    <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                ))}
            </select>
        </div>

        <div className="space-y-1">
            <label className="text-[10px] font-black text-secondary dark:text-gray-400 ml-1">Receiver Name</label>
            <input
                type="text"
                required
                placeholder="Enter receiver name"
                value={data.receiverName || ''}
                onChange={(e) => setData({ ...data, receiverName: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium/70 dark:border-gray-700 rounded-xl text-xs font-bold placeholder:font-medium focus:ring-4 focus:ring-primary/5 focus:border-primary/30 outline-none transition-all"
            />
        </div>

        <div className="space-y-1">
            <label className="text-[10px] font-black text-secondary dark:text-gray-400 ml-1">Receiver Address</label>
            <input
                type="text"
                required
                placeholder="Enter receiver address"
                value={data.receiverAddress || ''}
                onChange={(e) => setData({ ...data, receiverAddress: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium/70 dark:border-gray-700 rounded-xl text-xs font-bold placeholder:font-medium focus:ring-4 focus:ring-primary/5 focus:border-primary/30 outline-none transition-all"
            />
        </div>

        <div className="col-span-2 space-y-2">
            <label className="text-[10px] font-black text-secondary dark:text-gray-400 ml-1">Documents Manifest</label>
            <div className="flex gap-2">
                <input
                    type="text"
                    placeholder="Add item..."
                    value={newItemText}
                    onChange={(e) => setNewItemText(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addItem())}
                    className="flex-1 px-3.5 py-2.5 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium/70 dark:border-gray-700 rounded-xl text-xs font-bold placeholder:font-medium focus:ring-4 focus:ring-primary/5 focus:border-primary/30 outline-none transition-all"
                />
                <button
                    type="button"
                    onClick={addItem}
                    className="p-2.5 bg-primary text-white rounded-xl hover:bg-primary-dark transition-all"
                >
                    <Plus size={16} />
                </button>
            </div>

            <div className="flex flex-col gap-2 mt-3 max-h-[112px] overflow-y-auto custom-scrollbar pr-2">
                {data.items.map((item: string, idx: number) => (
                    <div key={idx} className="flex items-start gap-3 p-3 bg-neutral-light/30 dark:bg-gray-800/30 border border-neutral-medium/50 dark:border-gray-700/50 rounded-xl animate-in fade-in slide-in-from-left-2 duration-200">
                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-black text-primary shrink-0 shadow-sm mt-0.5">
                            {idx + 1}
                        </span>
                        <input
                            type="text"
                            value={item}
                            onChange={(e) => {
                                const nextItems = [...data.items];
                                nextItems[idx] = e.target.value;
                                setData({ ...data, items: nextItems });
                            }}
                            className="flex-1 px-2 py-1 bg-transparent border-none text-xs font-bold text-neutral-dark dark:text-white leading-relaxed outline-none focus:bg-white/70 dark:focus:bg-gray-900/70 focus:ring-2 focus:ring-primary/10 rounded-lg transition-all"
                            placeholder="Document item..."
                        />
                        <button type="button" onClick={() => removeItem(idx)} className="text-secondary/60 hover:text-rose-500 transition-colors p-1.5 rounded-lg hover:bg-rose-500/10 shrink-0">
                            <Trash2 size={14} />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    </div>
);

const StaffMultiSelect = ({ staff, selectedIds, toggleSelection }: any) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);

    const filteredStaff = useMemo(() => {
        const sortedStaff = sortUsersByName(staff.filter((s: any) => s.status === 'Active'));
        if (!search) return sortedStaff;
        return sortedStaff.filter((s: any) =>
            `${s.firstName} ${s.lastName}`.toLowerCase().includes(search.toLowerCase())
        );
    }, [staff, search]);

    const selectedStaff = useMemo(() => {
        return sortUsersByName((selectedIds || []).map((id: string) => staff.find((s: any) => normalizeId(s.id) === normalizeId(id))).filter(Boolean));
    }, [selectedIds, staff]);

    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="space-y-3 relative z-10" ref={dropdownRef}>
            {/* The Dropdown selector */}
            <div className="relative">
                <div
                    onClick={() => setIsOpen(!isOpen)}
                    className="w-full px-4 py-2 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium dark:border-gray-700 rounded-xl text-xs font-bold focus:ring-4 focus:ring-primary/5 outline-none transition-all cursor-pointer flex items-center justify-between"
                >
                    <span className="text-secondary/50 font-medium">Add attendees...</span>
                    <ChevronDown size={14} className={`text-secondary transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                </div>

                {isOpen && (
                    <div className="absolute bottom-full left-0 right-0 mb-2 bg-white dark:bg-gray-800 border border-neutral-medium dark:border-gray-700 rounded-xl shadow-xl z-[50] overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
                        <div className="p-2 border-b border-neutral-medium dark:border-gray-700">
                            <div className="relative">
                                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-secondary/50" />
                                <input
                                    type="text"
                                    placeholder="Search staff..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-full pl-8 pr-3 py-1.5 bg-neutral-light dark:bg-gray-900 border-none rounded-lg text-xs font-medium outline-none focus:ring-2 focus:ring-primary/20"
                                    autoFocus
                                />
                            </div>
                        </div>
                        <div className="max-h-[200px] overflow-y-auto custom-scrollbar p-1">
                            {filteredStaff.length === 0 ? (
                                <div className="px-3 py-4 text-center text-xs text-secondary/50">No staff found</div>
                            ) : (
                                filteredStaff.map((u: any) => {
                                    const isSelected = selectedIds?.includes(u.id);
                                    return (
                                        <div
                                            key={u.id}
                                            onClick={() => toggleSelection(u.id)}
                                            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-between ${isSelected ? 'bg-primary/10 text-primary' : 'text-neutral-dark dark:text-white hover:bg-neutral-light dark:hover:bg-gray-700'}`}
                                        >
                                            <span>{u.firstName} {u.lastName}</span>
                                            {isSelected && <Check size={12} className="text-primary" />}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Selected List */}
            {selectedStaff.length > 0 && (
                <div className="flex flex-col gap-1.5 max-h-[120px] overflow-y-auto custom-scrollbar pr-1 mt-2">
                    {selectedStaff.map((u: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-2.5 p-2 bg-neutral-light/30 dark:bg-gray-800/30 border border-neutral-medium/50 dark:border-gray-700/50 rounded-lg animate-in fade-in slide-in-from-left-2 duration-200">
                            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 border border-primary/20 text-[9px] font-black text-primary shrink-0 shadow-sm">
                                {idx + 1}
                            </span>
                            <span className="flex-1 text-[11px] font-bold text-neutral-dark dark:text-white capitalize leading-none">{u.firstName} {u.lastName}</span>
                            <button type="button" onClick={() => toggleSelection(u.id)} className="text-secondary/60 hover:text-rose-500 transition-colors p-1 rounded-md hover:bg-rose-500/10 shrink-0">
                                <Trash2 size={12} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const MeetingFormFields = ({ data, setData, staff, toggleStaffSelection, selectedFile, onFileSelect, isUploading }: any) => (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <div className="space-y-1 col-span-2">
            <label className="text-[10px] font-black text-secondary dark:text-gray-400 ml-1">Meeting Subject / Topic</label>
            <input
                required
                type="text"
                placeholder="e.g. Monthly Review"
                value={data.subject}
                onChange={(e) => setData({ ...data, subject: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium/70 dark:border-gray-700 rounded-xl text-xs font-bold placeholder:font-medium focus:ring-4 focus:ring-primary/5 focus:border-primary/30 outline-none transition-all"
            />
        </div>

        <div className="space-y-1 col-span-2">
            <label className="text-[10px] font-black text-secondary dark:text-gray-400 ml-1">Meeting Date</label>
            <input
                type="date"
                required
                value={data.date}
                onChange={(e) => setData({ ...data, date: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium/70 dark:border-gray-700 rounded-xl text-xs font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary/30 outline-none transition-all"
            />
        </div>

        <div className="col-span-2 space-y-1 relative z-20">
            <label className="text-[10px] font-black text-secondary dark:text-gray-400 ml-1">Attendees</label>
            <StaffMultiSelect
                staff={staff}
                selectedIds={data.userIDs}
                toggleSelection={toggleStaffSelection}
            />
        </div>

        <div className="col-span-2">
            <FileUploadField
                label="Minutes of Meeting"
                file={selectedFile}
                url={data.momUrl}
                onFileSelect={onFileSelect}
                isUploading={isUploading}
            />
        </div>
    </div>
);

// --- Helper Components ---

const FileUploadField = ({ file, url, label, onFileSelect, isUploading }: { file: File | null, url: string, label: string, onFileSelect: (file: File | null) => void, isUploading: boolean }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    return (
        <div className="space-y-1.5">
            <label className="text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest ml-2 opacity-60">{label}</label>
            <div className="relative group/field px-1">
                {file ? (
                    <div className="flex items-center gap-3 p-2 bg-primary/5 dark:bg-primary/10 border border-primary/20 rounded-xl group animate-in slide-in-from-bottom-2 duration-300">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary border border-primary/10">
                            <FileText size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-black text-primary uppercase tracking-tight truncate">{file.name}</p>
                            <p className="text-[8px] text-secondary font-bold opacity-60">Ready to sync</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => onFileSelect(null)}
                            disabled={isUploading}
                            className="p-1.5 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                ) : url ? (
                    <div className="flex items-center gap-3 p-2 bg-emerald-500/5 border border-emerald-500/20 rounded-xl group animate-in slide-in-from-bottom-2 duration-300">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600 border border-emerald-500/10">
                            <CheckCircle2 size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-tight truncate">Sync Active</p>
                            <a href={getDriveUrl(url)} target="_blank" rel="noopener noreferrer" className="text-[8px] text-emerald-600/60 hover:text-emerald-600 font-bold flex items-center gap-1 transition-colors mt-0.5">
                                View <ExternalLink size={8} />
                            </a>
                        </div>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="w-full flex flex-col items-center justify-center gap-1 py-3 border border-dashed border-neutral-medium dark:border-gray-700 rounded-[1.25rem] hover:border-primary/40 hover:bg-primary/5 transition-all duration-300 group/btn bg-white/20 dark:bg-gray-800/20"
                    >
                        <Upload size={16} className="text-secondary group-hover/btn:text-primary transition-all group-hover/btn:scale-110" />
                        <div className="text-center">
                            <p className="text-[10px] font-black text-neutral-dark dark:text-white tracking-tight uppercase">Attach Document</p>
                        </div>
                    </button>
                )}
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => e.target.files?.[0] && onFileSelect(e.target.files[0])}
                    className="hidden"
                />
            </div>
        </div>
    );
};

// --- Transmittal Components ---
const TransmittalSection = ({
    showForm, setShowForm, data, setData, newItemText, setNewItemText, addItem, removeItem, onSubmit, isSubmitting, clients, staff, history, searchQuery, isUploadingMain, formatDateForUI,
    selectedItem, setSelectedItem, openDeleteModal,
    isEditing, setIsEditing, startEditing, canDeleteTransmittalItem
}: any) => {
    const context = useContext(AppContext);
    const [isUploadingLocal, setIsUploadingLocal] = useState(false);
    const [selectedFileInDrawer, setSelectedFileInDrawer] = useState<File | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [manifestPage, setManifestPage] = useState(1);
    const [transmittalAuditLogs, setTransmittalAuditLogs] = useState<any[]>([]);
    const [isTransmittalAuditLoading, setIsTransmittalAuditLoading] = useState(false);
    const [transmittalAuditPage, setTransmittalAuditPage] = useState(1);
    const [transmittalAuditTotalPages, setTransmittalAuditTotalPages] = useState(1);
    const [expandedTransmittalAuditLogId, setExpandedTransmittalAuditLogId] = useState<string | null>(null);
    const itemsPerPage = 25;
    const manifestItemsPerPage = 10;
    const clientById = useMemo(() => new Map(clients.map((c: any) => [normalizeId(c.id), c])), [clients]);
    const staffById = useMemo(() => new Map(staff.map((u: any) => [normalizeId(u.id), u])), [staff]);
    const filteredHistory = useMemo(() => {
        let personalHistory = history;
        const isManagerOrAbove = context?.user?.role === 'Admin' || context?.user?.role === 'Manager' || context?.user?.role === 'Supervisor';
        if (!isManagerOrAbove) {
            personalHistory = history.filter((t: any) => normalizeId(t.userID) === normalizeId(context?.user?.id));
        }
        const query = searchQuery.toLowerCase();
        return personalHistory.filter((t: any) => {
            const clientName = getTransmittalClientName(t.clientID, clientById);
            return (clientName.toLowerCase().includes(query) ||
                   t.items?.toLowerCase().includes(query) ||
                   formatDateForUI(t.date).toLowerCase().includes(query));
        }).sort((a: any, b: any) => getRefSortValue(b.transmittalID) - getRefSortValue(a.transmittalID));
    }, [history, clientById, searchQuery, formatDateForUI, context?.user]);
    const totalPages = Math.ceil(filteredHistory.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedHistory = filteredHistory.slice(startIndex, startIndex + itemsPerPage);
    const manifestItems = useMemo(() => selectedItem?.items ? selectedItem.items.split('||').filter(Boolean) : [], [selectedItem?.items]);
    const manifestTotalPages = Math.max(Math.ceil(manifestItems.length / manifestItemsPerPage), 1);
    const manifestStartIndex = (manifestPage - 1) * manifestItemsPerPage;
    const paginatedManifestItems = manifestItems.slice(manifestStartIndex, manifestStartIndex + manifestItemsPerPage);

    useEffect(() => {
        setCurrentPage(1);
    }, [filteredHistory.length, searchQuery]);

    useEffect(() => {
        setManifestPage(1);
    }, [selectedItem?.transmittalID, selectedItem?.items]);

    useEffect(() => {
        setManifestPage(page => Math.min(page, manifestTotalPages));
    }, [manifestTotalPages]);

    const loadTransmittalAuditLogs = async (item = selectedItem, page = 1) => {
        if (!item?.transmittalID) {
            setTransmittalAuditLogs([]);
            setTransmittalAuditPage(1);
            setTransmittalAuditTotalPages(1);
            return;
        }

        setIsTransmittalAuditLoading(true);
        try {
            const result = await fetchAuditLogs({
                entityType: 'transmittal',
                entityId: item.transmittalID,
                limit: 5,
                page
            });
            setTransmittalAuditLogs(result.logs || []);
            setTransmittalAuditPage(result.page || page);
            setTransmittalAuditTotalPages(result.totalPages || 1);
        } catch (error) {
            setTransmittalAuditLogs([]);
            setTransmittalAuditPage(1);
            setTransmittalAuditTotalPages(1);
        } finally {
            setIsTransmittalAuditLoading(false);
        }
    };

    useEffect(() => {
        if (selectedItem?.transmittalID) {
            loadTransmittalAuditLogs(selectedItem, 1);
        } else {
            setTransmittalAuditLogs([]);
            setTransmittalAuditPage(1);
            setTransmittalAuditTotalPages(1);
        }
        setExpandedTransmittalAuditLogId(null);
    }, [selectedItem]);

    const formatTransmittalAuditValue = (key: string, value: any) => {
        const text = String(value ?? '').trim();
        if (!text) return 'Blank';
        if (key === 'clientID') {
            const client = clientById.get(normalizeId(text)) as any;
            return client?.name || text;
        }
        if (key === 'userID') {
            const user = staffById.get(normalizeId(text)) as any;
            return user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : text;
        }
        if (key === 'receiptUrl') return text ? 'Attached slip' : 'No slip';
        return text;
    };

    const printRef = useRef<HTMLDivElement>(null);

    const handlePrint = useReactToPrint({
        contentRef: printRef,
        documentTitle: selectedItem ? `Transmittal_${selectedItem.transmittalID}` : 'Transmittal_Slip'
    });

    return (
        <div className="space-y-6">
            {showForm && createPortal(
                <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-neutral-dark/40 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white/95 dark:bg-gray-800/95 backdrop-blur-md rounded-3xl shadow-2xl border border-white dark:border-gray-700 w-full max-w-xl max-h-[92vh] overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-medium/70 dark:border-gray-700 bg-neutral-light/30 dark:bg-gray-900/30 shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-primary/10 rounded-2xl flex items-center justify-center text-primary border border-primary/20">
                                    <FileText size={19} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-black text-neutral-dark dark:text-white tracking-tight leading-tight">Log Transmittal</h2>
                                    <p className="text-[10px] font-bold text-secondary dark:text-gray-400 mt-1">Record released documents and receiver details.</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowForm(false)}
                                disabled={isSubmitting}
                                className="p-2 hover:bg-neutral-medium/50 dark:hover:bg-gray-700 rounded-xl transition-all text-secondary disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={onSubmit} className="px-5 pt-3 pb-5 space-y-4">
                            <TransmittalFormFields
                                data={data}
                                setData={setData}
                                clients={clients}
                                users={staff}
                                newItemText={newItemText}
                                setNewItemText={setNewItemText}
                                addItem={addItem}
                                removeItem={removeItem}
                                context={context}
                            />
                            <div className="mt-5 pt-4 border-t border-neutral-medium/70 dark:border-gray-700">
                                <button
                                    type="submit"
                                    disabled={isSubmitting || !data.clientID || data.items.length === 0}
                                    className="w-full py-3 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary-dark shadow-xl shadow-primary/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                                    Finalize Transmittal
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* Transmittal History Table */}
            {filteredHistory.length === 0 ? (
                <div className="p-16 text-center bg-white dark:bg-gray-800 rounded-2xl border border-dashed border-neutral-medium dark:border-gray-700 animate-in fade-in zoom-in-95 slide-in-from-top-4 duration-700">
                    <div className="relative w-20 h-20 mx-auto mb-6">
                        <FileText className="absolute inset-0 m-auto text-primary/10" size={64} />
                        <Search className="absolute bottom-0 right-0 text-primary/30" size={24} />
                    </div>
                    <h3 className="text-xl font-black text-neutral-dark dark:text-white tracking-tight">No transmittals found</h3>
                    <p className="text-sm text-secondary/60 font-medium">
                        {searchQuery ? 'No records match your search query.' : 'There are no transmittals recorded in the system yet.'}
                    </p>
                </div>
            ) : (
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-neutral-light dark:bg-gray-700/30 border-b border-neutral-medium dark:border-gray-700">
                                <tr>
                                    <th className="px-5 py-3 text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest">Ref ID</th>
                                    <th className="px-5 py-3 text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest">Client Entity</th>
                                    <th className="px-5 py-3 text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest">Items</th>
                                    <th className="px-5 py-3 text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest">Staff</th>
                                    <th className="px-5 py-3 text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest">Date</th>
                                    <th className="px-5 py-3 text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest">Status</th>
                                    <th className="px-5 py-3 text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-medium/30 dark:divide-gray-700/50">
                {paginatedHistory.map((t: any) => {
                                    const clientName = getTransmittalClientName(t.clientID, clientById);
                                    const staffMember = staffById.get(normalizeId(t.userID)) as any;
                                    const itemsCount = t.items?.split('||').length || 0;

                                    return (
                                        <tr
                                            key={t.transmittalID}
                                            onClick={() => setSelectedItem(t)}
                                            className="group cursor-pointer transition-all duration-300 hover:bg-primary/[0.02] dark:hover:bg-primary/[0.05] relative hover:z-[10] border-b border-neutral-medium/30 dark:border-gray-800/50"
                                        >
                                            <td className="px-5 py-2.5 font-mono text-[11px] font-black text-primary">#{t.transmittalID}</td>
                                            <td className="px-5 py-2.5">
                                                <span className="text-[13px] font-black text-neutral-dark dark:text-white truncate block max-w-[200px] group-hover:text-primary transition-colors">{clientName}</span>
                                            </td>
                                            <td className="px-5 py-2.5">
                                                <span className="text-[11px] font-bold text-secondary dark:text-gray-300">{itemsCount} items</span>
                                            </td>
                                            <td className="px-5 py-2.5">
                                                <UserHoverCard user={staffMember} fallbackName="Unknown Staff" size="md" showName />
                                            </td>
                                            <td className="px-5 py-2.5 text-[11px] font-black text-secondary/80 dark:text-gray-400">{formatDateForUI(t.date)}</td>
                                            <td className="px-5 py-2.5">
                                                {t.receiptUrl ? (
                                                    <div className="flex items-center gap-1.5 text-[9px] font-black text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 uppercase w-fit">
                                                        <div className="w-1 h-1 rounded-full bg-emerald-500" />
                                                        Delivered
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-1.5 text-[9px] font-black text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 uppercase w-fit">
                                                        <div className="w-1 h-1 rounded-full bg-amber-500 animate-pulse" />
                                                        Released
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-5 py-2.5">
                                                <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                                                    {t.receiptUrl ? (
                                                        <a href={getDriveUrl(t.receiptUrl)} target="_blank" rel="noopener noreferrer" className="p-1.5 text-primary hover:bg-primary/10 rounded-lg transition-all"><ExternalLink size={14} /></a>
                                                    ) : (
                                                        <div className="p-1.5 text-secondary dark:text-gray-500 opacity-20 dark:opacity-40"><ExternalLink size={14} /></div>
                                                    )}
                                                    {canDeleteTransmittalItem(t) && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                openDeleteModal(
                                                                    "Delete Transmittal?",
                                                                    "Are you sure you want to delete this transmittal? This action cannot be undone.",
                                                                    async () => {
                                                                        if (t.receiptUrl && !t.receiptUrl.startsWith('http')) {
                                                                            await deleteFile(t.receiptUrl);
                                                                        }
                                                                        await deleteTransmittal(t.transmittalID);
                                                                        context?.refreshData();
                                                                        context?.showToast?.('Transmittal deleted successfully', 'success');
                                                                    }
                                                                );
                                                            }}
                                                            className="p-1.5 text-secondary dark:text-gray-400 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    )}

                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <TablePagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        startIndex={startIndex}
                        itemsPerPage={itemsPerPage}
                        totalItems={filteredHistory.length}
                        setCurrentPage={setCurrentPage}
                    />
                </div>
            )}

            {/* Transmittal Detail Drawer */}
            {selectedItem && createPortal(
                <div className="fixed inset-0 z-[10000] flex justify-end animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-neutral-dark/40 backdrop-blur-[2px] transition-opacity" onClick={() => !isUploadingLocal && !isSubmitting && setSelectedItem(null)} />
                    <div className="relative w-full max-w-2xl bg-white dark:bg-gray-900 h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
                        {/* Drawer Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-medium dark:border-gray-800 bg-neutral-light/30 dark:bg-gray-800/30 backdrop-blur-md sticky top-0 z-10">
                            <div className="flex items-center gap-5">
                                <div className="w-10 h-10 bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl flex items-center justify-center text-primary border border-primary/10 shadow-sm">
                                    <FileText size={20} />
                                </div>
                                <div>
                                    <div className="flex items-center gap-3 mb-1">
                                        <h2 className="text-xl font-black text-neutral-dark dark:text-white tracking-tight leading-tight">
                                            {getTransmittalClientName(selectedItem.clientID, clientById)}
                                        </h2>
                                        {selectedItem.receiptUrl ? (
                                            <div className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-[0.15em] border flex items-center gap-1.5 shadow-sm bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                Delivered
                                            </div>
                                        ) : (
                                            <div className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-[0.15em] border flex items-center gap-1.5 shadow-sm bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20">
                                                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                                Released
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-[9px] font-black uppercase tracking-widest text-primary bg-primary/5 px-2 py-0.5 rounded border border-primary/10">
                                            Ref ID: #{selectedItem.transmittalID}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {!isEditing && (
                                    <>
                                        <button
                                            onClick={() => handlePrint()}
                                            disabled={isUploadingLocal || isSubmitting}
                                            className="p-2.5 text-secondary hover:bg-primary/10 hover:text-primary rounded-2xl transition-all duration-300 hover:scale-105 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:bg-transparent"
                                            title="Print / Export PDF"
                                        >
                                            <Printer size={20} />
                                        </button>
                                        <button
                                            onClick={() => startEditing(selectedItem)}
                                            disabled={isUploadingLocal || isSubmitting}
                                            className="p-2.5 text-secondary hover:bg-primary/10 hover:text-primary rounded-2xl transition-all duration-300 hover:scale-105 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:bg-transparent"
                                            title="Edit Transmittal"
                                        >
                                            <Pencil size={20} />
                                        </button>
                                    </>
                                )}
                                <button
                                    onClick={() => setSelectedItem(null)}
                                    disabled={isUploadingLocal || isSubmitting}
                                    className="p-2.5 text-secondary hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400 rounded-2xl transition-all duration-300 hover:scale-105 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:bg-transparent"
                                >
                                    <X size={24} />
                                </button>
                            </div>
                        </div>

                        {/* Hidden Print Template */}
                        <div style={{ position: 'absolute', top: '-9999px', left: '-9999px', overflow: 'hidden' }}>
                            <TransmittalPrintTemplate
                                ref={printRef}
                                transmittal={selectedItem}
                                client={getTransmittalClientForPrint(selectedItem?.clientID, clientById)}
                                staffMember={staffById.get(normalizeId(selectedItem?.userID))}
                                logoUrl="/logo.png"
                            />
                        </div>

                        {/* Drawer Content */}
                        <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-gradient-to-br from-neutral-light/50 via-white to-primary/5 dark:from-gray-900 dark:via-gray-900 dark:to-primary/10 custom-scrollbar">
                            {isEditing ? (
                                <form onSubmit={onSubmit} className="space-y-5 animate-in slide-in-from-bottom-4 duration-300">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex items-start gap-3">
                                            <div className="w-1 h-4 bg-primary rounded-full mt-0.5" />
                                            <div>
                                                <h3 className="text-sm font-black text-neutral-dark dark:text-white">Update Transmittal Details</h3>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-white/85 dark:bg-gray-800/70 backdrop-blur-md rounded-2xl border border-neutral-medium/60 dark:border-gray-700 shadow-sm p-5">
                                        <TransmittalFormFields
                                            data={data}
                                            setData={setData}
                                            clients={clients}
                                            users={staff}
                                            newItemText={newItemText}
                                            setNewItemText={setNewItemText}
                                            addItem={addItem}
                                            removeItem={removeItem}
                                            context={context}
                                        />
                                    </div>

                                    <div className="sticky bottom-0 -mx-8 -mb-8 px-8 py-4 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-t border-neutral-medium/70 dark:border-gray-700 flex gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setIsEditing(false)}
                                            className="flex-1 py-3 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest text-secondary hover:bg-neutral-light dark:hover:bg-gray-800 transition-all border border-neutral-medium dark:border-gray-700"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={isSubmitting || !data.clientID || data.items.length === 0}
                                            className="flex-[2] py-3 px-4 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary-dark shadow-xl shadow-primary/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                        >
                                            {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                                            Save Changes
                                        </button>
                                    </div>
                                </form>
                            ) : (
                                <>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="w-1 h-4 bg-primary rounded-full" />
                                        <h3 className="text-sm font-black text-neutral-dark dark:text-white">Transmittal Details</h3>
                                    </div>
                                    <span className="text-[10px] font-black text-primary bg-primary/5 border border-primary/10 px-2.5 py-1 rounded-full">
                                        {selectedItem.items?.split('||').length || 0} item{(selectedItem.items?.split('||').length || 0) === 1 ? '' : 's'}
                                    </span>
                                </div>

                                <div className="bg-white/85 dark:bg-gray-800/70 backdrop-blur-md rounded-2xl border border-neutral-medium/60 dark:border-gray-700 shadow-sm p-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
                                        <div className="p-4">
                                            <p className="text-[10px] font-black text-secondary dark:text-gray-400 mb-1">Date Logged</p>
                                            <p className="text-sm font-black text-neutral-dark dark:text-white">{formatDateForUI(selectedItem.date)}</p>
                                        </div>
                                        <div className="p-4">
                                            <p className="text-[10px] font-black text-secondary dark:text-gray-400 mb-1">Representative</p>
                                            <div className="flex items-center gap-2">
                                                {(() => {
                                                    const staffMember = staffById.get(normalizeId(selectedItem.userID)) as any;
                                                    return <UserHoverCard user={staffMember} fallbackName="---" size="lg" showName nameClassName="text-sm font-black text-neutral-dark dark:text-white truncate" />;
                                                })()}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
                                        <div className="p-4">
                                            <p className="text-[10px] font-black text-secondary dark:text-gray-400 mb-1">Receiver Name</p>
                                            <p className="text-sm font-black text-neutral-dark dark:text-white">
                                                {selectedItem.receiverName || <span className="font-bold text-secondary/60 italic">Default client name</span>}
                                            </p>
                                        </div>
                                        <div className="p-4">
                                            <p className="text-[10px] font-black text-secondary dark:text-gray-400 mb-1">Receiver Address</p>
                                            <p className="text-sm font-black text-neutral-dark dark:text-white leading-snug">
                                                {selectedItem.receiverAddress || <span className="font-bold text-secondary/60 italic">Default client address</span>}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center gap-2">
                                    <div className="w-1 h-4 bg-primary rounded-full" />
                                    <h3 className="text-sm font-black text-neutral-dark dark:text-white">Official Slip</h3>
                                </div>
                                <div className="bg-white/85 dark:bg-gray-800/70 backdrop-blur-md rounded-2xl border border-neutral-medium/60 dark:border-gray-700 shadow-sm p-4">
                                    {selectedItem.receiptUrl ? (
                                        <div className="flex items-center justify-between gap-4">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 border border-emerald-500/20 shrink-0">
                                                    <CheckCircle2 size={18} />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-black text-neutral-dark dark:text-white">Slip attached</p>
                                                    <a href={getDriveUrl(selectedItem.receiptUrl)} target="_blank" rel="noopener noreferrer" className="text-[11px] font-bold text-primary hover:text-primary-dark transition-colors inline-flex items-center gap-1">
                                                        View uploaded file <ExternalLink size={11} />
                                                    </a>
                                                </div>
                                            </div>
                                            {canDeleteTransmittalItem(selectedItem) && (
                                                <button
                                                    onClick={() => {
                                                        openDeleteModal(
                                                            "Delete Attachment?",
                                                            "Are you sure you want to remove this transmittal slip? This will permanently delete the file from Drive.",
                                                            async () => {
                                                                try {
                                                                    const fileId = selectedItem.receiptUrl;
                                                                    // Only try to delete from drive if it's an ID (not legacy URL)
                                                                    if (fileId && !fileId.startsWith('http')) {
                                                                        await deleteFile(fileId);
                                                                    }
                                                                    await updateTransmittal(selectedItem.transmittalID, { ...selectedItem, receiptUrl: '' });
                                                                    setSelectedItem({ ...selectedItem, receiptUrl: '' });
                                                                    context?.showToast?.('Attachment removed successfully', 'success');
                                                                    context?.refreshData();
                                                                } catch (e) {
                                                                    context?.showToast?.('Failed to delete attachment', 'error');
                                                                    throw e;
                                                                }
                                                            }
                                                        );
                                                    }}
                                                    className="p-2 text-secondary/60 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all shrink-0"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            <div className="flex items-start gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600 border border-amber-500/20 shrink-0">
                                                    <Upload size={18} />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-black text-neutral-dark dark:text-white">No slip attached yet</p>
                                                    <p className="text-[11px] font-medium text-secondary dark:text-gray-400 mt-0.5">Upload the signed or received transmittal slip when available.</p>
                                                </div>
                                            </div>
                                            <FileUploadField
                                                label="Select Transmittal Slip"
                                                file={selectedFileInDrawer}
                                                url=""
                                                onFileSelect={setSelectedFileInDrawer}
                                                isUploading={isUploadingLocal}
                                            />
                                            {selectedFileInDrawer && (
                                                <button
                                                    onClick={async () => {
                                                        setIsUploadingLocal(true);
                                                        try {
                                                            const uploadRes = await uploadFile(selectedFileInDrawer, 'Transmittal');
                                                            await updateTransmittal(selectedItem.transmittalID, { ...selectedItem, receiptUrl: uploadRes.id });
                                                            setSelectedItem({ ...selectedItem, receiptUrl: uploadRes.id });
                                                            setSelectedFileInDrawer(null);
                                                            context?.showToast?.('Slip synchronized successfully!', 'success');
                                                            context?.refreshData();
                                                        } catch (e) {
                                                            context?.showToast?.('Upload failed. Please try again.', 'error');
                                                        } finally {
                                                            setIsUploadingLocal(false);
                                                        }
                                                    }}
                                                    disabled={isUploadingLocal}
                                                    className="w-full py-2.5 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary-dark shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2"
                                                >
                                                    {isUploadingLocal ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                                                    Sync Official Slip
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center gap-2">
                                    <div className="w-1 h-4 bg-primary rounded-full" />
                                    <h3 className="text-sm font-black text-neutral-dark dark:text-white">Documents Manifest</h3>
                                </div>
                                <div className="bg-white/85 dark:bg-gray-800/70 backdrop-blur-md rounded-2xl border border-neutral-medium/60 dark:border-gray-700 shadow-sm overflow-hidden">
                                    <div className="divide-y divide-neutral-medium/30 dark:divide-gray-700/50">
                                        {paginatedManifestItems.map((item: string, idx: number) => (
                                            <div key={`${manifestStartIndex + idx}-${item}`} className="px-5 py-3.5 flex items-start gap-3 hover:bg-primary/[0.02] transition-colors">
                                                <span className="mt-0.5 flex items-center justify-center w-7 h-7 rounded-xl bg-primary/10 border border-primary/15 text-[10px] font-black text-primary shrink-0">
                                                    {String(manifestStartIndex + idx + 1).padStart(2, '0')}
                                                </span>
                                                <p className="text-[13px] font-bold text-neutral-dark dark:text-white leading-relaxed">
                                                    {item.toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase())}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                    {manifestTotalPages > 1 && (
                                        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-neutral-medium/40 dark:border-gray-700/60 bg-neutral-light/30 dark:bg-gray-900/30">
                                            <button
                                                onClick={() => setManifestPage(page => Math.max(page - 1, 1))}
                                                disabled={manifestPage <= 1}
                                                className="px-3 py-1.5 rounded-lg border border-neutral-medium dark:border-gray-700 text-[10px] font-black text-secondary hover:text-primary hover:border-primary disabled:opacity-40 disabled:cursor-not-allowed"
                                            >
                                                Previous
                                            </button>
                                            <span className="text-[10px] font-black text-secondary dark:text-gray-400">Page {manifestPage} of {manifestTotalPages}</span>
                                            <button
                                                onClick={() => setManifestPage(page => Math.min(page + 1, manifestTotalPages))}
                                                disabled={manifestPage >= manifestTotalPages}
                                                className="px-3 py-1.5 rounded-lg border border-neutral-medium dark:border-gray-700 text-[10px] font-black text-secondary hover:text-primary hover:border-primary disabled:opacity-40 disabled:cursor-not-allowed"
                                            >
                                                Next
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center gap-2">
                                    <div className="w-1 h-4 bg-primary rounded-full" />
                                    <h3 className="text-sm font-black text-neutral-dark dark:text-white">Audit Logs</h3>
                                </div>
                                <div className="bg-white/85 dark:bg-gray-800/70 backdrop-blur-md rounded-2xl border border-neutral-medium/60 dark:border-gray-700 shadow-sm overflow-hidden">
                                    <div className={`${transmittalAuditLogs.length > 0 || isTransmittalAuditLoading ? 'min-h-[255px]' : ''} transition-opacity duration-200 ${isTransmittalAuditLoading && transmittalAuditLogs.length > 0 ? 'opacity-70' : 'opacity-100'}`}>
                                        {transmittalAuditLogs.length > 0 ? (
                                            transmittalAuditLogs.map((log) => {
                                                const detailRows = getOperationAuditDetailRows(log.details);
                                                const isExpanded = expandedTransmittalAuditLogId === log.id;
                                                const hasDetails = detailRows.length > 0;
                                                return (
                                                    <div key={log.id} className="border-b border-neutral-medium/40 dark:border-gray-700/60 last:border-0 hover:bg-neutral-light/50 dark:hover:bg-gray-800 transition-colors">
                                                        <button
                                                            type="button"
                                                            onClick={() => hasDetails && setExpandedTransmittalAuditLogId(isExpanded ? null : log.id)}
                                                            className="w-full px-5 py-3 text-left"
                                                        >
                                                            <div className="flex items-start justify-between gap-4">
                                                                <div className="min-w-0">
                                                                    <div className="flex items-center gap-2">
                                                                        <p className="text-xs font-black text-neutral-dark dark:text-white">{log.actionLabel || log.action}</p>
                                                                        {hasDetails && (
                                                                            <ChevronDown size={13} className={`text-secondary/50 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                                                        )}
                                                                    </div>
                                                                    <p className="mt-1 text-[11px] font-bold text-secondary dark:text-gray-400">
                                                                        {log.userName || 'System'}{log.userRole ? ` - ${log.userRole}` : ''}
                                                                    </p>
                                                                </div>
                                                                <p className="shrink-0 text-[10px] font-bold text-secondary/70 dark:text-gray-400">{formatAuditTimestamp(log.createdAt)}</p>
                                                            </div>
                                                            {log.summary && (
                                                                <p className="mt-2 text-[11px] font-medium text-secondary dark:text-gray-400">{log.summary}</p>
                                                            )}
                                                        </button>
                                                        {isExpanded && hasDetails && (
                                                            <div className="mx-5 mb-3 rounded-xl border border-neutral-medium/50 dark:border-gray-700/70 bg-neutral-light/40 dark:bg-gray-900/40 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
                                                                <div className="grid grid-cols-[1fr_1fr_1fr] border-b border-neutral-medium/40 dark:border-gray-700/60 bg-white/50 dark:bg-gray-800/50">
                                                                    <div className="px-3 py-2 text-[9px] font-black text-secondary/70 uppercase tracking-widest">Field</div>
                                                                    <div className="px-3 py-2 text-[9px] font-black text-secondary/70 uppercase tracking-widest">Before</div>
                                                                    <div className="px-3 py-2 text-[9px] font-black text-secondary/70 uppercase tracking-widest">After</div>
                                                                </div>
                                                                {detailRows.map((row) => (
                                                                    <div key={row.key} className="grid grid-cols-[1fr_1fr_1fr] items-start border-b border-neutral-medium/30 dark:border-gray-700/50 last:border-0">
                                                                        <div className="px-3 py-2 text-[10px] font-black text-neutral-dark dark:text-white">{row.label}</div>
                                                                        <div className="px-3 py-2 text-[10px] font-semibold text-secondary dark:text-gray-400">
                                                                            <div className="max-h-24 overflow-y-auto break-words pr-1 custom-scrollbar">{formatTransmittalAuditValue(row.key, row.before)}</div>
                                                                        </div>
                                                                        <div className="px-3 py-2 text-[10px] font-semibold text-secondary dark:text-gray-400">
                                                                            <div className="max-h-24 overflow-y-auto break-words pr-1 custom-scrollbar">{formatTransmittalAuditValue(row.key, row.after)}</div>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })
                                        ) : isTransmittalAuditLoading ? (
                                            <div className="h-[255px] flex flex-col items-center justify-center gap-2 text-xs font-bold text-secondary/60">
                                                <Loader2 size={16} className="animate-spin text-primary/70" />
                                                Loading audit logs...
                                            </div>
                                        ) : (
                                            <div className="m-4 py-8 text-center border border-dashed border-neutral-medium dark:border-gray-700 rounded-[2rem] bg-white/40 dark:bg-gray-900/40">
                                                <p className="text-[9px] text-secondary font-black uppercase tracking-widest opacity-30">No audit logs recorded</p>
                                            </div>
                                        )}
                                    </div>
                                    {transmittalAuditTotalPages > 1 && (
                                        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-neutral-medium/40 dark:border-gray-700/60 bg-neutral-light/30 dark:bg-gray-900/30">
                                            <button
                                                onClick={() => loadTransmittalAuditLogs(selectedItem, Math.max(transmittalAuditPage - 1, 1))}
                                                disabled={isTransmittalAuditLoading || transmittalAuditPage <= 1}
                                                className="px-3 py-1.5 rounded-lg border border-neutral-medium dark:border-gray-700 text-[10px] font-black text-secondary hover:text-primary hover:border-primary disabled:opacity-40 disabled:cursor-not-allowed"
                                            >
                                                Previous
                                            </button>
                                            <span className="text-[10px] font-black text-secondary dark:text-gray-400">Page {transmittalAuditPage} of {transmittalAuditTotalPages}</span>
                                            <button
                                                onClick={() => loadTransmittalAuditLogs(selectedItem, Math.min(transmittalAuditPage + 1, transmittalAuditTotalPages))}
                                                disabled={isTransmittalAuditLoading || transmittalAuditPage >= transmittalAuditTotalPages}
                                                className="px-3 py-1.5 rounded-lg border border-neutral-medium dark:border-gray-700 text-[10px] font-black text-secondary hover:text-primary hover:border-primary disabled:opacity-40 disabled:cursor-not-allowed"
                                            >
                                                Next
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

// --- Meeting Components ---
const MeetingSection = ({
    showForm, setShowForm, data, setData, onSubmit, isSubmitting, staff, history, searchQuery, selectedFile, onFileSelect, isUploading, formatDateForUI,
    selectedItem, setSelectedItem, openDeleteModal,
    isEditing, setIsEditing, startEditing, canDeleteMeetingItem
}: any) => {
    const context = useContext(AppContext);
    const [isUploadingLocal, setIsUploadingLocal] = useState(false);
    const [selectedFileInDrawer, setSelectedFileInDrawer] = useState<File | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [meetingAuditLogs, setMeetingAuditLogs] = useState<any[]>([]);
    const [isMeetingAuditLoading, setIsMeetingAuditLoading] = useState(false);
    const [meetingAuditPage, setMeetingAuditPage] = useState(1);
    const [meetingAuditTotalPages, setMeetingAuditTotalPages] = useState(1);
    const [expandedMeetingAuditLogId, setExpandedMeetingAuditLogId] = useState<string | null>(null);
    const itemsPerPage = 25;
    const staffById = useMemo(() => new Map(staff.map((u: any) => [normalizeId(u.id), u])), [staff]);
    const filteredHistory = useMemo(() => {
        let teamHistory = history;
        const role = context?.user?.role;

        if (role !== 'Admin' && role !== 'Manager' && role !== 'Supervisor' && context?.user?.team) {
            teamHistory = history.filter((m: any) => {
                if (!m.userIDs) return false;
                const attendeeIds = m.userIDs.split(',');
                return attendeeIds.some((id: string) => {
                    const attendee = staffById.get(normalizeId(id)) as any;
                    return attendee && attendee.team === context?.user?.team;
                });
            });
        }

        const query = searchQuery.toLowerCase();
        return teamHistory.filter((m: any) => {
            return (m.subject?.toLowerCase().includes(query) ||
                   formatDateForUI(m.date).toLowerCase().includes(query));
        }).sort((a: any, b: any) => getDateSortValue(b.date) - getDateSortValue(a.date));
    }, [history, searchQuery, formatDateForUI, context?.user, staffById]);
    const totalPages = Math.ceil(filteredHistory.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedHistory = filteredHistory.slice(startIndex, startIndex + itemsPerPage);

    useEffect(() => {
        setCurrentPage(1);
    }, [filteredHistory.length, searchQuery]);

    const loadMeetingAuditLogs = async (item = selectedItem, page = 1) => {
        if (!item?.meetingID) {
            setMeetingAuditLogs([]);
            setMeetingAuditPage(1);
            setMeetingAuditTotalPages(1);
            return;
        }

        setIsMeetingAuditLoading(true);
        try {
            const result = await fetchAuditLogs({
                entityType: 'meeting',
                entityId: item.meetingID,
                limit: 5,
                page
            });
            setMeetingAuditLogs(result.logs || []);
            setMeetingAuditPage(result.page || page);
            setMeetingAuditTotalPages(result.totalPages || 1);
        } catch (error) {
            setMeetingAuditLogs([]);
            setMeetingAuditPage(1);
            setMeetingAuditTotalPages(1);
        } finally {
            setIsMeetingAuditLoading(false);
        }
    };

    useEffect(() => {
        if (selectedItem?.meetingID) {
            loadMeetingAuditLogs(selectedItem, 1);
        } else {
            setMeetingAuditLogs([]);
            setMeetingAuditPage(1);
            setMeetingAuditTotalPages(1);
        }
        setExpandedMeetingAuditLogId(null);
    }, [selectedItem]);

    const formatMeetingAuditValue = (key: string, value: any) => {
        const text = String(value ?? '').trim();
        if (!text) return 'Blank';
        if (key === 'userIDs') {
            return text
                .split(',')
                .map((id: string) => {
                    const user = staffById.get(normalizeId(id));
                    return user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : id;
                })
                .filter(Boolean)
                .join(', ') || 'Blank';
        }
        if (key === 'momUrl') return text ? 'Attached minutes' : 'No attachment';
        return text;
    };

    const allowedStaffForForm = useMemo(() => {
        const role = context?.user?.role;
        const activeStaff = staff.filter((u: any) => u.status === 'Active');
        if (role === 'Admin' || role === 'Manager' || role === 'Supervisor') {
            return sortUsersByName(activeStaff);
        }
        return sortUsersByName(activeStaff.filter((u: any) =>
            u.team === context?.user?.team ||
            u.role === 'Admin' ||
            u.role === 'Manager' ||
            u.role === 'Supervisor'
        ));
    }, [staff, context?.user]);

    const toggleStaffSelection = (id: string) => {
        const current = data.userIDs || [];
        if (current.includes(id)) {
            setData({ ...data, userIDs: current.filter((u: string) => u !== id) });
        } else {
            setData({ ...data, userIDs: [...current, id] });
        }
    };

    return (
        <div className="space-y-6">
            {showForm && createPortal(
                <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-neutral-dark/40 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white/95 dark:bg-gray-800/95 backdrop-blur-md rounded-3xl shadow-2xl border border-white dark:border-gray-700 w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-300">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-medium/70 dark:border-gray-700 bg-neutral-light/30 dark:bg-gray-900/30">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-primary/10 rounded-2xl flex items-center justify-center text-primary border border-primary/20">
                                    <Users size={19} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-black text-neutral-dark dark:text-white tracking-tight leading-tight">Record Meeting</h2>
                                    <p className="text-[10px] font-bold text-secondary dark:text-gray-400 mt-1">Store meeting details, attendees, and minutes.</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowForm(false)}
                                disabled={isSubmitting}
                                className="p-2 hover:bg-neutral-medium/50 dark:hover:bg-gray-700 rounded-xl transition-all text-secondary disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={onSubmit} className="px-5 pt-3 pb-5 space-y-4">
                                <MeetingFormFields
                                    data={data}
                                    setData={setData}
                                    staff={allowedStaffForForm}
                                    toggleStaffSelection={toggleStaffSelection}
                                selectedFile={selectedFile}
                                onFileSelect={onFileSelect}
                                isUploading={isUploading}
                            />

                            <div className="mt-5 pt-4 border-t border-neutral-medium/70 dark:border-gray-700">
                                <button
                                    type="submit"
                                    disabled={isSubmitting || !data.subject || data.userIDs.length === 0}
                                    className="w-full py-3 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary-dark shadow-xl shadow-primary/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                                    Record Meeting
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* Meeting History Table */}
            {filteredHistory.length === 0 ? (
                <div className="p-16 text-center bg-white dark:bg-gray-800 rounded-2xl border border-dashed border-neutral-medium dark:border-gray-700 animate-in fade-in zoom-in-95 slide-in-from-top-4 duration-700">
                    <div className="relative w-20 h-20 mx-auto mb-6">
                        <Users className="absolute inset-0 m-auto text-primary/10" size={64} />
                        <Search className="absolute bottom-0 right-0 text-primary/30" size={24} />
                    </div>
                    <h3 className="text-xl font-black text-neutral-dark dark:text-white tracking-tight">No meetings found</h3>
                    <p className="text-sm text-secondary/60 font-medium">
                        {searchQuery ? 'No records match your search query.' : 'There are no meeting logs recorded in the system yet.'}
                    </p>
                </div>
            ) : (
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-neutral-light dark:bg-gray-700/30 border-b border-neutral-medium dark:border-gray-700">
                                <tr>

                                    <th className="px-5 py-3 text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest">Subject</th>
                                    <th className="px-5 py-3 text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest">Attendees</th>
                                    <th className="px-5 py-3 text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest">Date</th>
                                    <th className="px-5 py-3 text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest">Status</th>
                                    <th className="px-5 py-3 text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-medium/30 dark:divide-gray-700/50">
                                {paginatedHistory.map((m: any, rowIndex: number) => {
                                    const attendeeIds = m.userIDs?.split(',') || [];
                                    const attendeeCount = attendeeIds.length;
                                    const showBelow = rowIndex < 2 && rowIndex < paginatedHistory.length - 1;

                                    return (
                                        <tr
                                            key={m.meetingID}
                                            onClick={() => setSelectedItem(m)}
                                            className="group cursor-pointer transition-all duration-300 hover:bg-primary/[0.02] dark:hover:bg-primary/[0.05] relative hover:z-[50] border-b border-neutral-medium/30 dark:border-gray-800/50"
                                        >
                                            <td className="px-5 py-2.5">
                                                <span className="text-[13px] font-black text-neutral-dark dark:text-white truncate block max-w-[200px] group-hover:text-primary transition-colors">{m.subject}</span>
                                            </td>
                                            <td className="px-5 py-2.5 align-middle">
                                                <div className="flex items-center -space-x-2.5 min-h-[28px]">
                                                    {attendeeIds.slice(0, 3).map((id: string, idx: number) => {
                                                        const staffMember = staffById.get(normalizeId(id)) as any;
                                                        return (
                                                            <div key={idx} className="w-7 h-7 rounded-full border-2 border-white dark:border-gray-800 shadow-sm bg-white dark:bg-gray-800 inline-flex items-center justify-center overflow-visible shrink-0">
                                                                <UserHoverCard user={staffMember} fallbackName="User" size="md" />
                                                            </div>
                                                        );
                                                    })}
                                                    {attendeeCount > 3 && (
                                                        <AttendeeTooltipList
                                                            attendeeIds={attendeeIds}
                                                            attendeeCount={attendeeCount}
                                                            staff={staff}
                                                            showBelow={showBelow}
                                                        />
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-5 py-2.5 text-[11px] font-black text-secondary/80 dark:text-gray-400">{formatDateForUI(m.date)}</td>
                                            <td className="px-5 py-2.5">
                                                <div className="flex items-center gap-1.5 text-[9px] font-black text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20 uppercase w-fit">
                                                    <div className="w-1 h-1 rounded-full bg-primary" />
                                                    Archived
                                                </div>
                                            </td>
                                            <td className="px-5 py-2.5">
                                                <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                                                    {m.momUrl ? (
                                                        <a href={getDriveUrl(m.momUrl)} target="_blank" rel="noopener noreferrer" className="p-1.5 text-primary hover:bg-primary/10 rounded-lg transition-all"><ExternalLink size={14} /></a>
                                                    ) : (
                                                        <div className="p-1.5 text-secondary dark:text-gray-500 opacity-20 dark:opacity-40"><ExternalLink size={14} /></div>
                                                    )}
                                                    {canDeleteMeetingItem() && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                openDeleteModal(
                                                                    "Delete Meeting?",
                                                                    "Are you sure you want to delete this meeting? This action cannot be undone.",
                                                                    async () => {
                                                                        if (m.momUrl && !m.momUrl.startsWith('http')) {
                                                                            await deleteFile(m.momUrl);
                                                                        }
                                                                        await deleteMeeting(m.meetingID);
                                                                        context?.refreshData();
                                                                        context?.showToast?.('Meeting deleted successfully', 'success');
                                                                    }
                                                                );
                                                            }}
                                                            className="p-1.5 text-secondary dark:text-gray-400 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    )}

                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <TablePagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        startIndex={startIndex}
                        itemsPerPage={itemsPerPage}
                        totalItems={filteredHistory.length}
                        setCurrentPage={setCurrentPage}
                    />
                </div>
            )}

            {/* Meeting Detail Drawer */}
            {selectedItem && createPortal(
                <div className="fixed inset-0 z-[10000] flex justify-end animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-neutral-dark/40 backdrop-blur-[2px] transition-opacity" onClick={() => !isUploadingLocal && !isSubmitting && setSelectedItem(null)} />
                    <div className="relative w-full max-w-2xl bg-white dark:bg-gray-900 h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
                        {/* Drawer Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-medium dark:border-gray-800 bg-neutral-light/30 dark:bg-gray-800/30 backdrop-blur-md sticky top-0 z-10">
                            <div className="flex items-center gap-5">
                                <div className="w-10 h-10 bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl flex items-center justify-center text-primary border border-primary/10 shadow-sm">
                                    <Users size={20} />
                                </div>
                                <div>
                                    <div className="flex items-center gap-3 mb-1">
                                        <h2 className="text-xl font-black text-neutral-dark dark:text-white tracking-tight leading-tight">
                                            {selectedItem.subject}
                                        </h2>
                                        <div className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-[0.15em] border flex items-center gap-1.5 shadow-sm bg-primary/5 text-primary border-primary/10">
                                            <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                                            Archived
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {!isEditing && (
                                    <button
                                        onClick={() => startEditing(selectedItem)}
                                        disabled={isUploadingLocal || isSubmitting}
                                        className="p-2.5 text-secondary hover:bg-primary/10 hover:text-primary rounded-2xl transition-all duration-300 hover:scale-105 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:bg-transparent"
                                        title="Edit Meeting"
                                    >
                                        <Pencil size={20} />
                                    </button>
                                )}
                                <button
                                    onClick={() => setSelectedItem(null)}
                                    disabled={isUploadingLocal || isSubmitting}
                                    className="p-2.5 text-secondary hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400 rounded-2xl transition-all duration-300 hover:scale-105 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:bg-transparent"
                                >
                                    <X size={24} />
                                </button>
                            </div>

                        </div>

                        {/* Drawer Content */}
                        <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-gradient-to-br from-neutral-light/50 via-white to-primary/5 dark:from-gray-900 dark:via-gray-900 dark:to-primary/10 custom-scrollbar">
                            {isEditing ? (
                                <form onSubmit={onSubmit} className="space-y-5 animate-in slide-in-from-bottom-4 duration-300">
                                    <div className="flex items-center gap-2">
                                        <div className="w-1 h-4 bg-primary rounded-full" />
                                        <h3 className="text-sm font-black text-neutral-dark dark:text-white">Update Meeting Details</h3>
                                    </div>

                                    <div className="bg-white/85 dark:bg-gray-800/70 backdrop-blur-md rounded-2xl border border-neutral-medium/60 dark:border-gray-700 shadow-sm p-5">
                                        <MeetingFormFields
                                            data={data}
                                            setData={setData}
                                            staff={allowedStaffForForm}
                                            toggleStaffSelection={toggleStaffSelection}
                                            selectedFile={selectedFile}
                                            onFileSelect={onFileSelect}
                                            isUploading={isSubmitting}
                                        />
                                    </div>

                                    <div className="sticky bottom-0 -mx-8 -mb-8 px-8 py-4 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-t border-neutral-medium/70 dark:border-gray-700 flex gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setIsEditing(false)}
                                            className="flex-1 py-3 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest text-secondary hover:bg-neutral-light dark:hover:bg-gray-800 transition-all border border-neutral-medium dark:border-gray-700"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={isSubmitting || !data.subject || data.userIDs?.length === 0}
                                            className="flex-[2] py-3 px-4 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary-dark shadow-xl shadow-primary/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                        >
                                            {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                                            Save Changes
                                        </button>
                                    </div>
                                </form>
                            ) : (
                                <>
                            <div className="space-y-4">

                                <div className="flex items-center gap-2">
                                    <div className="w-1 h-4 bg-primary rounded-full" />
                                    <h3 className="text-sm font-black text-neutral-dark dark:text-white">Meeting Particulars</h3>
                                </div>
                                <div className="grid grid-cols-2 gap-x-8 gap-y-6 bg-white/85 dark:bg-gray-800/70 backdrop-blur-md rounded-2xl border border-neutral-medium/60 dark:border-gray-700 shadow-sm p-5">
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black text-secondary dark:text-gray-400">Date Held</p>
                                        <p className="text-sm font-black text-neutral-dark dark:text-white">{formatDateForUI(selectedItem.date)}</p>
                                    </div>
                                    <div className="space-y-2 col-span-2">
                                        <p className="text-[10px] font-black text-secondary dark:text-gray-400">Minutes of Meeting</p>
                                        {selectedItem.momUrl ? (
                                            <div className="flex items-center justify-between group/att bg-neutral-light/30 dark:bg-gray-900/40 p-4 rounded-2xl border border-neutral-medium/50 dark:border-gray-700/50">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/10">
                                                        <FileText size={16} />
                                                    </div>
                                                    <a href={getDriveUrl(selectedItem.momUrl)} target="_blank" rel="noopener noreferrer" className="text-[13px] font-black text-neutral-dark dark:text-white hover:text-primary transition-colors flex items-center gap-2">
                                                        View Meeting Minutes <ExternalLink size={12} />
                                                    </a>
                                                </div>
                                                {canDeleteMeetingItem() && (
                                                    <button
                                                        onClick={() => {
                                                            openDeleteModal(
                                                                "Delete Document?",
                                                                "Are you sure you want to remove these meeting minutes? This will permanently delete the file from Drive.",
                                                                async () => {
                                                                    try {
                                                                        const fileId = selectedItem.momUrl;
                                                                        if (fileId && !fileId.startsWith('http')) {
                                                                            await deleteFile(fileId);
                                                                        }
                                                                        await updateMeeting(selectedItem.meetingID, { ...selectedItem, momUrl: '' });
                                                                        setSelectedItem({ ...selectedItem, momUrl: '' });
                                                                        context?.showToast?.('Minutes removed successfully', 'success');
                                                                        context?.refreshData();
                                                                    } catch (e) {
                                                                        context?.showToast?.('Failed to delete minutes', 'error');
                                                                        throw e;
                                                                    }
                                                                }
                                                            );
                                                        }}
                                                        className="p-2 text-secondary/40 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                <FileUploadField
                                                    label="Select Minutes File"
                                                    file={selectedFileInDrawer}
                                                    url=""
                                                    onFileSelect={setSelectedFileInDrawer}
                                                    isUploading={isUploadingLocal}
                                                />
                                                {selectedFileInDrawer && (
                                                    <button
                                                        onClick={async () => {
                                                            setIsUploadingLocal(true);
                                                            try {
                                                                const uploadRes = await uploadFile(selectedFileInDrawer, 'Meeting');
                                                                await updateMeeting(selectedItem.meetingID, { ...selectedItem, momUrl: uploadRes.id });
                                                                setSelectedItem({ ...selectedItem, momUrl: uploadRes.id });
                                                                setSelectedFileInDrawer(null);
                                                                context?.showToast?.('Minutes synchronized successfully!', 'success');
                                                                context?.refreshData();
                                                            } catch (e) {
                                                                context?.showToast?.('Upload failed. Please try again.', 'error');
                                                            } finally {
                                                                setIsUploadingLocal(false);
                                                            }
                                                        }}
                                                        disabled={isUploadingLocal}
                                                        className="w-full py-2.5 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary-dark shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2"
                                                    >
                                                        {isUploadingLocal ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                                                        Sync Official Minutes
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center gap-2">
                                    <div className="w-1 h-4 bg-primary rounded-full" />
                                    <h3 className="text-sm font-black text-neutral-dark dark:text-white">Firm Attendees</h3>
                                </div>
                                <div className="bg-white/85 dark:bg-gray-800/70 backdrop-blur-md rounded-2xl border border-neutral-medium/60 dark:border-gray-700 shadow-sm p-4">
                                    <div className="grid grid-cols-2 gap-2 max-h-[160px] overflow-y-auto custom-scrollbar pr-1">
                                        {selectedItem.userIDs?.split(',').map((id: string, idx: number) => {
                                            const staffMember = staffById.get(normalizeId(id)) as any;
                                            if (!staffMember) return null;
                                            return (
                                                <div key={idx} className="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-primary/5 transition-colors group/staff border border-transparent hover:border-primary/10">
                                                    <UserHoverCard user={staffMember} fallbackName={`${staffMember.firstName} ${staffMember.lastName}`} size="md" />
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-[10px] font-bold text-neutral-dark dark:text-white capitalize truncate leading-tight">{staffMember.firstName} {staffMember.lastName}</p>
                                                        <p className="text-[8px] font-black text-secondary/50 uppercase tracking-widest truncate leading-tight">{staffMember.role}</p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center gap-2">
                                    <div className="w-1 h-4 bg-primary rounded-full" />
                                    <h3 className="text-sm font-black text-neutral-dark dark:text-white">Audit Logs</h3>
                                </div>
                                <div className="bg-white/85 dark:bg-gray-800/70 backdrop-blur-md rounded-2xl border border-neutral-medium/60 dark:border-gray-700 shadow-sm overflow-hidden">
                                    <div className={`${meetingAuditLogs.length > 0 || isMeetingAuditLoading ? 'min-h-[255px]' : ''} transition-opacity duration-200 ${isMeetingAuditLoading && meetingAuditLogs.length > 0 ? 'opacity-70' : 'opacity-100'}`}>
                                        {meetingAuditLogs.length > 0 ? (
                                            meetingAuditLogs.map((log) => {
                                                const detailRows = getOperationAuditDetailRows(log.details);
                                                const isExpanded = expandedMeetingAuditLogId === log.id;
                                                const hasDetails = detailRows.length > 0;
                                                return (
                                                    <div key={log.id} className="border-b border-neutral-medium/40 dark:border-gray-700/60 last:border-0 hover:bg-neutral-light/50 dark:hover:bg-gray-800 transition-colors">
                                                        <button
                                                            type="button"
                                                            onClick={() => hasDetails && setExpandedMeetingAuditLogId(isExpanded ? null : log.id)}
                                                            className="w-full px-5 py-3 text-left"
                                                        >
                                                            <div className="flex items-start justify-between gap-4">
                                                                <div className="min-w-0">
                                                                    <div className="flex items-center gap-2">
                                                                        <p className="text-xs font-black text-neutral-dark dark:text-white">{log.actionLabel || log.action}</p>
                                                                        {hasDetails && (
                                                                            <ChevronDown size={13} className={`text-secondary/50 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                                                        )}
                                                                    </div>
                                                                    <p className="mt-1 text-[11px] font-bold text-secondary dark:text-gray-400">
                                                                        {log.userName || 'System'}{log.userRole ? ` - ${log.userRole}` : ''}
                                                                    </p>
                                                                </div>
                                                                <p className="shrink-0 text-[10px] font-bold text-secondary/70 dark:text-gray-400">{formatAuditTimestamp(log.createdAt)}</p>
                                                            </div>
                                                            {log.summary && (
                                                                <p className="mt-2 text-[11px] font-medium text-secondary dark:text-gray-400">{log.summary}</p>
                                                            )}
                                                        </button>
                                                        {isExpanded && hasDetails && (
                                                            <div className="mx-5 mb-3 rounded-xl border border-neutral-medium/50 dark:border-gray-700/70 bg-neutral-light/40 dark:bg-gray-900/40 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
                                                                <div className="grid grid-cols-[1fr_1fr_1fr] border-b border-neutral-medium/40 dark:border-gray-700/60 bg-white/50 dark:bg-gray-800/50">
                                                                    <div className="px-3 py-2 text-[9px] font-black text-secondary/70 uppercase tracking-widest">Field</div>
                                                                    <div className="px-3 py-2 text-[9px] font-black text-secondary/70 uppercase tracking-widest">Before</div>
                                                                    <div className="px-3 py-2 text-[9px] font-black text-secondary/70 uppercase tracking-widest">After</div>
                                                                </div>
                                                                {detailRows.map((row) => (
                                                                    <div key={row.key} className="grid grid-cols-[1fr_1fr_1fr] items-start border-b border-neutral-medium/30 dark:border-gray-700/50 last:border-0">
                                                                        <div className="px-3 py-2 text-[10px] font-black text-neutral-dark dark:text-white">{row.label}</div>
                                                                        <div className="px-3 py-2 text-[10px] font-semibold text-secondary dark:text-gray-400">
                                                                            <div className="max-h-24 overflow-y-auto break-words pr-1 custom-scrollbar">{formatMeetingAuditValue(row.key, row.before)}</div>
                                                                        </div>
                                                                        <div className="px-3 py-2 text-[10px] font-semibold text-secondary dark:text-gray-400">
                                                                            <div className="max-h-24 overflow-y-auto break-words pr-1 custom-scrollbar">{formatMeetingAuditValue(row.key, row.after)}</div>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })
                                        ) : isMeetingAuditLoading ? (
                                            <div className="h-[255px] flex flex-col items-center justify-center gap-2 text-xs font-bold text-secondary/60">
                                                <Loader2 size={16} className="animate-spin text-primary/70" />
                                                Loading audit logs...
                                            </div>
                                        ) : (
                                            <div className="m-4 py-8 text-center border border-dashed border-neutral-medium dark:border-gray-700 rounded-[2rem] bg-white/40 dark:bg-gray-900/40">
                                                <p className="text-[9px] text-secondary font-black uppercase tracking-widest opacity-30">No audit logs recorded</p>
                                            </div>
                                        )}
                                    </div>
                                    {meetingAuditTotalPages > 1 && (
                                        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-neutral-medium/40 dark:border-gray-700/60 bg-neutral-light/30 dark:bg-gray-900/30">
                                            <button
                                                onClick={() => loadMeetingAuditLogs(selectedItem, Math.max(meetingAuditPage - 1, 1))}
                                                disabled={isMeetingAuditLoading || meetingAuditPage <= 1}
                                                className="px-3 py-1.5 rounded-lg border border-neutral-medium dark:border-gray-700 text-[10px] font-black text-secondary hover:text-primary hover:border-primary disabled:opacity-40 disabled:cursor-not-allowed"
                                            >
                                                Previous
                                            </button>
                                            <span className="text-[10px] font-black text-secondary dark:text-gray-400">Page {meetingAuditPage} of {meetingAuditTotalPages}</span>
                                            <button
                                                onClick={() => loadMeetingAuditLogs(selectedItem, Math.min(meetingAuditPage + 1, meetingAuditTotalPages))}
                                                disabled={isMeetingAuditLoading || meetingAuditPage >= meetingAuditTotalPages}
                                                className="px-3 py-1.5 rounded-lg border border-neutral-medium dark:border-gray-700 text-[10px] font-black text-secondary hover:text-primary hover:border-primary disabled:opacity-40 disabled:cursor-not-allowed"
                                            >
                                                Next
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default Operations;
