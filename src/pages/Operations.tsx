import React, { useState, useContext, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AppContext } from '../App';
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
    Check,
    Printer,
    Pencil
} from 'lucide-react';
import { addTransmittal, addMeeting, uploadFile, updateTransmittal, updateMeeting, normalizeId, deleteFile, deleteTransmittal, deleteMeeting, addNotification } from '../services/googleSheetsService';
import { useReactToPrint } from 'react-to-print';
import { TransmittalPrintTemplate } from '../components/TransmittalPrintTemplate';


const getDriveUrl = (idOrUrl: string) => {
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
            <div className="w-[30px] h-[30px] rounded-full bg-neutral-light dark:bg-gray-700 border-2 border-white dark:border-gray-800 flex items-center justify-center text-[10px] font-black text-secondary shadow-sm cursor-help transition-transform hover:scale-110">
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
    const [activeTab, setActiveTab] = useState<'Transmittals' | 'Meetings'>('Transmittals');
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
            await updateMeeting(selectedMeeting.meetingID, {
                ...meetingData,
                date: formatDateForSheet(meetingData.date),
                userIDs: meetingData.userIDs.join(',')
            });

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
            await updateTransmittal(selectedTransmittal.transmittalID, {
                ...transmittalData,
                date: formatDateForSheet(transmittalData.date),
                items: transmittalData.items.join('||')
            });

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
                            Operations Center
                        </h1>
                    </div>
                    <p className="text-sm text-secondary dark:text-gray-300 font-medium pl-4 opacity-70 dark:opacity-100">
                        Firm-wide transmittals and professional meeting logs
                    </p>
                </div>

                {/* Enhanced Navigation Tabs */}
                <div className="flex p-1 bg-neutral-light dark:bg-gray-900 rounded-xl shrink-0 border border-neutral-medium dark:border-gray-700 shadow-sm bg-white">
                    <button 
                        onClick={() => { setActiveTab('Transmittals'); handleCloseTransmittalForm(); handleCloseMeetingForm(); }}
                        className={`flex items-center gap-2.5 px-6 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all duration-300 ${activeTab === 'Transmittals' 
                            ? 'bg-white dark:bg-gray-700 text-primary shadow-lg ring-1 ring-black/[0.03]' 
                            : 'text-secondary hover:text-neutral-dark dark:hover:text-white hover:bg-black/5'}`}
                    >
                        <FileText size={16} />
                        Transmittals
                    </button>
                    <button 
                        onClick={() => { setActiveTab('Meetings'); handleCloseTransmittalForm(); handleCloseMeetingForm(); }}
                        className={`flex items-center gap-2.5 px-6 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all duration-300 ${activeTab === 'Meetings' 
                            ? 'bg-white dark:bg-gray-700 text-primary shadow-lg ring-1 ring-black/[0.03]' 
                            : 'text-secondary hover:text-neutral-dark dark:hover:text-white hover:bg-black/5'}`}
                    >
                        <Users size={16} />
                        Meetings
                    </button>
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

    const sortedClients = useMemo(() => {
        return [...clients].sort((a, b) => a.name.localeCompare(b.name));
    }, [clients]);

    const filteredClients = useMemo(() => {
        if (!search) return sortedClients;
        return sortedClients.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
    }, [sortedClients, search]);

    const selectedClient = clients.find((c: any) => normalizeId(c.id) === normalizeId(value));

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
                <span className={selectedClient ? "text-neutral-dark dark:text-white" : "text-secondary/50 font-medium"}>
                    {selectedClient ? selectedClient.name : "Select a client..."}
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
                            <div className="px-3 py-4 text-center text-xs text-secondary/50">No clients found</div>
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
            <label className="text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-[0.1em] ml-2 opacity-60">Client Entity</label>
            <ClientSearchableSelect 
                clients={clients}
                value={data.clientID}
                onChange={(id: string) => setData({ ...data, clientID: id })}
            />
        </div>

        <div className="space-y-1">
            <label className="text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-[0.1em] ml-2 opacity-60">Log Date</label>
            <input 
                type="date"
                required
                value={data.date}
                onChange={(e) => setData({ ...data, date: e.target.value })}
                className="w-full px-4 py-2 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium dark:border-gray-700 rounded-xl text-xs font-bold focus:ring-4 focus:ring-primary/5 outline-none transition-all"
            />
        </div>

        <div className="space-y-1">
            <label className="text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-[0.1em] ml-2 opacity-60">Staff</label>
            <select 
                required
                value={data.userID}
                onChange={(e) => setData({ ...data, userID: e.target.value })}
                className="w-full px-4 py-2 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium dark:border-gray-700 rounded-xl text-xs font-bold focus:ring-4 focus:ring-primary/5 outline-none transition-all"
            >
                {(context?.user?.role === 'Admin' ? users : users.filter((u: any) => normalizeId(u.id) === normalizeId(context?.user?.id))).map((u: any) => (
                    <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                ))}
            </select>
        </div>

        <div className="space-y-1">
            <label className="text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-[0.1em] ml-2 opacity-60">Receiver's Name</label>
            <input 
                type="text"
                placeholder="Leave blank for client default"
                value={data.receiverName || ''}
                onChange={(e) => setData({ ...data, receiverName: e.target.value })}
                className="w-full px-4 py-2 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium dark:border-gray-700 rounded-xl text-xs font-bold focus:ring-4 focus:ring-primary/5 outline-none transition-all"
            />
        </div>

        <div className="space-y-1">
            <label className="text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-[0.1em] ml-2 opacity-60">Receiver's Address</label>
            <input 
                type="text"
                placeholder="Leave blank for client default"
                value={data.receiverAddress || ''}
                onChange={(e) => setData({ ...data, receiverAddress: e.target.value })}
                className="w-full px-4 py-2 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium dark:border-gray-700 rounded-xl text-xs font-bold focus:ring-4 focus:ring-primary/5 outline-none transition-all"
            />
        </div>

        <div className="col-span-2 space-y-2">
            <label className="text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-[0.1em] ml-2 opacity-60">Documents Manifest (Items)</label>
            <div className="flex gap-2">
                <input 
                    type="text"
                    placeholder="Add item..."
                    value={newItemText}
                    onChange={(e) => setNewItemText(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addItem())}
                    className="flex-1 px-4 py-2 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium dark:border-gray-700 rounded-xl text-xs font-bold focus:ring-4 focus:ring-primary/5 outline-none transition-all"
                />
                <button 
                    type="button"
                    onClick={addItem}
                    className="p-2.5 bg-primary text-white rounded-xl hover:bg-primary-dark transition-all"
                >
                    <Plus size={16} />
                </button>
            </div>
            
            <div className="flex flex-col gap-2 mt-3 max-h-[180px] overflow-y-auto custom-scrollbar pr-2">
                {data.items.map((item: string, idx: number) => (
                    <div key={idx} className="flex items-start gap-3 p-3 bg-neutral-light/30 dark:bg-gray-800/30 border border-neutral-medium/50 dark:border-gray-700/50 rounded-xl animate-in fade-in slide-in-from-left-2 duration-200">
                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-black text-primary shrink-0 shadow-sm mt-0.5">
                            {idx + 1}
                        </span>
                        <span className="flex-1 text-xs font-bold text-neutral-dark dark:text-white leading-relaxed break-words pt-1">{item}</span>
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
        if (!search) return staff;
        return staff.filter((s: any) => 
            `${s.firstName} ${s.lastName}`.toLowerCase().includes(search.toLowerCase())
        );
    }, [staff, search]);

    const selectedStaff = useMemo(() => {
        return (selectedIds || []).map((id: string) => staff.find((s: any) => normalizeId(s.id) === normalizeId(id))).filter(Boolean);
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
                                            <div className="flex items-center gap-2">
                                                <div className={`w-6 h-6 rounded-md flex items-center justify-center text-[8px] font-black ${isSelected ? 'bg-primary text-white' : 'bg-neutral-light dark:bg-gray-800 text-secondary'}`}>
                                                    {u.firstName[0]}{u.lastName[0]}
                                                </div>
                                                {u.firstName} {u.lastName}
                                            </div>
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
            <label className="text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-[0.1em] ml-2 opacity-60">Meeting Subject / Topic</label>
            <input 
                required
                type="text"
                placeholder="e.g. Monthly Review"
                value={data.subject}
                onChange={(e) => setData({ ...data, subject: e.target.value })}
                className="w-full px-4 py-2.5 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium dark:border-gray-700 rounded-xl text-xs font-bold focus:ring-4 focus:ring-primary/5 outline-none transition-all"
            />
        </div>

        <div className="space-y-1 col-span-2">
            <label className="text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-[0.1em] ml-2 opacity-60">Meeting Date</label>
            <input 
                type="date"
                required
                value={data.date}
                onChange={(e) => setData({ ...data, date: e.target.value })}
                className="w-full px-4 py-2.5 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium dark:border-gray-700 rounded-xl text-xs font-bold focus:ring-4 focus:ring-primary/5 outline-none transition-all"
            />
        </div>

        <div className="col-span-2 space-y-1 relative z-20">
            <label className="text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-[0.1em] ml-2 opacity-60">Attendees (Firm Staff)</label>
            <StaffMultiSelect 
                staff={staff}
                selectedIds={data.userIDs}
                toggleSelection={toggleStaffSelection}
            />
        </div>

        <div className="col-span-2">
            <FileUploadField 
                label="Minutes of Meeting (MOM)"
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
    isEditing, setIsEditing, startEditing
}: any) => {
    const context = useContext(AppContext);
    const [isUploadingLocal, setIsUploadingLocal] = useState(false);
    const [selectedFileInDrawer, setSelectedFileInDrawer] = useState<File | null>(null);
    const filteredHistory = useMemo(() => {
        let personalHistory = history;
        const isManagerOrAbove = context?.user?.role === 'Admin' || context?.user?.role === 'Manager' || context?.user?.role === 'Supervisor';
        if (!isManagerOrAbove) {
            personalHistory = history.filter((t: any) => normalizeId(t.userID) === normalizeId(context?.user?.id));
        }
        return personalHistory.filter((t: any) => {
            const client = clients.find((c: any) => normalizeId(c.id) === normalizeId(t.clientID));
            return (client?.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                   t.items?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                   formatDateForUI(t.date).toLowerCase().includes(searchQuery.toLowerCase()));
        }).reverse();
    }, [history, clients, searchQuery, formatDateForUI, context?.user]);

    const printRef = useRef<HTMLDivElement>(null);

    const handlePrint = useReactToPrint({
        contentRef: printRef,
        documentTitle: selectedItem ? `Transmittal_${selectedItem.transmittalID}` : 'Transmittal_Slip'
    });

    return (
        <div className="space-y-6">
            {showForm && createPortal(
                <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-neutral-dark/40 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white/95 dark:bg-gray-800/95 backdrop-blur-md rounded-[2rem] shadow-2xl border border-white dark:border-gray-700 w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-300">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-medium dark:border-gray-700 bg-neutral-light/30 dark:bg-gray-900/30">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-primary/10 rounded-xl flex items-center justify-center text-primary border border-primary/20">
                                    <FileText size={18} />
                                </div>
                                <div>
                                    <h2 className="text-base font-black text-neutral-dark dark:text-white tracking-tight leading-tight">Log Transmittal</h2>
                                    <p className="text-[8px] font-black uppercase tracking-[0.2em] text-secondary opacity-50 mt-0.5">Physical & Digital Document Release</p>
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

                        <form onSubmit={onSubmit} className="p-6 space-y-4">
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
                            <div className="pt-4 border-t border-neutral-medium dark:border-gray-700 mt-2">
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
                {filteredHistory.map((t: any) => {
                                    const client = clients.find((c: any) => normalizeId(c.id) === normalizeId(t.clientID));
                                    const staffMember = staff.find((u: any) => normalizeId(u.id) === normalizeId(t.userID));
                                    const itemsCount = t.items?.split('||').length || 0;

                                    return (
                                        <tr 
                                            key={t.transmittalID} 
                                            onClick={() => setSelectedItem(t)}
                                            className="group cursor-pointer transition-all duration-300 hover:bg-primary/[0.02] dark:hover:bg-primary/[0.05] relative hover:z-[10] border-b border-neutral-medium/30 dark:border-gray-800/50"
                                        >
                                            <td className="px-5 py-2.5 font-mono text-[11px] font-black text-primary">#{t.transmittalID}</td>
                                            <td className="px-5 py-2.5">
                                                <span className="text-[13px] font-black text-neutral-dark dark:text-white truncate block max-w-[200px] group-hover:text-primary transition-colors">{client?.name || 'Unknown Client'}</span>
                                            </td>
                                            <td className="px-5 py-2.5">
                                                <span className="text-[11px] font-bold text-secondary dark:text-gray-300">{itemsCount} items</span>
                                            </td>
                                            <td className="px-5 py-2.5">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center overflow-hidden shrink-0">
                                                        {staffMember?.avatarUrl ? (
                                                            <img src={staffMember.avatarUrl} alt={staffMember.firstName} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <span className="text-[10px] font-black text-primary">
                                                                {staffMember ? `${staffMember.firstName[0]}${staffMember.lastName[0]}`.toUpperCase() : '??'}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="text-[12px] font-bold text-neutral-dark dark:text-white truncate block max-w-[150px]">
                                                        {staffMember ? `${staffMember.firstName} ${staffMember.lastName}` : 'Unknown Staff'}
                                                    </span>
                                                </div>
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

                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
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
                                            {clients.find((c: any) => normalizeId(c.id) === normalizeId(selectedItem.clientID))?.name || 'Client Details'}
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
                                client={clients.find((c: any) => normalizeId(c.id) === normalizeId(selectedItem?.clientID))}
                                staffMember={staff.find((u: any) => normalizeId(u.id) === normalizeId(selectedItem?.userID))}
                                logoUrl="/logo.png"
                            />
                        </div>

                        {/* Drawer Content */}
                        <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-gradient-to-br from-neutral-light/50 via-white to-primary/5 dark:from-gray-900 dark:via-gray-900 dark:to-primary/10 custom-scrollbar">
                            {isEditing ? (
                                <form onSubmit={onSubmit} className="space-y-6 animate-in slide-in-from-bottom-4 duration-300">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-1 h-4 bg-primary rounded-full" />
                                        <h3 className="text-sm font-black text-neutral-dark dark:text-white uppercase tracking-wider">Update Transmittal Details</h3>
                                    </div>
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
                                    <div className="pt-6 border-t border-neutral-medium dark:border-gray-700 flex gap-3">
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
                                <div className="flex items-center gap-2">
                                    <div className="w-1 h-4 bg-primary rounded-full" />
                                    <h3 className="text-sm font-black text-neutral-dark dark:text-white uppercase tracking-wider">Log Overview</h3>
                                </div>
                                <div className="grid grid-cols-2 gap-x-8 gap-y-6 bg-white/80 dark:bg-gray-800/60 backdrop-blur-md rounded-[2rem] border border-white dark:border-gray-700 shadow-xl shadow-primary/5 p-6 relative overflow-hidden group">
                                    <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/5 rounded-full blur-3xl transition-all group-hover:bg-primary/10" />
                                    <div className="space-y-1 relative z-1">
                                        <p className="text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest opacity-50 dark:opacity-100">Date Logged</p>
                                        <p className="text-sm font-black text-neutral-dark dark:text-white tracking-tight">{formatDateForUI(selectedItem.date)}</p>
                                    </div>
                                    <div className="space-y-1 relative z-1">
                                        <p className="text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest opacity-50 dark:opacity-100">Representative</p>
                                        <p className="text-sm font-black text-neutral-dark dark:text-white tracking-tight">
                                            {(() => {
                                                const staffMember = staff.find((u: any) => normalizeId(u.id) === normalizeId(selectedItem.userID));
                                                return staffMember ? `${staffMember.firstName} ${staffMember.lastName}` : '---';
                                            })()}
                                        </p>
                                    </div>
                                    <div className="space-y-1 relative z-1">
                                        <p className="text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest opacity-50 dark:opacity-100">Receiver's Name</p>
                                        <p className="text-sm font-black text-neutral-dark dark:text-white tracking-tight">
                                            {selectedItem.receiverName || <span className="opacity-50 italic">Default Client</span>}
                                        </p>
                                    </div>
                                    <div className="space-y-1 relative z-1">
                                        <p className="text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest opacity-50 dark:opacity-100">Receiver's Address</p>
                                        <p className="text-sm font-black text-neutral-dark dark:text-white tracking-tight">
                                            {selectedItem.receiverAddress || <span className="opacity-50 italic">Default Client Address</span>}
                                        </p>
                                    </div>
                                    <div className="space-y-1 relative z-1 col-span-2">
                                        <p className="text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest opacity-50 dark:opacity-100">Attachment</p>
                                        {selectedItem.receiptUrl ? (
                                            <div className="flex items-center justify-between group/att bg-neutral-light/30 dark:bg-gray-800/40 p-4 rounded-2xl border border-neutral-medium/30 dark:border-gray-700/50">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/10">
                                                        <FileText size={16} />
                                                    </div>
                                                    <a href={getDriveUrl(selectedItem.receiptUrl)} target="_blank" rel="noopener noreferrer" className="text-[13px] font-black text-neutral-dark dark:text-white hover:text-primary transition-colors flex items-center gap-2">
                                                        View Official Slip <ExternalLink size={12} />
                                                    </a>
                                                </div>
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
                                                    className="p-2 text-secondary/40 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
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
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center gap-2">
                                    <div className="w-1 h-4 bg-primary rounded-full" />
                                    <h3 className="text-sm font-black text-neutral-dark dark:text-white uppercase tracking-wider">Documents Manifest</h3>
                                </div>
                                <div className="bg-white/80 dark:bg-gray-800/60 backdrop-blur-md rounded-[2rem] border border-white dark:border-gray-700 shadow-xl shadow-primary/5 overflow-hidden">
                                    <div className="divide-y divide-neutral-medium/30 dark:divide-gray-700/50">
                                        {selectedItem.items?.split('||').map((item: string, idx: number) => (
                                            <div key={idx} className="px-6 py-4 flex items-center gap-4 hover:bg-primary/[0.02] transition-colors">
                                                <span className="text-xs font-black text-primary/40">{String(idx + 1).padStart(2, '0')}</span>
                                                <p className="text-[13px] font-black text-neutral-dark dark:text-white tracking-tight">
                                                    {item.toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase())}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
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
    isEditing, setIsEditing, startEditing
}: any) => {
    const context = useContext(AppContext);
    const [isUploadingLocal, setIsUploadingLocal] = useState(false);
    const [selectedFileInDrawer, setSelectedFileInDrawer] = useState<File | null>(null);
    const filteredHistory = useMemo(() => {
        let teamHistory = history;
        const role = context?.user?.role;
        
        if (role !== 'Admin' && role !== 'Manager' && role !== 'Supervisor' && context?.user?.team) {
            teamHistory = history.filter((m: any) => {
                if (!m.userIDs) return false;
                const attendeeIds = m.userIDs.split(',');
                return attendeeIds.some((id: string) => {
                    const attendee = staff.find((u: any) => normalizeId(u.id) === normalizeId(id));
                    return attendee && attendee.team === context?.user?.team;
                });
            });
        }

        return teamHistory.filter((m: any) => {
            return (m.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                   formatDateForUI(m.date).toLowerCase().includes(searchQuery.toLowerCase()));
        }).reverse();
    }, [history, searchQuery, formatDateForUI, context?.user, staff]);

    const allowedStaffForForm = useMemo(() => {
        const role = context?.user?.role;
        if (role === 'Admin' || role === 'Manager' || role === 'Supervisor') {
            return staff;
        }
        return staff.filter((u: any) => 
            u.team === context?.user?.team || 
            u.role === 'Admin' || 
            u.role === 'Manager' || 
            u.role === 'Supervisor'
        );
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
                    <div className="bg-white/95 dark:bg-gray-800/95 backdrop-blur-md rounded-[2rem] shadow-2xl border border-white dark:border-gray-700 w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-300">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-medium dark:border-gray-700 bg-neutral-light/30 dark:bg-gray-900/30">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-primary/10 rounded-xl flex items-center justify-center text-primary border border-primary/20">
                                    <Users size={18} />
                                </div>
                                <div>
                                    <h2 className="text-base font-black text-neutral-dark dark:text-white tracking-tight leading-tight">Secure Minutes</h2>
                                    <p className="text-[8px] font-black uppercase tracking-[0.2em] text-secondary opacity-50 mt-0.5">Meeting Documentation & Archiving</p>
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

                        <form onSubmit={onSubmit} className="p-6 space-y-4">
                                <MeetingFormFields 
                                    data={data}
                                    setData={setData}
                                    staff={allowedStaffForForm}
                                    toggleStaffSelection={toggleStaffSelection}
                                selectedFile={selectedFile}
                                onFileSelect={onFileSelect}
                                isUploading={isUploading}
                            />

                            <div className="pt-4 border-t border-neutral-medium dark:border-gray-700 mt-2">
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
                                {filteredHistory.map((m: any, rowIndex: number) => {
                                    const attendeeIds = m.userIDs?.split(',') || [];
                                    const attendeeCount = attendeeIds.length;
                                    const showBelow = rowIndex < 2 && rowIndex < filteredHistory.length - 1;

                                    return (
                                        <tr 
                                            key={m.meetingID} 
                                            onClick={() => setSelectedItem(m)}
                                            className="group cursor-pointer transition-all duration-300 hover:bg-primary/[0.02] dark:hover:bg-primary/[0.05] relative hover:z-[50] border-b border-neutral-medium/30 dark:border-gray-800/50"
                                        >
                                            <td className="px-5 py-2.5">
                                                <span className="text-[13px] font-black text-neutral-dark dark:text-white truncate block max-w-[200px] group-hover:text-primary transition-colors">{m.subject}</span>
                                            </td>
                                             <td className="px-5 py-2.5">
                                                <div className="flex -space-x-2.5">
                                                    {attendeeIds.slice(0, 3).map((id: string, idx: number) => {
                                                        const staffMember = staff.find((u: any) => normalizeId(u.id) === normalizeId(id));
                                                        const initials = staffMember ? `${staffMember.firstName[0]}${staffMember.lastName[0]}`.toUpperCase() : '??';
                                                        return (
                                                            <div key={idx} className="w-[30px] h-[30px] rounded-full bg-primary/10 border-2 border-white dark:border-gray-800 flex items-center justify-center overflow-hidden shrink-0 shadow-sm" title={staffMember ? `${staffMember.firstName} ${staffMember.lastName}` : 'User'}>
                                                                {staffMember?.avatarUrl ? (
                                                                    <img src={staffMember.avatarUrl} alt={staffMember.firstName} className="w-full h-full object-cover" />
                                                                ) : (
                                                                    <span className="text-[10px] font-black text-primary">{initials}</span>
                                                                )}
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

                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
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
                                <form onSubmit={onSubmit} className="space-y-6 animate-in slide-in-from-bottom-4 duration-300">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-1 h-4 bg-primary rounded-full" />
                                        <h3 className="text-sm font-black text-neutral-dark dark:text-white uppercase tracking-wider">Update Meeting Details</h3>
                                    </div>
                                    <MeetingFormFields 
                                        data={data}
                                        setData={setData}
                                        staff={allowedStaffForForm}
                                        toggleStaffSelection={toggleStaffSelection}
                                        selectedFile={selectedFile}
                                        onFileSelect={onFileSelect}
                                        isUploading={isSubmitting}
                                    />
                                    <div className="pt-6 border-t border-neutral-medium dark:border-gray-700 flex gap-3">
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
                                    <h3 className="text-sm font-black text-neutral-dark dark:text-white uppercase tracking-wider">Meeting Particulars</h3>
                                </div>
                                <div className="grid grid-cols-2 gap-x-8 gap-y-6 bg-white/80 dark:bg-gray-800/60 backdrop-blur-md rounded-[2rem] border border-white dark:border-gray-700 shadow-xl shadow-primary/5 p-6 relative overflow-hidden group">
                                    <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/5 rounded-full blur-3xl transition-all group-hover:bg-primary/10" />
                                    <div className="space-y-1 relative z-1">
                                        <p className="text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest opacity-50 dark:opacity-100">Date Held</p>
                                        <p className="text-sm font-black text-neutral-dark dark:text-white tracking-tight">{formatDateForUI(selectedItem.date)}</p>
                                    </div>
                                    <div className="space-y-1 relative z-1 col-span-2">
                                        <p className="text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest opacity-50 dark:opacity-100">Minutes of Meeting (MOM)</p>
                                        {selectedItem.momUrl ? (
                                            <div className="flex items-center justify-between group/att bg-neutral-light/30 dark:bg-gray-800/40 p-4 rounded-2xl border border-neutral-medium/30 dark:border-gray-700/50">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/10">
                                                        <FileText size={16} />
                                                    </div>
                                                    <a href={getDriveUrl(selectedItem.momUrl)} target="_blank" rel="noopener noreferrer" className="text-[13px] font-black text-neutral-dark dark:text-white hover:text-primary transition-colors flex items-center gap-2">
                                                        View Meeting Minutes <ExternalLink size={12} />
                                                    </a>
                                                </div>
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
                                    <h3 className="text-sm font-black text-neutral-dark dark:text-white uppercase tracking-wider">Firm Attendees</h3>
                                </div>
                                <div className="bg-white/80 dark:bg-gray-800/60 backdrop-blur-md rounded-[1.5rem] border border-white dark:border-gray-700 shadow-xl shadow-primary/5 p-4">
                                    <div className="grid grid-cols-2 gap-2 max-h-[160px] overflow-y-auto custom-scrollbar pr-1">
                                        {selectedItem.userIDs?.split(',').map((id: string, idx: number) => {
                                            const staffMember = staff.find((u: any) => normalizeId(u.id) === normalizeId(id));
                                            if (!staffMember) return null;
                                            return (
                                                <div key={idx} className="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-primary/5 transition-colors group/staff border border-transparent hover:border-primary/10">
                                                    <div className="w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center overflow-hidden shrink-0 group-hover/staff:scale-110 transition-transform">
                                                        {staffMember.avatarUrl ? (
                                                            <img src={staffMember.avatarUrl} alt={staffMember.firstName} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <span className="text-[8px] font-black text-primary">{staffMember.firstName[0]}{staffMember.lastName[0]}</span>
                                                        )}
                                                    </div>
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
