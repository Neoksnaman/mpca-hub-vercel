import React, { useState, useContext, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { AppContext } from '../App';
import UserHoverCard from '../components/UserHoverCard';
import {
    Loader2,
    Filter,
    FileText,
    Briefcase,
    Calendar,
    CheckSquare,
    Clock,
    AlertCircle,
    Search,
    ChevronRight,
    MoreHorizontal,
    ArrowUpRight,
    CheckCircle2,
    X,
    Plus,
    Edit,
    ChevronDown,
    MoreVertical,
    Trash2,
    AlertTriangle,
    Printer
} from 'lucide-react';
import { UserRole, Status } from '../types';
import { fetchAllData, addRetainerLog, updateRetainerLog, deleteRetainerLog, fetchAuditLogs, addTask, addActivity, updateTask, updateActivity, deleteActivity, deleteTask, updateSpecial, addNotification, fetchSpecialWorklog } from '../services/googleSheetsService';
import { months, computeActualDueDate, parseDateStr } from '../utils/dateUtils';
import { useReactToPrint } from 'react-to-print';
import { SpecialEngagementPrintTemplate } from '../components/SpecialEngagementPrintTemplate';

const normalizeId = (id: any) => String(id || '').trim().replace(/^0+/, '') || '0';

const formatDisplayDate = (dateStr: string) => {
    if (!dateStr || !dateStr.includes('/')) return dateStr;
    const [m, d, y] = dateStr.split('/');
    const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    return date.toLocaleDateString('default', { month: 'long', day: 'numeric', year: 'numeric' });
};

const formatDateForInput = (dateStr: string) => {
    if (!dateStr) return '';
    if (dateStr.includes('-')) return dateStr;
    if (!dateStr.includes('/')) return '';
    const [m, d, y] = dateStr.split('/');
    if (!m || !d || !y) return '';
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
};

const formatAuditTimestamp = (value: string) => {
    if (!value) return '';
    const date = new Date(value);
    if (isNaN(date.getTime())) return value;
    return date.toLocaleString('default', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const formatAuditChangeSummary = (details: any) => {
    const before = details?.before || null;
    const after = details?.after || null;
    const dateChanged = (before?.dateCompleted || '') !== (after?.dateCompleted || '');
    const remarksChanged = (before?.remarks || '') !== (after?.remarks || '');

    if (!before && after?.dateCompleted) {
        return after?.remarks ? `Filed on ${after.dateCompleted} with remarks.` : `Filed on ${after.dateCompleted}.`;
    }
    if (before?.dateCompleted && !after) return before?.remarks ? `Removed filing dated ${before.dateCompleted} and remarks.` : `Removed filing dated ${before.dateCompleted}.`;
    if (dateChanged && remarksChanged) return 'Updated filing date and remarks.';
    if (dateChanged) return 'Updated filing date.';
    if (remarksChanged) return 'Updated filing remarks.';
    return '';
};

const formatAuditDetailValue = (value: any) => {
    const text = String(value ?? '').trim();
    return text || 'Blank';
};

const getRetainerAuditDetailRows = (details: any) => {
    const before = details?.before || {};
    const after = details?.after || {};
    return [
        { key: 'dateCompleted', label: 'Filing Date', before: before.dateCompleted, after: after.dateCompleted },
        { key: 'remarks', label: 'Remarks', before: before.remarks, after: after.remarks }
    ].filter((row) => String(row.before ?? '') !== String(row.after ?? ''));
};

const formatFieldLabel = (key: string) => key
    .replace(/ID$/, '')
    .replace(/Id$/, '')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (char) => char.toUpperCase())
    .trim();

const getSpecialAuditDetailRows = (details: any) => {
    const before = details?.before || {};
    const after = details?.after || {};
    const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
        .filter((key) => !['specialID', 'taskID', 'activityID'].includes(key));
    return keys.filter((key) => String(before[key] ?? '') !== String(after[key] ?? '')).map((key) => ({
        key,
        label: formatFieldLabel(key),
        before: before[key],
        after: after[key]
    }));
};

const formatSpecialAuditChangeSummary = (log: any) => {
    const before = log.details?.before || null;
    const after = log.details?.after || null;
    if (!before || !after) return log.summary || '';

    const changedKeys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
        .filter((key) => !['specialID', 'taskID', 'activityID'].includes(key))
        .filter((key) => String(before[key] ?? '') !== String(after[key] ?? ''));
    if (changedKeys.length === 0) return log.summary || '';

    const formatChangedFields = (keys: string[]) => {
        const labels = keys.map((key) => formatFieldLabel(key).toLowerCase());
        if (labels.length === 1) return labels[0];
        if (labels.length === 2) return labels.join(' and ');
        return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
    };

    if (changedKeys.length === 1) {
        const key = changedKeys[0];
        if (log.action === 'special_progress_updated') {
            return `Updated ${formatChangedFields(changedKeys)} for "${log.details?.taskName || 'task'}".`;
        }
        return `Updated ${formatChangedFields(changedKeys)}.`;
    }
    if (log.action === 'special_progress_updated') {
        return `Updated ${formatChangedFields(changedKeys)} for "${log.details?.taskName || 'task'}".`;
    }
    return `Updated ${formatChangedFields(changedKeys)}.`;
};

const isPeriodBeforeRetainerStart = (startDate: string, monthName: string, year: string | number) => {
    const start = parseDateStr(startDate);
    const monthIndex = months.indexOf(monthName);
    const periodYear = Number(year);
    if (!start || monthIndex === -1 || Number.isNaN(periodYear)) return false;

    const startKey = start.getFullYear() * 12 + start.getMonth();
    const periodKey = periodYear * 12 + monthIndex;
    return periodKey < startKey;
};

const specialStatusOrder: Record<string, number> = {
    Overdue: 0,
    Blocked: 1,
    'In Progress': 2,
    Planning: 3,
    Completed: 4
};

const Engagements: React.FC = () => {
    const context = useContext(AppContext);
    const user = context?.user;
    const retainers = context?.retainers || [];
    const specials = context?.specials || [];
    const clients = context?.clients || [];
    const deliverables = context?.deliverables || [];
    const allUsers = context?.allUsers || [];
    const retainerLogs = context?.retainerLogs || [];

    const location = useLocation();
    const navigate = useNavigate();
    const activeTab: 'Retainer' | 'Special' = location.pathname === '/special-projects' ? 'Special' : 'Retainer';
    const [retainerGroupBy, setRetainerGroupBy] = useState<'None' | 'Client' | 'Compliance' | 'Staff'>('None');
    const [specialGroupBy, setSpecialGroupBy] = useState<'None' | 'Client' | 'Staff' | 'Status'>('Status');
    const [retainerSearchQuery, setRetainerSearchQuery] = useState('');
    const [specialSearchQuery, setSpecialSearchQuery] = useState('');
    const [retainerPage, setRetainerPage] = useState(1);
    const [specialPage, setSpecialPage] = useState(1);
    const [selectedItem, setSelectedItem] = useState<any | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [completionDate, setCompletionDate] = useState(new Date().toISOString().split('T')[0]);
    const [isEditingDate, setIsEditingDate] = useState(false);
    const [remarks, setRemarks] = useState('');
    const [newTaskName, setNewTaskName] = useState('');
    const [isAddingTask, setIsAddingTask] = useState(false);
    const [newActivityDesc, setNewActivityDesc] = useState('');
    const [activityDate, setActivityDate] = useState(new Date().toISOString().split('T')[0]);
    const [addingActivityToTaskId, setAddingActivityToTaskId] = useState<string | null>(null);
    const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
    const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
    const [editTaskName, setEditTaskName] = useState('');
    const [editTaskStatus, setEditTaskStatus] = useState<'Pending' | 'Completed'>('Pending');
    const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
    const [editActivityDesc, setEditActivityDesc] = useState('');
    const [editActivityDate, setEditActivityDate] = useState('');
    const [activeMenuActivityId, setActiveMenuActivityId] = useState<string | null>(null);
    const [worklogTasks, setWorklogTasks] = useState<any[]>([]);
    const [worklogActivities, setWorklogActivities] = useState<any[]>([]);
    const [isWorklogLoading, setIsWorklogLoading] = useState(false);
    const [retainerAuditLogs, setRetainerAuditLogs] = useState<any[]>([]);
    const [isRetainerAuditLoading, setIsRetainerAuditLoading] = useState(false);
    const [retainerAuditPage, setRetainerAuditPage] = useState(1);
    const [retainerAuditTotalPages, setRetainerAuditTotalPages] = useState(1);
    const [expandedRetainerAuditLogId, setExpandedRetainerAuditLogId] = useState<string | null>(null);
    const [specialAuditLogs, setSpecialAuditLogs] = useState<any[]>([]);
    const [isSpecialAuditLoading, setIsSpecialAuditLoading] = useState(false);
    const [specialAuditPage, setSpecialAuditPage] = useState(1);
    const [specialAuditTotalPages, setSpecialAuditTotalPages] = useState(1);
    const [expandedSpecialAuditLogId, setExpandedSpecialAuditLogId] = useState<string | null>(null);
    const [isEditingSpecialInfo, setIsEditingSpecialInfo] = useState(false);
    const [specialEditForm, setSpecialEditForm] = useState({
        serviceId: '',
        projectTitle: '',
        assignedStaffId: '',
        status: 'Planning',
        startDate: '',
        endDate: '',
        description: ''
    });

    const specialPrintRef = useRef<HTMLDivElement>(null);

    const handleSpecialPrint = useReactToPrint({
        contentRef: specialPrintRef,
        documentTitle: selectedItem ? `Special_Engagement_${selectedItem.engagementName || selectedItem.projectTitle || 'Report'}` : 'Special_Engagement_Report'
    });

    // Auto-switch tab based on navigation state
    useEffect(() => {
        if (location.state) {
            const navState = location.state as any;
            const targetTab = navState.activeTab;
            if (targetTab === 'Special' && location.pathname !== '/special-projects') {
                navigate('/special-projects', { replace: true, state: location.state });
                return;
            }
            if (targetTab === 'Retainer' && location.pathname !== '/retainers') {
                navigate('/retainers', { replace: true, state: location.state });
                return;
            }
            
            if (navState.specialId && specials.length > 0) {
                if (location.pathname !== '/special-projects') {
                    navigate('/special-projects', { replace: true, state: location.state });
                    return;
                }
                const targetSpecialId = navState.specialId;
                const specialObj = specials.find(s => normalizeId(s.id) === normalizeId(targetSpecialId));
                if (specialObj) {
                    const client = clients.find(c => normalizeId(c.id) === normalizeId(specialObj.clientId));
                    setSelectedItem({
                        ...specialObj,
                        clientName: client?.name || 'Unknown Client',
                        engagementName: specialObj.projectTitle || specialObj.serviceName || specialObj.serviceType,
                        priority: specialObj.priority || 'Medium'
                    });
                    setIsDetailOpen(true);
                }
            }

            // Clear state after using it to prevent sticky tab on refresh
            window.history.replaceState({}, document.title);
        }
    }, [location.state, location.pathname, specials, clients, navigate]);

    useEffect(() => {
        if (!isDetailOpen || activeTab !== 'Special') {
            setIsEditingSpecialInfo(false);
        }
    }, [activeTab, isDetailOpen, selectedItem?.id]);

    const [showDeleteActivityModal, setShowDeleteActivityModal] = useState(false);
    const [activityToDelete, setActivityToDelete] = useState<any | null>(null);
    const [showDeleteTaskModal, setShowDeleteTaskModal] = useState(false);
    const [taskToDelete, setTaskToDelete] = useState<any | null>(null);
    const [showUnfileModal, setShowUnfileModal] = useState(false);
    const [logToUnfile, setLogToUnfile] = useState<any | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const canDeleteSpecialWork = useMemo(() => {
        if (!user || !selectedItem?.assignedStaff) return false;
        if (user.role === UserRole.ADMIN || user.role === UserRole.MANAGER || user.role === UserRole.SUPERVISOR) return true;

        const assignedUser = allUsers.find(u =>
            normalizeId(u.id) === normalizeId(selectedItem.assignedStaff) ||
            u.firstName === selectedItem.assignedStaff ||
            `${u.firstName} ${u.lastName}` === selectedItem.assignedStaff
        );

        if (!assignedUser) return false;
        if (normalizeId(assignedUser.id) === normalizeId(user.id)) return true;

        return user.role === UserRole.SENIOR &&
            assignedUser.role === UserRole.STAFF &&
            assignedUser.team === user.team;
    }, [user, selectedItem?.assignedStaff, allUsers]);

    // Click outside handler for activity menu
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setActiveMenuActivityId(null);
            }
        };

        if (activeMenuActivityId) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [activeMenuActivityId]);

    const loadSpecialWorklog = async (specialID: string) => {
        setIsWorklogLoading(true);
        try {
            const worklog = await fetchSpecialWorklog(specialID);
            setWorklogTasks(worklog.taskLog || []);
            setWorklogActivities(worklog.activityLog || []);
        } catch (error: any) {
            context?.showToast?.(error.message || 'Failed to load project worklog', 'error');
            setWorklogTasks([]);
            setWorklogActivities([]);
        } finally {
            setIsWorklogLoading(false);
        }
    };

    useEffect(() => {
        if (isDetailOpen && activeTab === 'Special' && selectedItem?.id) {
            loadSpecialWorklog(selectedItem.id);
        } else if (!isDetailOpen) {
            setWorklogTasks([]);
            setWorklogActivities([]);
        }
    }, [isDetailOpen, activeTab, selectedItem?.id]);

    const toggleTaskExpansion = (taskId: string) => {
        const newSet = new Set(expandedTasks);
        if (newSet.has(taskId)) newSet.delete(taskId);
        else newSet.add(taskId);
        setExpandedTasks(newSet);
    };

    const handleMarkAsFiled = async (id: string) => {
        if (!selectedItem) return;
        setIsProcessing(true);
        try {
            // Format date from YYYY-MM-DD to MM/DD/YYYY
            const [y, m, d] = completionDate.split('-');
            const formattedDate = `${m}/${d}/${y}`;

            if (isEditingDate) {
                const result = await updateRetainerLog({
                    deadline: id,
                    period: selectedItem.periodKey,
                    dateCompleted: formattedDate,
                    remarks: remarks
                });
                context?.showToast(result?.unchanged ? 'No changes to save.' : 'Log entry updated successfully', result?.unchanged ? 'info' : 'success');
                setIsEditingDate(false);
                if (result?.unchanged) return;
            } else {
                const result = await addRetainerLog({
                    deadline: id,
                    period: selectedItem.periodKey,
                    dateCompleted: formattedDate,
                    remarks: remarks
                });
                context?.showToast(result?.unchanged ? 'No changes to save.' : 'Compliance marked as Filed successfully', result?.unchanged ? 'info' : 'success');
                if (result?.unchanged) return;
                if (!result?.unchanged) setIsDetailOpen(false);
            }
            context?.refreshData();
            if (isDetailOpen) loadRetainerAuditLogs(selectedItem);
        } catch (err: any) {
            context?.showToast(err.message || 'Failed to update status', 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleUnfileRetainerLog = async () => {
        if (!logToUnfile) return;
        setIsProcessing(true);
        try {
            await deleteRetainerLog(logToUnfile.id, logToUnfile.periodKey);
            context?.showToast('Compliance filing removed successfully', 'success');
            setShowUnfileModal(false);
            setLogToUnfile(null);
            setIsEditingDate(false);
            await context?.refreshData();
            await loadRetainerAuditLogs(logToUnfile);
        } catch (err: any) {
            context?.showToast(err.message || 'Failed to remove filing', 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    const getUserIdFromDisplayName = useCallback((staffName: string) => {
        const normalizedName = String(staffName || '').trim().toLowerCase();
        const staff = allUsers.find(u => {
            const fullName = `${u.firstName || ''} ${u.lastName || ''}`.trim().toLowerCase();
            return fullName === normalizedName || String(u.firstName || '').trim().toLowerCase() === normalizedName || String(u.id || '') === staffName;
        });
        return staff?.id || staffName || '';
    }, [allUsers]);

    const activeAssignableUsers = useMemo(() => {
        if (!user) return [];

        return [...allUsers]
            .filter(u => {
                if (u.status !== 'Active') return false;

                if (u.role === UserRole.STAFF || u.role === UserRole.SENIOR) {
                    if (user.role === UserRole.SENIOR) return u.team === user.team;
                    return true;
                }

                if (u.role === UserRole.MANAGER || u.role === UserRole.SUPERVISOR) {
                    if (user.role === UserRole.ADMIN) return true;
                    return u.id === user.id;
                }

                if (u.role === UserRole.ADMIN) {
                    return user.role === UserRole.ADMIN;
                }

                return false;
            })
            .sort((a, b) => `${a.firstName || ''} ${a.lastName || ''}`.trim().localeCompare(`${b.firstName || ''} ${b.lastName || ''}`.trim()));
    }, [allUsers, user]);

    const specialProjectServices = useMemo(() => {
        return (context?.services || [])
            .filter((s: any) => String(s.type || '').trim().toLowerCase() === 'special')
            .sort((a: any, b: any) => String(a.name || '').localeCompare(String(b.name || '')));
    }, [context?.services]);

    const startEditingSpecialInfo = (item: any) => {
        setSpecialEditForm({
            serviceId: item.serviceType || '',
            projectTitle: item.engagementName || item.projectTitle || '',
            assignedStaffId: getUserIdFromDisplayName(item.assignedStaff),
            status: item.status || 'Planning',
            startDate: formatDateForInput(item.startDate),
            endDate: formatDateForInput(item.endDate),
            description: item.description || ''
        });
        setIsEditingSpecialInfo(true);
    };

    const cancelEditingSpecialInfo = () => {
        setIsEditingSpecialInfo(false);
    };

    const handleSaveSpecialInfo = async () => {
        if (!selectedItem || isProcessing) return;
        if (!specialEditForm.projectTitle.trim() || !specialEditForm.serviceId || !specialEditForm.assignedStaffId) {
            context?.showToast('Project type, title, and assignee are required.', 'error');
            return;
        }

        if (specialEditForm.status === 'Completed') {
            const incompleteTasks = worklogTasks.filter(t => t.status !== 'Completed');
            if (incompleteTasks.length > 0) {
                context?.showToast(`Cannot complete engagement. ${incompleteTasks.length} task(s) are still pending.`, 'error');
                return;
            }
        }

        setIsProcessing(true);
        try {
            const oldAssignedStaffId = getUserIdFromDisplayName(selectedItem.assignedStaff);
            const result = await updateSpecial(selectedItem.id, {
                assignedStaffId: specialEditForm.assignedStaffId,
                serviceId: specialEditForm.serviceId,
                projectTitle: specialEditForm.projectTitle.trim(),
                startDate: specialEditForm.startDate,
                endDate: specialEditForm.endDate,
                status: specialEditForm.status,
                description: specialEditForm.description
            });
            if (result?.unchanged) {
                context?.showToast('No changes to save.', 'info');
                setIsEditingSpecialInfo(false);
                return;
            }

            if (oldAssignedStaffId !== specialEditForm.assignedStaffId && specialEditForm.assignedStaffId && specialEditForm.assignedStaffId !== user?.id) {
                const clientName = lookupMaps.clientById.get(normalizeId(selectedItem.clientId))?.name || selectedItem.clientName || 'a client';
                await addNotification({
                    userId: specialEditForm.assignedStaffId,
                    title: 'Special Project Assignment Updated',
                    message: `You have been assigned to project "${specialEditForm.projectTitle}" for ${clientName}.`,
                    type: 'Engagement',
                    link: `/special-projects`
                }).catch(() => {});
            }

            const assignedUser = allUsers.find(u => String(u.id) === String(specialEditForm.assignedStaffId));
            const service = specialProjectServices.find((s: any) => String(s.id) === String(specialEditForm.serviceId));
            setSelectedItem({
                ...selectedItem,
                serviceType: specialEditForm.serviceId,
                serviceName: service?.name || selectedItem.serviceName,
                engagementName: specialEditForm.projectTitle.trim(),
                projectTitle: specialEditForm.projectTitle.trim(),
                assignedStaff: assignedUser ? `${assignedUser.firstName} ${assignedUser.lastName}`.trim() : selectedItem.assignedStaff,
                status: specialEditForm.status,
                startDate: specialEditForm.startDate,
                endDate: specialEditForm.endDate,
                description: specialEditForm.description
            });
            context?.showToast('Special project updated successfully!', 'success');
            setIsEditingSpecialInfo(false);
            await context?.refreshData();
            await loadSpecialAuditLogs(selectedItem);
        } catch (err: any) {
            context?.showToast(err.message || 'Failed to update special project', 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleAddTask = async () => {
        if (!selectedItem || !newTaskName) return;
        setIsProcessing(true);
        try {
            await addTask({
                specialID: selectedItem.id,
                taskName: newTaskName,
                status: 'Pending'
            });
            context?.showToast('Task added successfully!', 'success');
            await loadSpecialWorklog(selectedItem.id);
            await loadSpecialAuditLogs(selectedItem);
            setIsAddingTask(false);
            setNewTaskName('');
        } catch (error: any) {
            context?.showToast('Failed to add task: ' + error.message, 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleUpdateTask = async (taskId: string) => {
        setIsProcessing(true);
        try {
            await updateTask(taskId, {
                taskName: editTaskName,
                status: editTaskStatus
            });

            const taskObj = worklogTasks.find(t => t.taskID === taskId);
            const specialEng = context?.specials.find(s => s.id === taskObj?.specialID);
            if (specialEng?.assignedStaff) {
                 const staffObj = allUsers.find(u => `${u.firstName} ${u.lastName}` === specialEng.assignedStaff || u.firstName === specialEng.assignedStaff);
                 if (staffObj && staffObj.id !== user?.id) {
                     await addNotification({
                         userId: staffObj.id,
                         title: 'Task Updated',
                         message: `Task "${editTaskName}" was updated to ${editTaskStatus}.`,
                         type: 'Engagement',
                         link: '/special-projects'
                     }).catch(() => {});
                 }
            }

            context?.showToast('Task updated successfully!', 'success');
            if (selectedItem?.id) await loadSpecialWorklog(selectedItem.id);
            if (selectedItem?.id) await loadSpecialAuditLogs(selectedItem);
            setEditingTaskId(null);
        } catch (error: any) {
            context?.showToast('Failed to update task: ' + error.message, 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleAddActivity = async (taskID: string) => {
        if (!newActivityDesc || !activityDate || !context) return;

        setIsProcessing(true);
        try {
            // Format date from YYYY-MM-DD to MM/DD/YYYY
            const [y, m, d] = activityDate.split('-');
            const formattedDate = `${m}/${d}/${y}`;

            const newActivity = {
                taskID: taskID,
                dateCompleted: formattedDate,
                description: newActivityDesc
            };

            const success = await addActivity(newActivity);
            if (success) {
                const taskObj = worklogTasks.find(t => t.taskID === taskID);
                const specialEng = context.specials.find(s => s.id === taskObj?.specialID);
                if (specialEng?.assignedStaff) {
                     const staffObj = allUsers.find(u => `${u.firstName} ${u.lastName}` === specialEng.assignedStaff || u.firstName === specialEng.assignedStaff);
                     if (staffObj && staffObj.id !== user?.id) {
                         await addNotification({
                             userId: staffObj.id,
                             title: 'New Activity Logged',
                             message: `Progress logged on task "${taskObj?.taskName}": ${newActivityDesc}`,
                             type: 'Engagement',
                             link: '/special-projects'
                         }).catch(() => {});
                     }
                }

                setAddingActivityToTaskId(null);
                setNewActivityDesc('');
                context.showToast?.('Progress logged successfully!', 'success');
                if (selectedItem?.id) await loadSpecialWorklog(selectedItem.id);
                if (selectedItem?.id) await loadSpecialAuditLogs(selectedItem);
            }
        } catch (error: any) {
            context.showToast?.('Failed to log progress: ' + error.message, 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleUpdateActivity = async (activityID: string) => {
        if (!editActivityDesc || !editActivityDate || !context) return;

        setIsProcessing(true);
        try {
            const [y, m, d] = editActivityDate.split('-');
            const formattedDate = `${m}/${d}/${y}`;

            const success = await updateActivity(activityID, {
                description: editActivityDesc,
                dateCompleted: formattedDate
            });

            if (success) {
                const actObj = worklogActivities.find(a => a.activityID === activityID);
                const taskObj = worklogTasks.find(t => t.taskID === actObj?.taskID);
                const specialEng = context.specials.find(s => s.id === taskObj?.specialID);
                if (specialEng?.assignedStaff) {
                     const staffObj = allUsers.find(u => `${u.firstName} ${u.lastName}` === specialEng.assignedStaff || u.firstName === specialEng.assignedStaff);
                     if (staffObj && staffObj.id !== user?.id) {
                         await addNotification({
                             userId: staffObj.id,
                             title: 'Activity Updated',
                             message: `Activity updated for task "${taskObj?.taskName}".`,
                             type: 'Engagement',
                             link: '/special-projects'
                         }).catch(() => {});
                     }
                }

                setEditingActivityId(null);
                context.showToast?.('Activity updated successfully!', 'success');
                if (selectedItem?.id) await loadSpecialWorklog(selectedItem.id);
                if (selectedItem?.id) await loadSpecialAuditLogs(selectedItem);
            }
        } catch (error: any) {
            context.showToast?.('Failed to update activity: ' + error.message, 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDeleteActivity = async () => {
        if (!activityToDelete || !context) return;

        setIsProcessing(true);
        try {
            const success = await deleteActivity(activityToDelete.activityID);
            if (success) {
                setShowDeleteActivityModal(false);
                setActivityToDelete(null);
                context.showToast?.('Activity log deleted successfully!', 'success');
                if (selectedItem?.id) await loadSpecialWorklog(selectedItem.id);
                if (selectedItem?.id) await loadSpecialAuditLogs(selectedItem);
            }
        } catch (error: any) {
            context.showToast?.('Failed to delete activity: ' + error.message, 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDeleteTask = async () => {
        if (!taskToDelete || !context) return;

        setIsProcessing(true);
        try {
            const success = await deleteTask(taskToDelete.taskID);
            if (success) {
                setShowDeleteTaskModal(false);
                setTaskToDelete(null);
                context.showToast?.('Task and all associated progress logs deleted successfully!', 'success');
                if (selectedItem?.id) await loadSpecialWorklog(selectedItem.id);
                if (selectedItem?.id) await loadSpecialAuditLogs(selectedItem);
            }
        } catch (error: any) {
            context.showToast?.('Failed to delete task: ' + error.message, 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    // Retainer Filters
    const [retainerFilter, setRetainerFilter] = useState({
        client: 'All',
        month: new Date(new Date().setMonth(new Date().getMonth() - 1)).toLocaleString('default', { month: 'long' }),
        year: String(new Date().getFullYear()),
        compliance: 'All',
        status: 'All'
    });
    const years = Array.from({ length: 25 }, (_, i) => String(2026 + i));

    // Special Filters
    const [specialFilter, setSpecialFilter] = useState({
        staff: 'All',
        status: 'All',
        priority: 'All',
        due: 'All'
    });
    const pageSize = 25;

    const isManagerOrAbove = user?.role === UserRole.MANAGER || user?.role === UserRole.SUPERVISOR || user?.role === UserRole.ADMIN;
    const canUseRetainerStaffOverview = isManagerOrAbove || user?.role === UserRole.SENIOR;

    const hasAppliedRetainerDefaultGroup = useRef(false);

    useEffect(() => {
        if (!hasAppliedRetainerDefaultGroup.current && canUseRetainerStaffOverview) {
            setRetainerGroupBy('Staff');
            hasAppliedRetainerDefaultGroup.current = true;
        }
    }, [canUseRetainerStaffOverview]);

    const lookupMaps = useMemo(() => {
        const retainerById = new Map<string, any>();
        retainers.forEach(r => retainerById.set(normalizeId(r.id), r));

        const clientById = new Map<string, any>();
        clients.forEach(c => clientById.set(normalizeId(c.id), c));

        const taxById = new Map<string, any>();
        (context?.taxCompliances || []).forEach(tc => taxById.set(normalizeId(tc.taxID), tc));

        const govtById = new Map<string, any>();
        (context?.govtContributions || []).forEach(gc => govtById.set(normalizeId(gc.id), gc));

        const serviceSubItemByServiceAndId = new Map<string, any>();
        (context?.serviceSubItems || []).forEach(item => {
            const itemId = String(item.subItemID || item.id || item._id || '').trim();
            serviceSubItemByServiceAndId.set(`${normalizeId(item.serviceID)}:${normalizeId(itemId)}`, item);
        });

        const serviceById = new Map<string, any>();
        (context?.services || []).forEach(s => serviceById.set(normalizeId(s.id), s));

        const userByName = new Map<string, any>();
        allUsers.forEach(u => {
            userByName.set(String(u.id), u);
            userByName.set(u.firstName, u);
            userByName.set(`${u.firstName} ${u.lastName}`, u);
        });

        const retainerLogByDeadlinePeriod = new Map<string, any[]>();
        retainerLogs.forEach(l => retainerLogByDeadlinePeriod.set(`${normalizeId(l[0])}|${l[1]}`, l));

        return { retainerById, clientById, taxById, govtById, serviceSubItemByServiceAndId, serviceById, userByName, retainerLogByDeadlinePeriod };
    }, [retainers, clients, context?.taxCompliances, context?.govtContributions, context?.serviceSubItems, context?.services, allUsers, retainerLogs]);

    const formatSpecialAuditDetailValue = useCallback((key: string, value: any) => {
        const text = formatAuditDetailValue(value);
        if (text === 'Blank') return text;
        if (key === 'assignedStaffID') {
            const staff = lookupMaps.userByName.get(String(value)) || lookupMaps.userByName.get(normalizeId(value));
            const name = staff ? `${staff.firstName || ''} ${staff.lastName || ''}`.trim() : '';
            return name || text;
        }
        if (key === 'serviceID') {
            const service = lookupMaps.serviceById.get(normalizeId(value));
            return service?.name || service?.serviceName || text;
        }
        return text;
    }, [lookupMaps.serviceById, lookupMaps.userByName]);

    const isAssignedVisible = useCallback((assignedStaff: string) => {
        if (isManagerOrAbove) return true;
        const staffName = String(assignedStaff || '').trim();
        const isOwn = staffName === user?.firstName || staffName === `${user?.firstName} ${user?.lastName}`;
        if (user?.role === UserRole.STAFF) return isOwn;
        if (user?.role === UserRole.SENIOR) {
            const staff = lookupMaps.userByName.get(staffName);
            return isOwn || staff?.team === user.team;
        }
        return true;
    }, [isManagerOrAbove, lookupMaps.userByName, user]);

    const calendarOnlyTaxIDs = useMemo(() => new Set(['0007', '0008', '0012', '0013', '0016', '0017', '0018', '0019', '0020', '0021', '0022'].map(id => normalizeId(id))), []);
    const no4thQtrTaxIDs = useMemo(() => new Set(['0009', '0010', '0014', '0015'].map(id => normalizeId(id))), []);

    useEffect(() => {
        if (selectedItem) {
            setCompletionDate(new Date().toISOString().split('T')[0]);
            setIsEditingDate(false);
            setRemarks(selectedItem.remarks || '');
        }

        if (!isDetailOpen) {
            setEditingTaskId(null);
            setEditingActivityId(null);
            setIsAddingTask(false);
            setAddingActivityToTaskId(null);
            setActiveMenuActivityId(null);
            setNewTaskName('');
            setNewActivityDesc('');
            setExpandedRetainerAuditLogId(null);
            setExpandedSpecialAuditLogId(null);
        }
    }, [selectedItem, isDetailOpen]);




    const loadRetainerAuditLogs = useCallback(async (item = selectedItem, page = 1) => {
        if (!item || activeTab !== 'Retainer') {
            setRetainerAuditLogs([]);
            setRetainerAuditPage(1);
            setRetainerAuditTotalPages(1);
            return;
        }

        setIsRetainerAuditLoading(true);
        try {
            const result = await fetchAuditLogs({
                entityType: 'retainerFiling',
                entityId: item.id,
                period: item.periodKey,
                limit: 5,
                page
            });
            setRetainerAuditLogs(result.logs);
            setRetainerAuditPage(result.page);
            setRetainerAuditTotalPages(result.totalPages);
            setExpandedRetainerAuditLogId(null);
        } catch (err) {
            setRetainerAuditLogs([]);
            setRetainerAuditPage(1);
            setRetainerAuditTotalPages(1);
            setExpandedRetainerAuditLogId(null);
        } finally {
            setIsRetainerAuditLoading(false);
        }
    }, [activeTab, selectedItem]);

    useEffect(() => {
        if (isDetailOpen && activeTab === 'Retainer' && selectedItem) {
            loadRetainerAuditLogs(selectedItem, 1);
        } else {
            setRetainerAuditLogs([]);
            setRetainerAuditPage(1);
            setRetainerAuditTotalPages(1);
        }
    }, [activeTab, isDetailOpen, loadRetainerAuditLogs, selectedItem]);

    const loadSpecialAuditLogs = useCallback(async (item = selectedItem, page = 1) => {
        if (!item || activeTab !== 'Special') {
            setSpecialAuditLogs([]);
            setSpecialAuditPage(1);
            setSpecialAuditTotalPages(1);
            return;
        }

        setIsSpecialAuditLoading(true);
        try {
            const result = await fetchAuditLogs({
                entityType: 'specialProject',
                entityId: item.id,
                limit: 5,
                page
            });
            setSpecialAuditLogs(result.logs);
            setSpecialAuditPage(result.page);
            setSpecialAuditTotalPages(result.totalPages);
            setExpandedSpecialAuditLogId(null);
        } catch (err) {
            setSpecialAuditLogs([]);
            setSpecialAuditPage(1);
            setSpecialAuditTotalPages(1);
            setExpandedSpecialAuditLogId(null);
        } finally {
            setIsSpecialAuditLoading(false);
        }
    }, [activeTab, selectedItem]);

    useEffect(() => {
        if (isDetailOpen && activeTab === 'Special' && selectedItem) {
            loadSpecialAuditLogs(selectedItem, 1);
        } else {
            setSpecialAuditLogs([]);
            setSpecialAuditPage(1);
            setSpecialAuditTotalPages(1);
        }
    }, [activeTab, isDetailOpen, loadSpecialAuditLogs, selectedItem]);

    // --- Tab 1: Retainer Monitoring Logic ---
    const retainerAvailableInstances = useMemo(() => {
        if (activeTab !== 'Retainer') return [];
        const deadlines = context?.deadlines || [];
        const currentMonth = retainerFilter.month;
        const currentYear = retainerFilter.year;

        const instances = deadlines.map(d => {
            const retainer = lookupMaps.retainerById.get(normalizeId(d.retainerID));
            if (!retainer) return null;

            const client = lookupMaps.clientById.get(normalizeId(retainer.clientId));
            if (!client || client.status === 'Inactive') return null;
            if (isPeriodBeforeRetainerStart(retainer.startDate, currentMonth, currentYear)) return null;

            const normalizedServiceID = normalizeId(d.serviceID);
            const compliance = d.taxID
                ? (lookupMaps.serviceSubItemByServiceAndId.get(`${normalizedServiceID}:${normalizeId(d.taxID)}`)
                    || (normalizedServiceID === '2'
                        ? lookupMaps.govtById.get(normalizeId(d.taxID))
                        : lookupMaps.taxById.get(normalizeId(d.taxID))))
                : null;
            const service = !d.taxID ? lookupMaps.serviceById.get(normalizeId(d.serviceID)) : null;

            const complianceName = compliance?.name || compliance?.complianceName || service?.name || 'General Compliance';

            // Frequency Check: Should this show up in this month?
            const frequency = d.dueDate.startsWith('M') ? 'Monthly' :
                d.dueDate.startsWith('Q') ? 'Quarterly' :
                    (d.dueDate.startsWith('Y') || d.dueDate.startsWith('A')) ? 'Annual' : 'Monthly';

            const isCalendarOnly = calendarOnlyTaxIDs.has(normalizeId(d.taxID));

            const fyMonth = isCalendarOnly ? 12 : (client?.fiscalYearEnd ? parseInt(client.fiscalYearEnd.split('/')[0]) : 12);
            const monthIdx = months.indexOf(currentMonth) + 1;
            const normalizedTaxID = normalizeId(d.taxID);

            // Special Rule: 0619E (0001) and 0619F (0002) have no March, June, September, and December
            if (['1', '2'].includes(normalizedTaxID)) {
                if ([3, 6, 9, 12].includes(monthIdx)) return null;
            }

            if (frequency === 'Quarterly') {
                const diff = (monthIdx - fyMonth + 12) % 3;
                if (diff !== 0) return null;

                // Special Rule: Some IDs have no 4th Qtr
                if (no4thQtrTaxIDs.has(normalizedTaxID) && monthIdx === fyMonth) {
                    return null;
                }
            } else if (frequency === 'Annual') {
                if (monthIdx !== fyMonth) return null;
            }

            const dueInfo = computeActualDueDate(currentMonth, currentYear, d.dueDate, isCalendarOnly ? '12/31' : (client?.fiscalYearEnd || '12/31'));
            const periodKey = `${String(monthIdx).padStart(2, '0')}/${currentYear}`;
            const match = lookupMaps.retainerLogByDeadlinePeriod.get(`${normalizeId(d.deadlineID)}|${periodKey}`);

            return {
                id: d.deadlineID,
                clientName: client?.name || 'Unknown Client',
                complianceName: complianceName,
                taxPeriod: `${currentMonth} ${currentYear}`,
                periodKey: periodKey,
                dueDate: dueInfo.formatted,
                actualDueDate: dueInfo.raw,
                status: (() => {
                    if (match) {
                        const dateFiledStr = match[2];
                        if (dateFiledStr) {
                            const [m, day, y] = dateFiledStr.split('/');
                            const dateFiledObj = new Date(parseInt(y), parseInt(m) - 1, parseInt(day));

                            // Standardize both to Noon for safe comparison
                            const compareDue = new Date(dueInfo.raw);
                            compareDue.setHours(12, 0, 0, 0);
                            dateFiledObj.setHours(12, 0, 0, 0);

                            if (dateFiledObj > compareDue) {
                                return 'LATE';
                            }
                        }
                        return 'Filed';
                    }
                    return 'Pending';
                })(),
                dateFiled: match?.[2] || null,
                remarks: match?.[3] || '',
                assignedStaff: retainer.assignedStaff,
                complianceCode: compliance?.code || compliance?.complianceCode || service?.name || d.serviceID,
                frequency: frequency,
                dueDateCode: d.dueDate,
                taxID: d.taxID
            };
        }).filter(Boolean).filter(d => {
            // Client Filter
            if (retainerFilter.client !== 'All' && d!.clientName !== retainerFilter.client) return false;

            // Compliance Filter
            if (retainerFilter.compliance !== 'All') {
                if (d!.complianceCode !== retainerFilter.compliance) return false;
            }

            if (retainerFilter.status !== 'All' && d!.status !== retainerFilter.status) return false;

            return true;
        }) as any[];

        const filtered = instances.filter(d => {
            // Role Based Visibility
            return isAssignedVisible(d!.assignedStaff);
        }).sort((a, b) => {
            const statusRank: Record<string, number> = { LATE: 0, Pending: 1, Filed: 2 };
            const statusDiff = (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9);
            if (statusDiff !== 0) return statusDiff;
            return a.actualDueDate.getTime() - b.actualDueDate.getTime();
        });

        return filtered;
    }, [activeTab, context?.deadlines, retainerFilter, lookupMaps, calendarOnlyTaxIDs, no4thQtrTaxIDs, isAssignedVisible]);

    const retainerInstances = useMemo(() => {
        const search = retainerSearchQuery.trim().toLowerCase();
        if (!search) return retainerAvailableInstances;

        return retainerAvailableInstances.filter(inst =>
            inst.clientName.toLowerCase().includes(search) ||
            inst.complianceName.toLowerCase().includes(search) ||
            String(inst.assignedStaff || '').toLowerCase().includes(search)
        );
    }, [retainerAvailableInstances, retainerSearchQuery]);

    // Dynamic Filter Options based on Role and Time
    const availableRetainerCompliances = useMemo(() => {
        if (activeTab !== 'Retainer') return [];
        const deadlines = context?.deadlines || [];
        const currentMonth = retainerFilter.month;

        return Array.from(new Set(
            deadlines.map(d => {
                const retainer = lookupMaps.retainerById.get(normalizeId(d.retainerID));
                if (!retainer) return null;

                if (!isAssignedVisible(retainer.assignedStaff)) return null;

                const client = lookupMaps.clientById.get(normalizeId(retainer.clientId));
                if (!client || client.status === 'Inactive') return null;
                if (retainerFilter.client !== 'All' && client?.name !== retainerFilter.client) return null;
                if (isPeriodBeforeRetainerStart(retainer.startDate, currentMonth, retainerFilter.year)) return null;

                // Frequency Check
                const frequency = d.dueDate.startsWith('M') ? 'Monthly' :
                    d.dueDate.startsWith('Q') ? 'Quarterly' :
                        (d.dueDate.startsWith('Y') || d.dueDate.startsWith('A')) ? 'Annual' : 'Monthly';

                const isCalendarOnly = calendarOnlyTaxIDs.has(normalizeId(d.taxID));
                const fyMonth = isCalendarOnly ? 12 : (client?.fiscalYearEnd ? parseInt(client.fiscalYearEnd.split('/')[0]) : 12);
                const monthIdx = months.indexOf(currentMonth) + 1;
                const normalizedTaxID = normalizeId(d.taxID);

                // Special Rule: 0619E (0001) and 0619F (0002) have no March, June, September, and December
                if (['1', '2'].includes(normalizedTaxID)) {
                    if ([3, 6, 9, 12].includes(monthIdx)) return null;
                }

                if (frequency === 'Quarterly') {
                    const diff = (monthIdx - fyMonth + 12) % 3;
                    if (diff !== 0) return null;
                } else if (frequency === 'Annual') {
                    if (monthIdx !== fyMonth) return null;
                }

                const normalizedServiceID = normalizeId(d.serviceID);
                const compliance = d.taxID
                    ? (lookupMaps.serviceSubItemByServiceAndId.get(`${normalizedServiceID}:${normalizeId(d.taxID)}`)
                        || (normalizedServiceID === '2'
                            ? lookupMaps.govtById.get(normalizeId(d.taxID))
                            : lookupMaps.taxById.get(normalizeId(d.taxID))))
                    : null;
                const service = !d.taxID ? lookupMaps.serviceById.get(normalizeId(d.serviceID)) : null;
                return compliance?.code || compliance?.complianceCode || service?.name || d.serviceID;
            }).filter(Boolean)
        )).sort();
    }, [activeTab, context?.deadlines, lookupMaps, retainerFilter.month, retainerFilter.year, retainerFilter.client, isAssignedVisible, calendarOnlyTaxIDs]);

    // --- Tab 2: Special Engagements Logic ---
    // Dynamic Filter Options for Specials
    const availableSpecialStaff = useMemo(() => {
        if (activeTab !== 'Special') return [];
        const activeStaffNames = new Set(allUsers
            .filter(u => u.status === 'Active')
            .map(u => `${u.firstName} ${u.lastName}`));
        return Array.from(new Set(
            specials.map(s => {
                const client = lookupMaps.clientById.get(normalizeId(s.clientId));
                if (!client || client.status === 'Inactive') return null;

                // Role Based Visibility
                if (!isAssignedVisible(s.assignedStaff)) return null;
                if (!activeStaffNames.has(s.assignedStaff)) return null;

                return s.assignedStaff;
            }).filter(Boolean)
        )).sort();
    }, [activeTab, specials, lookupMaps.clientById, isAssignedVisible, allUsers]);

    const specialAvailableInstances = useMemo(() => {
        if (activeTab !== 'Special') return [];
        return specials.map(s => {
            const client = lookupMaps.clientById.get(normalizeId(s.clientId));
            if (!client || client.status === 'Inactive') return null;

            let displayStatus = s.status;
            if (s.status !== 'Completed' && s.endDate) {
                try {
                    const [m, d, y] = s.endDate.split('/');
                    const endDate = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
                    endDate.setHours(23, 59, 59, 999);
                    if (new Date() > endDate) displayStatus = 'Overdue';
                } catch (e) {}
            }

            return {
                ...s,
                clientName: client?.name || 'Unknown Client',
                engagementName: s.projectTitle || s.serviceName || s.serviceType,
                displayStatus,
                priority: s.priority || 'Medium' // Defaulting for now
            };
        }).filter(Boolean).filter(s => {
            if (!s) return false;
            // Role Based Visibility (Keep this for the actual list)
            if (!isAssignedVisible(s.assignedStaff)) return false;

            // Filters
            if (specialFilter.staff !== 'All' && s.assignedStaff !== specialFilter.staff) return false;
            if (specialFilter.priority !== 'All' && s.priority !== specialFilter.priority) return false;

            // Status filter uses computed display status (accounts for Overdue)
            if (specialFilter.status !== 'All') {
                if (s.displayStatus !== specialFilter.status) return false;
            }

            return true;
        }).sort((a, b) => {
            const dateA = new Date(a.endDate || 0);
            const dateB = new Date(b.endDate || 0);
            return dateA.getTime() - dateB.getTime();
        });
    }, [activeTab, specials, lookupMaps.clientById, specialFilter, isAssignedVisible]);

    const specialInstances = useMemo(() => {
        const search = specialSearchQuery.trim().toLowerCase();
        if (!search) return specialAvailableInstances;

        return specialAvailableInstances.filter(inst =>
            inst.clientName.toLowerCase().includes(search) ||
            inst.engagementName.toLowerCase().includes(search) ||
            String(inst.assignedStaff || '').toLowerCase().includes(search)
        );
    }, [specialAvailableInstances, specialSearchQuery]);

    useEffect(() => {
        setRetainerPage(1);
    }, [retainerFilter, retainerSearchQuery, retainerGroupBy]);

    useEffect(() => {
        setSpecialPage(1);
    }, [specialFilter, specialSearchQuery, specialGroupBy]);

    const paginatedRetainerInstances = useMemo(() => {
        if (retainerGroupBy !== 'None') return retainerInstances;
        const start = (retainerPage - 1) * pageSize;
        return retainerInstances.slice(start, start + pageSize);
    }, [retainerInstances, retainerPage, retainerGroupBy]);

    const paginatedSpecialInstances = useMemo(() => {
        if (specialGroupBy !== 'None') return specialInstances;
        const start = (specialPage - 1) * pageSize;
        return specialInstances.slice(start, start + pageSize);
    }, [specialInstances, specialPage, specialGroupBy]);

    const retainerSummary = useMemo(() => {
        const staffNames = new Set<string>();
        const summary = retainerAvailableInstances.reduce((acc, inst) => {
            acc.total += 1;
            if (inst.status === 'LATE') acc.late += 1;
            else if (inst.status === 'Filed') acc.filed += 1;
            else acc.pending += 1;
            if (inst.assignedStaff) staffNames.add(inst.assignedStaff);
            return acc;
        }, { total: 0, late: 0, pending: 0, filed: 0 });

        return { ...summary, staffCount: staffNames.size };
    }, [retainerAvailableInstances]);

    const specialSummary = useMemo(() => {
        const summary = specialAvailableInstances.reduce((acc, inst) => {
            acc.total += 1;
            if (inst.displayStatus === 'Overdue') acc.overdue += 1;
            else if (inst.displayStatus === 'Completed') acc.completed += 1;
            else if (inst.displayStatus === 'Blocked') acc.blocked += 1;
            else if (inst.displayStatus === 'In Progress') acc.inProgress += 1;
            else acc.planning += 1;
            return acc;
        }, { total: 0, planning: 0, inProgress: 0, completed: 0, blocked: 0, overdue: 0 });

        return summary;
    }, [specialAvailableInstances]);

    const auditTrail = useMemo(() => {
        if (activeTab !== 'Retainer' || !selectedItem || !selectedItem.frequency) return [];

        const history = [];
        const [currentMonth, currentYearStr] = selectedItem.taxPeriod.split(' ');
        const currentYear = parseInt(currentYearStr);
        let monthIdx = months.indexOf(currentMonth);
        let year = currentYear;

        let currentCycle = 0;
        let iterations = 0; // Safety break
        const MAX_ITERATIONS = 24; // 2 years back max

        while (currentCycle < 3 && iterations < MAX_ITERATIONS) {
            iterations++;
            // Shift back based on frequency
            if (selectedItem.frequency === 'Monthly') {
                monthIdx -= 1;
            } else if (selectedItem.frequency === 'Quarterly') {
                monthIdx -= 3;
            } else if (selectedItem.frequency === 'Annual') {
                monthIdx -= 12;
            } else {
                monthIdx -= 1;
            }

            if (monthIdx < 0) {
                monthIdx += 12;
                year -= 1;
            }

            const periodMonth = months[monthIdx];
            const periodYear = String(year);
            const periodKey = `${String(monthIdx + 1).padStart(2, '0')}/${periodYear}`;
            const normalizedTaxID = normalizeId(selectedItem.taxID);

            // Skip check for IDs 0001 and 0002
            if (['1', '2'].includes(normalizedTaxID)) {
                if ([3, 6, 9, 12].includes(monthIdx + 1)) continue;
            }

            const log = retainerLogs.find(l => normalizeId(l[0]) === normalizeId(selectedItem.id) && l[1] === periodKey);

            let status = 'Pending';
            let dateFiled = null;
            if (log && log[2]) {
                dateFiled = log[2];
                const client = clients.find(c => c.name === selectedItem.clientName);
                const dueInfo = computeActualDueDate(periodMonth, periodYear, selectedItem.dueDateCode, client?.fiscalYearEnd || '12/31');
                const [m, d, y] = dateFiled.split('/');
                const dateFiledObj = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
                const compareDue = new Date(dueInfo.raw);
                compareDue.setHours(12, 0, 0, 0);
                dateFiledObj.setHours(12, 0, 0, 0);
                status = dateFiledObj > compareDue ? 'LATE' : 'Filed';
            }

            currentCycle++;
            history.push({
                cycle: currentCycle,
                period: `${periodMonth} ${periodYear}`,
                status: status,
                dateFiled: dateFiled
            });
        }
        return history;
    }, [selectedItem, retainerLogs, activeTab, months, clients]);

    return (
        <div className="w-full mx-auto p-2 space-y-2 animate-in fade-in duration-700">
            {/* Engagement Monitoring Header Section */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2 px-1">
                <div className="space-y-0.5">
                    <div className="flex items-center gap-2.5">
                        <div className="w-1.5 h-7 bg-primary rounded-full" />
                        <h1 className="text-3xl font-black text-neutral-dark dark:text-white tracking-tight">
                            {activeTab === 'Retainer' ? 'Retainer Monitoring' : 'Special Projects'}
                        </h1>
                    </div>
                    <p className="text-sm text-secondary dark:text-gray-300 font-medium pl-4 opacity-70 dark:opacity-100">
                        {activeTab === 'Retainer'
                            ? 'Recurring compliance work and regulatory deadlines'
                            : 'One-time project engagements and progress tracking'}
                    </p>
                </div>
            </div>

            {activeTab === 'Retainer' && retainerAvailableInstances.length > 0 && (
                <div className="-mt-1">
                    <RetainerSummaryStrip summary={retainerSummary} />
                </div>
            )}
            {activeTab === 'Special' && specialAvailableInstances.length > 0 && (
                <div className="-mt-1">
                    <SpecialSummaryStrip summary={specialSummary} />
                </div>
            )}

            {/* Modern Streamlined Toolbar */}
            <div className="bg-white dark:bg-gray-800 p-1 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-sm shadow-neutral-dark/5">
                <div className="flex flex-col 2xl:flex-row 2xl:items-center gap-1">
                    {/* Integrated Search - Flexible based on resolution */}
                    <div className="relative group w-full 2xl:flex-1 2xl:min-w-[400px]">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-secondary/40 dark:text-gray-400/60 group-focus-within:text-primary transition-colors" size={16} />
                        <input
                            type="text"
                            placeholder="Search engagements, clients, or staff..."
                            className="w-full pl-10 pr-4 py-1.5 bg-neutral-light/50 dark:bg-gray-900/50 border border-transparent focus:border-primary/20 rounded-xl text-[13px] font-medium text-neutral-dark dark:text-white outline-none focus:ring-4 focus:ring-primary/5 transition-all placeholder:text-secondary/30 dark:placeholder:text-gray-500"
                            value={activeTab === 'Retainer' ? retainerSearchQuery : specialSearchQuery}
                            onChange={(e) => activeTab === 'Retainer' ? setRetainerSearchQuery(e.target.value) : setSpecialSearchQuery(e.target.value)}
                        />
                    </div>

                    {/* Filters and Grouping - Row 2 on small, Row 1 on large */}
                    <div className="flex flex-nowrap items-center gap-2 px-0.5 overflow-x-auto no-scrollbar">
                        {activeTab === 'Retainer' ? (
                            <>
                                <select
                                    value={retainerFilter.compliance}
                                    onChange={(e) => setRetainerFilter(prev => ({ ...prev, compliance: e.target.value }))}
                                    className="pl-2 pr-7 py-1.5 bg-neutral-light/50 dark:bg-gray-900 border border-transparent hover:border-neutral-medium/50 rounded-lg text-[11px] font-bold text-neutral-dark dark:text-white outline-none focus:ring-4 focus:ring-primary/5 transition-all appearance-none cursor-pointer w-[220px]"
                                    style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%236b7280\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")', backgroundPosition: 'right 0.4rem center', backgroundRepeat: 'no-repeat', backgroundSize: '0.9rem' }}
                                >
                                    <option value="All">Compliance (All)</option>
                                    {availableRetainerCompliances.map(code => <option key={code} value={code}>{code}</option>)}
                                </select>

                                <div className="flex items-center bg-neutral-light/50 dark:bg-gray-900 rounded-lg border border-transparent overflow-hidden">
                                    <select
                                        value={retainerFilter.month}
                                        onChange={(e) => setRetainerFilter(prev => ({ ...prev, month: e.target.value }))}
                                        className="w-[110px] pl-2 pr-5 py-1.5 bg-transparent text-[11px] font-bold text-neutral-dark dark:text-white outline-none cursor-pointer appearance-none"
                                    >
                                        {months.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                    <div className="w-px h-4 bg-neutral-medium/50 dark:bg-gray-700" />
                                    <select
                                        value={retainerFilter.year}
                                        onChange={(e) => setRetainerFilter(prev => ({ ...prev, year: e.target.value }))}
                                        className="w-[55px] pl-1 pr-1 py-1.5 bg-transparent text-[11px] font-bold text-neutral-dark dark:text-white outline-none cursor-pointer appearance-none text-center"
                                    >
                                        {years.map(y => <option key={y} value={y}>{y}</option>)}
                                    </select>
                                </div>

                                <RetainerStatusChips
                                    value={retainerFilter.status}
                                    onChange={(status) => setRetainerFilter(prev => ({ ...prev, status }))}
                                />
                            </>
                        ) : (
                            <>
                                <select
                                    value={specialFilter.staff}
                                    onChange={(e) => setSpecialFilter(prev => ({ ...prev, staff: e.target.value }))}
                                    className="pl-2 pr-7 py-1.5 bg-neutral-light/50 dark:bg-gray-900 border border-transparent hover:border-neutral-medium/50 rounded-lg text-[11px] font-bold text-neutral-dark dark:text-white outline-none focus:ring-4 focus:ring-primary/5 transition-all appearance-none cursor-pointer w-[220px]"
                                    style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%236b7280\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")', backgroundPosition: 'right 0.4rem center', backgroundRepeat: 'no-repeat', backgroundSize: '0.9rem' }}
                                >
                                    <option value="All">All Staff</option>
                                    {availableSpecialStaff.map(staff => <option key={staff} value={staff}>{staff}</option>)}
                                </select>

                                <SpecialStatusChips
                                    value={specialFilter.status}
                                    onChange={(status) => setSpecialFilter(prev => ({ ...prev, status }))}
                                />
                            </>
                        )}


                        {activeTab === 'Retainer' ? (
                            <RetainerGroupChips
                                value={retainerGroupBy}
                                onChange={setRetainerGroupBy}
                                userRole={user?.role}
                            />
                        ) : (
                            <SpecialGroupChips
                                value={specialGroupBy}
                                onChange={setSpecialGroupBy}
                                userRole={user?.role}
                            />
                        )}
                    </div>
                </div>
            </div>

            {/* Ultra-Compact Content Area */}
            <div
                key={`${activeTab}-${activeTab === 'Retainer' ? retainerSearchQuery : specialSearchQuery}-${activeTab === 'Retainer' ? retainerGroupBy : specialGroupBy}-${activeTab === 'Retainer' ? retainerInstances.length : specialInstances.length}`}
                className="transition-all duration-500 min-h-[500px] animate-in fade-in zoom-in-95 duration-500 ease-out"
            >
                {activeTab === 'Retainer' ? (
                    retainerInstances.length === 0 ? (
                        <EmptyState
                            key={`retainer-empty-${retainerSearchQuery}`}
                            icon={FileText}
                            title="No retainers found"
                            query={retainerSearchQuery}
                            defaultMessage="No engagements found matching your current view."
                        />
                    ) : (
                        <RetainerTable
                            instances={paginatedRetainerInstances}
                            user={user}
                            onSelect={(inst) => { setSelectedItem(inst); setIsDetailOpen(true); }}
                            allUsers={allUsers}
                            groupBy={retainerGroupBy}
                        />
                    )
                ) : (
                    specialInstances.length === 0 ? (
                        <EmptyState
                            key={`special-empty-${specialSearchQuery}`}
                            icon={Briefcase}
                            title="No specials found"
                            query={specialSearchQuery}
                            defaultMessage="No special projects found matching your current view."
                        />
                    ) : (
                        <SpecialTable
                            instances={paginatedSpecialInstances}
                            user={user}
                            onSelect={(inst) => { setSelectedItem(inst); setIsDetailOpen(true); }}
                            allUsers={allUsers}
                            groupBy={specialGroupBy}
                        />
                    )
                )}
            </div>

            {activeTab === 'Retainer' && retainerGroupBy === 'None' && retainerInstances.length > pageSize && (
                <PaginationControls
                    page={retainerPage}
                    pageSize={pageSize}
                    total={retainerInstances.length}
                    onPageChange={setRetainerPage}
                />
            )}
            {activeTab === 'Special' && specialGroupBy === 'None' && specialInstances.length > pageSize && (
                <PaginationControls
                    page={specialPage}
                    pageSize={pageSize}
                    total={specialInstances.length}
                    onPageChange={setSpecialPage}
                />
            )}

            {/* Engagement Detail Drawer */}
            {isDetailOpen && selectedItem && createPortal(
                <div className="fixed inset-0 z-[10000] overflow-hidden">
                    <div className="absolute inset-0 bg-neutral-dark/40 backdrop-blur-sm transition-opacity" onClick={() => { setIsDetailOpen(false); setIsEditingDate(false); }} />
                    <div className="absolute inset-y-0 right-0 max-w-2xl w-full bg-white dark:bg-gray-900 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
                        {/* Hidden Print Template */}
                        <div style={{ position: 'absolute', top: '-9999px', left: '-9999px', overflow: 'hidden' }}>
                            {activeTab === 'Special' && (
                                <SpecialEngagementPrintTemplate
                                    ref={specialPrintRef}
                                    engagement={selectedItem}
                                    tasks={worklogTasks}
                                    activities={worklogActivities}
                                    logoUrl="/logo.png"
                                />
                            )}
                        </div>
                        {/* Drawer Header */}
                        <div className="p-5 border-b border-neutral-medium dark:border-gray-800 flex items-start justify-between gap-4 bg-neutral-light/30 dark:bg-gray-800/30">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                    <span className="bg-rose-50 text-rose-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">
                                        {activeTab === 'Retainer' ? 'Retainer Engagement' : 'Special Project'}
                                    </span>
                                    {activeTab === 'Retainer' && (
                                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${selectedItem.status === 'Filed' ? 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20' :
                                                selectedItem.status === 'LATE' ? 'bg-rose-50 text-rose-600 border-rose-100 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20' :
                                                    'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20'
                                            }`}>
                                            {selectedItem.status}
                                        </span>
                                    )}
                                </div>
                                <h2 className="text-xl font-black text-neutral-dark dark:text-white leading-tight">
                                    {activeTab === 'Retainer' ? selectedItem.complianceName : selectedItem.engagementName}
                                </h2>
                                {activeTab === 'Retainer' && (
                                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-bold text-secondary dark:text-gray-400">
                                        <span>{selectedItem.clientName}</span>
                                        <span className="hidden sm:inline text-secondary/30">|</span>
                                        <span>Due {selectedItem.dueDate}</span>
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                                {activeTab === 'Special' && (
                                    <button
                                        onClick={() => handleSpecialPrint()}
                                        className="p-2 hover:bg-neutral-medium/20 dark:hover:bg-gray-800 rounded-full transition-colors text-secondary hover:text-primary"
                                        title="Print Report / Export PDF"
                                    >
                                        <Printer size={20} />
                                    </button>
                                )}
                                <button
                                    onClick={() => setIsDetailOpen(false)}
                                    className="p-2 hover:bg-neutral-medium/20 dark:hover:bg-gray-800 rounded-full transition-colors text-secondary"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Drawer Body - Now with vibrant gradient background */}
                        <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-gradient-to-br from-neutral-light/50 via-white to-primary/5 dark:from-gray-900 dark:via-gray-900 dark:to-primary/10 custom-scrollbar">
                            {/* Main Content Area */}
                            {(() => {
                                // Find the latest data for the selected item
                                const currentItem = activeTab === 'Retainer'
                                    ? retainerInstances.find(i => i.id === selectedItem.id)
                                    : specialInstances.find(i => i.id === selectedItem.id);

                                if (!currentItem) return null;
                                const completedTaskCount = worklogTasks.filter(task => task.status === 'Completed').length;
                                const pendingTaskCount = Math.max(worklogTasks.length - completedTaskCount, 0);

                                return activeTab === 'Retainer' ? (
                                    <section className="space-y-5 animate-in fade-in slide-in-from-top duration-500">
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <div className="w-1 h-4 bg-primary rounded-full shrink-0" />
                                                    <h3 className="text-sm font-black text-neutral-dark dark:text-white truncate">Compliance Details</h3>
                                                </div>
                                                {(currentItem.status === 'Filed' || currentItem.status === 'LATE') && !isEditingDate && (
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => {
                                                                setLogToUnfile(currentItem);
                                                                setShowUnfileModal(true);
                                                            }}
                                                            className="px-3 py-1 rounded-lg bg-white text-rose-600 border border-rose-200 text-[10px] font-black hover:bg-rose-600 hover:text-white hover:border-rose-600 transition-colors dark:bg-gray-800 dark:text-rose-400 dark:border-rose-500/30"
                                                        >
                                                            Unfile
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setIsEditingDate(true);
                                                                if (currentItem.dateFiled) {
                                                                    const [m, d, y] = currentItem.dateFiled.split('/');
                                                                    setCompletionDate(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`);
                                                                }
                                                            }}
                                                            className="px-3 py-1 rounded-lg bg-primary/10 text-primary text-[10px] font-black hover:bg-primary hover:text-white transition-colors"
                                                        >
                                                            Edit filing
                                                        </button>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="bg-white/85 dark:bg-gray-800/70 backdrop-blur-md rounded-2xl border border-neutral-medium/60 dark:border-gray-700 shadow-sm p-5 space-y-5">
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
                                                    <div>
                                                        <p className="text-[10px] font-black text-secondary dark:text-gray-400 mb-1">Client</p>
                                                        <p className="text-sm font-black text-neutral-dark dark:text-white leading-tight">{currentItem.clientName}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-black text-secondary dark:text-gray-400 mb-1">Assigned Staff</p>
                                                        <StaffAvatar staffName={currentItem.assignedStaff} allUsers={allUsers} />
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-black text-secondary dark:text-gray-400 mb-1">Tax Period</p>
                                                        <p className="text-sm font-bold text-neutral-dark dark:text-white">{currentItem.taxPeriod}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-black text-secondary dark:text-gray-400 mb-1">Deadline</p>
                                                        <div className="flex items-center gap-1.5">
                                                            <Calendar size={13} className="text-secondary/50" />
                                                            <p className="text-sm font-bold text-neutral-dark dark:text-white">{currentItem.dueDate}</p>
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-black text-secondary dark:text-gray-400 mb-1">Completed</p>
                                                        {(currentItem.status === 'Filed' || currentItem.status === 'LATE') && !isEditingDate ? (
                                                            <p className="text-sm font-black text-emerald-600">{currentItem.dateFiled}</p>
                                                        ) : (
                                                            <input
                                                                type="date"
                                                                value={completionDate}
                                                                onChange={(e) => setCompletionDate(e.target.value)}
                                                                className="w-full max-w-[180px] px-3 py-2 bg-neutral-light/60 dark:bg-gray-900 border border-neutral-medium/60 dark:border-gray-700 rounded-lg text-xs font-bold text-neutral-dark dark:text-white outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary/20"
                                                            />
                                                        )}
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-black text-secondary dark:text-gray-400 mb-1">Status</p>
                                                        <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${currentItem.status === 'Filed' ? 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20' :
                                                                currentItem.status === 'LATE' ? 'bg-rose-50 text-rose-600 border-rose-100 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20' :
                                                                    'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20'
                                                            }`}>
                                                            {currentItem.status}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="pt-5 border-t border-neutral-medium/50 dark:border-gray-700/70">
                                                    <p className="text-[10px] font-black text-secondary dark:text-gray-400 mb-2">Filing Remarks</p>
                                                    {(currentItem.status === 'Filed' || currentItem.status === 'LATE') && !isEditingDate ? (
                                                        <p className="text-sm font-medium text-neutral-dark/80 dark:text-gray-300 italic">{currentItem.remarks || 'No remarks provided'}</p>
                                                    ) : (
                                                        <textarea
                                                            value={remarks}
                                                            onChange={(e) => setRemarks(e.target.value)}
                                                            placeholder="Add reasoning for late filing or extensions..."
                                                            className="w-full min-h-[72px] px-3 py-2 bg-neutral-light/60 dark:bg-gray-900 border border-neutral-medium/60 dark:border-gray-700 rounded-xl text-sm font-medium text-neutral-dark dark:text-white outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary/20 resize-none custom-scrollbar"
                                                        />
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {(currentItem.status === 'Pending' || isEditingDate) && (
                                            <div className="flex gap-3">
                                                <button
                                                    disabled={isProcessing}
                                                    onClick={() => handleMarkAsFiled(currentItem.id)}
                                                    className="flex-1 bg-primary hover:bg-primary-dark text-white py-3 rounded-xl font-black text-[11px] shadow-lg shadow-primary/20 active:scale-[0.98] transition-all disabled:opacity-50"
                                                >
                                                    {currentItem.status === 'Pending'
                                                        ? (isProcessing ? 'Processing...' : 'Mark as Filed')
                                                        : (isProcessing ? 'Updating...' : 'Update Filing')}
                                                </button>
                                                {isEditingDate && (
                                                    <button
                                                        onClick={() => setIsEditingDate(false)}
                                                        className="px-5 py-3 bg-white dark:bg-gray-800 rounded-xl font-black text-[11px] text-secondary border border-neutral-medium dark:border-gray-700 hover:bg-neutral-light dark:hover:bg-gray-700 transition-all"
                                                    >
                                                        Cancel
                                                    </button>
                                                )}
                                            </div>
                                        )}

                                        <div className="space-y-4">
                                            <div className="flex items-center gap-2">
                                                <div className="w-1 h-4 bg-primary rounded-full" />
                                                <h4 className="text-sm font-black text-neutral-dark dark:text-white">Previous Filings</h4>
                                            </div>
                                            <div className="bg-white/85 dark:bg-gray-800/70 backdrop-blur-md rounded-2xl border border-neutral-medium/60 dark:border-gray-700 shadow-sm overflow-hidden">
                                                {auditTrail.length === 0 ? (
                                                    <div className="px-5 py-6 text-center text-xs font-bold text-secondary/60">No prior filing history found.</div>
                                                ) : (
                                                    auditTrail.map((entry) => (
                                                        <div key={entry.cycle} className="flex items-center justify-between gap-4 px-5 py-3 border-b border-neutral-medium/40 dark:border-gray-700/60 last:border-0 hover:bg-neutral-light/50 dark:hover:bg-gray-800 transition-colors">
                                                            <div className="flex items-center gap-3 min-w-0">
                                                                <div className={`w-2 h-2 rounded-full shrink-0 ${
                                                                    entry.status === 'Filed' ? 'bg-emerald-500' :
                                                                    entry.status === 'LATE' ? 'bg-rose-500' :
                                                                    'bg-amber-500'
                                                                }`} />
                                                                <div className="min-w-0">
                                                                    <p className="text-xs font-black text-neutral-dark dark:text-white">{entry.period}</p>
                                                                    {entry.dateFiled && (
                                                                        <p className="text-[11px] font-bold text-secondary dark:text-gray-400">Filed {formatDisplayDate(entry.dateFiled)}</p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <span className={`shrink-0 text-[9px] font-black px-2 py-1 rounded-full border ${
                                                                entry.status === 'Filed' ? 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20' :
                                                                entry.status === 'LATE' ? 'bg-rose-50 text-rose-600 border-rose-100 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20' :
                                                                'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20'
                                                            }`}>
                                                                {entry.status}
                                                            </span>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="flex items-center gap-2">
                                                <div className="w-1 h-4 bg-primary rounded-full" />
                                                <h4 className="text-sm font-black text-neutral-dark dark:text-white">Audit Logs</h4>
                                            </div>
                                            <div className="bg-white/85 dark:bg-gray-800/70 backdrop-blur-md rounded-2xl border border-neutral-medium/60 dark:border-gray-700 shadow-sm overflow-hidden">
                                                <div className={`${retainerAuditLogs.length > 0 || isRetainerAuditLoading ? 'min-h-[205px]' : ''} transition-opacity duration-200 ${isRetainerAuditLoading && retainerAuditLogs.length > 0 ? 'opacity-70' : 'opacity-100'}`}>
                                                    {retainerAuditLogs.length > 0 ? (
                                                        retainerAuditLogs.map((log) => {
                                                            const isExpanded = expandedRetainerAuditLogId === log.id;
                                                            const detailRows = getRetainerAuditDetailRows(log.details);
                                                            const hasDetails = detailRows.length > 0;
                                                            return (
                                                                <div key={log.id} className="border-b border-neutral-medium/40 dark:border-gray-700/60 last:border-0 hover:bg-neutral-light/50 dark:hover:bg-gray-800 transition-colors">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => hasDetails && setExpandedRetainerAuditLogId(isExpanded ? null : log.id)}
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
                                                                        <p className="mt-2 text-[11px] font-medium text-secondary dark:text-gray-400">
                                                                            {formatAuditChangeSummary(log.details) || log.summary}
                                                                        </p>
                                                                    </button>
                                                                    {isExpanded && (
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
                                                                                        <div className="max-h-24 overflow-y-auto break-words pr-1 custom-scrollbar">{formatAuditDetailValue(row.before)}</div>
                                                                                    </div>
                                                                                    <div className="px-3 py-2 text-[10px] font-semibold text-secondary dark:text-gray-400">
                                                                                        <div className="max-h-24 overflow-y-auto break-words pr-1 custom-scrollbar">{formatAuditDetailValue(row.after)}</div>
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })
                                                    ) : isRetainerAuditLoading ? (
                                                        <div className="h-[205px] flex flex-col items-center justify-center gap-2 text-xs font-bold text-secondary/60">
                                                            <Loader2 size={16} className="animate-spin text-primary/70" />
                                                            Loading audit logs...
                                                        </div>
                                                    ) : (
                                                        <div className="m-4 py-8 text-center border border-dashed border-neutral-medium dark:border-gray-700 rounded-[2rem] bg-white/40 dark:bg-gray-900/40">
                                                            <p className="text-[9px] text-secondary font-black uppercase tracking-widest opacity-30">No audit logs recorded</p>
                                                        </div>
                                                    )}
                                                </div>
                                                {retainerAuditTotalPages > 1 && (
                                                    <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-neutral-medium/40 dark:border-gray-700/60 bg-neutral-light/30 dark:bg-gray-900/30">
                                                        <button
                                                            onClick={() => loadRetainerAuditLogs(selectedItem, Math.max(retainerAuditPage - 1, 1))}
                                                            disabled={isRetainerAuditLoading || retainerAuditPage <= 1}
                                                            className="px-3 py-1.5 rounded-lg border border-neutral-medium dark:border-gray-700 text-[10px] font-black text-secondary hover:text-primary hover:border-primary disabled:opacity-40 disabled:cursor-not-allowed"
                                                        >
                                                            Previous
                                                        </button>
                                                        <span className="text-[10px] font-black text-secondary dark:text-gray-400">Page {retainerAuditPage} of {retainerAuditTotalPages}</span>
                                                        <button
                                                            onClick={() => loadRetainerAuditLogs(selectedItem, Math.min(retainerAuditPage + 1, retainerAuditTotalPages))}
                                                            disabled={isRetainerAuditLoading || retainerAuditPage >= retainerAuditTotalPages}
                                                            className="px-3 py-1.5 rounded-lg border border-neutral-medium dark:border-gray-700 text-[10px] font-black text-secondary hover:text-primary hover:border-primary disabled:opacity-40 disabled:cursor-not-allowed"
                                                        >
                                                            Next
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </section>
                                ) : (
                                    <section className="space-y-5 animate-in fade-in slide-in-from-top duration-500">
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-1 h-4 bg-primary rounded-full" />
                                                    <h3 className="text-sm font-black text-neutral-dark dark:text-white">Project Information</h3>
                                                </div>
                                                {!isEditingSpecialInfo && (
                                                    <button
                                                        onClick={() => startEditingSpecialInfo(currentItem)}
                                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-primary border border-primary/20 text-[10px] font-black hover:bg-primary hover:text-white transition-all dark:bg-gray-800 dark:border-primary/30"
                                                    >
                                                        <Edit size={13} />
                                                        Edit Project
                                                    </button>
                                                )}
                                            </div>
                                            <div className="bg-white/85 dark:bg-gray-800/70 backdrop-blur-md rounded-2xl border border-neutral-medium/60 dark:border-gray-700 shadow-sm p-5 space-y-5">
                                                {isEditingSpecialInfo ? (
                                                    <div className="space-y-4">
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                            <div className="space-y-1">
                                                                <label className="text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest ml-1">Project Type</label>
                                                                <select
                                                                    value={specialEditForm.serviceId}
                                                                    onChange={(e) => setSpecialEditForm(prev => ({ ...prev, serviceId: e.target.value }))}
                                                                    className="w-full px-3 py-2.5 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium/70 dark:border-gray-700 rounded-xl text-xs font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary/30 outline-none transition-all"
                                                                >
                                                                    <option value="">Select project type...</option>
                                                                    {specialProjectServices.map((service: any) => (
                                                                        <option key={service.id} value={service.id}>{service.name}</option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                            <div className="space-y-1">
                                                                <label className="text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest ml-1">Project Title</label>
                                                                <input
                                                                    value={specialEditForm.projectTitle}
                                                                    onChange={(e) => setSpecialEditForm(prev => ({ ...prev, projectTitle: e.target.value }))}
                                                                    className="w-full px-3 py-2.5 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium/70 dark:border-gray-700 rounded-xl text-xs font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary/30 outline-none transition-all"
                                                                    placeholder="Project title"
                                                                />
                                                            </div>
                                                        </div>

                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                            <div className="space-y-1">
                                                                <label className="text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest ml-1">Assignee</label>
                                                                <select
                                                                    value={specialEditForm.assignedStaffId}
                                                                    onChange={(e) => setSpecialEditForm(prev => ({ ...prev, assignedStaffId: e.target.value }))}
                                                                    className="w-full px-3 py-2.5 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium/70 dark:border-gray-700 rounded-xl text-xs font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary/30 outline-none transition-all"
                                                                >
                                                                    <option value="">Select assignee...</option>
                                                                    {activeAssignableUsers.map(u => (
                                                                        <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                            <div className="space-y-1">
                                                                <label className="text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest ml-1">Status</label>
                                                                <select
                                                                    value={specialEditForm.status}
                                                                    onChange={(e) => setSpecialEditForm(prev => ({ ...prev, status: e.target.value }))}
                                                                    className="w-full px-3 py-2.5 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium/70 dark:border-gray-700 rounded-xl text-xs font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary/30 outline-none transition-all"
                                                                >
                                                                    <option value="Planning">Planning</option>
                                                                    <option value="In Progress">In Progress</option>
                                                                    <option value="Completed">Completed</option>
                                                                    <option value="Blocked">Blocked</option>
                                                                </select>
                                                            </div>
                                                        </div>

                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                            <div className="space-y-1">
                                                                <label className="text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest ml-1">Start Date</label>
                                                                <input
                                                                    type="date"
                                                                    value={specialEditForm.startDate}
                                                                    onChange={(e) => setSpecialEditForm(prev => ({ ...prev, startDate: e.target.value }))}
                                                                    className="w-full px-3 py-2.5 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium/70 dark:border-gray-700 rounded-xl text-xs font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary/30 outline-none transition-all"
                                                                />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <label className="text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest ml-1">Due Date</label>
                                                                <input
                                                                    type="date"
                                                                    value={specialEditForm.endDate}
                                                                    onChange={(e) => setSpecialEditForm(prev => ({ ...prev, endDate: e.target.value }))}
                                                                    className="w-full px-3 py-2.5 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium/70 dark:border-gray-700 rounded-xl text-xs font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary/30 outline-none transition-all"
                                                                />
                                                            </div>
                                                        </div>

                                                        <div className="space-y-1">
                                                            <label className="text-[9px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest ml-1">Project Description</label>
                                                            <textarea
                                                                value={specialEditForm.description}
                                                                onChange={(e) => setSpecialEditForm(prev => ({ ...prev, description: e.target.value }))}
                                                                rows={3}
                                                                className="w-full px-3 py-2.5 bg-neutral-light/50 dark:bg-gray-900 border border-neutral-medium/70 dark:border-gray-700 rounded-xl text-xs font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary/30 outline-none transition-all resize-none"
                                                                placeholder="Project brief..."
                                                            />
                                                        </div>

                                                        <div className="flex justify-end gap-2 pt-2 border-t border-neutral-medium/50 dark:border-gray-700/70">
                                                            <button
                                                                onClick={cancelEditingSpecialInfo}
                                                                disabled={isProcessing}
                                                                className="px-4 py-2.5 border border-neutral-medium dark:border-gray-700 rounded-xl text-[10px] font-black text-secondary dark:text-gray-400 hover:bg-neutral-medium/10 dark:hover:bg-gray-700 transition-all disabled:opacity-50"
                                                            >
                                                                Cancel
                                                            </button>
                                                            <button
                                                                onClick={handleSaveSpecialInfo}
                                                                disabled={isProcessing}
                                                                className="px-5 py-2.5 bg-primary hover:bg-primary-dark text-white rounded-xl text-[10px] font-black shadow-lg shadow-primary/20 transition-all active:scale-95 disabled:opacity-50"
                                                            >
                                                                {isProcessing ? 'Saving...' : 'Save Project'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
                                                            <div>
                                                                <p className="text-[10px] font-black text-secondary dark:text-gray-400 mb-1">Client</p>
                                                                <p className="text-sm font-black text-neutral-dark dark:text-white leading-tight">{currentItem.clientName}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] font-black text-secondary dark:text-gray-400 mb-1">Assigned Staff</p>
                                                                <StaffAvatar staffName={currentItem.assignedStaff} allUsers={allUsers} />
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] font-black text-secondary dark:text-gray-400 mb-1">Project Type</p>
                                                                <p className="text-sm font-bold text-neutral-dark dark:text-white">{currentItem.serviceName || currentItem.serviceType || 'Not specified'}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] font-black text-secondary dark:text-gray-400 mb-1">Status</p>
                                                                <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-black border ${currentItem.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' :
                                                                    currentItem.status === 'In Progress' ? 'bg-blue-500/10 text-blue-600 border-blue-500/20' :
                                                                        currentItem.status === 'Blocked' ? 'bg-rose-500/10 text-rose-600 border-rose-500/20' :
                                                                            'bg-neutral-500/10 text-neutral-600 border-neutral-500/20'
                                                                }`}>
                                                                    {currentItem.status}
                                                                </span>
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] font-black text-secondary dark:text-gray-400 mb-1">Start Date</p>
                                                                <div className="flex items-center gap-1.5">
                                                                    <Calendar size={13} className="text-secondary/50" />
                                                                    <p className="text-sm font-bold text-neutral-dark dark:text-white">
                                                                        {formatDisplayDate(currentItem.startDate) || 'Not specified'}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] font-black text-secondary dark:text-gray-400 mb-1">Due Date</p>
                                                                <div className="flex items-center gap-1.5">
                                                                    <Calendar size={13} className="text-secondary/50" />
                                                                    <p className="text-sm font-bold text-neutral-dark dark:text-white">
                                                                        {formatDisplayDate(currentItem.endDate) || 'Not specified'}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="pt-5 border-t border-neutral-medium/50 dark:border-gray-700/70">
                                                            <p className="text-[10px] font-black text-secondary dark:text-gray-400 mb-2">Project Description</p>
                                                            <p className="text-sm text-neutral-dark/80 dark:text-gray-300 leading-relaxed font-medium italic">
                                                                {currentItem.description || "No project description provided."}
                                                            </p>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <div className="w-1 h-4 bg-primary rounded-full shrink-0" />
                                                    <h3 className="text-sm font-black text-neutral-dark dark:text-white truncate">Project Tasks & Milestones</h3>
                                                    <div className="hidden sm:flex items-center gap-1.5 ml-2">
                                                        <span className="px-2 py-0.5 rounded-md bg-neutral-light dark:bg-gray-900 text-[9px] font-black text-secondary dark:text-gray-400 border border-neutral-medium/60 dark:border-gray-700">
                                                            {worklogTasks.length} Total
                                                        </span>
                                                        <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-[9px] font-black text-emerald-600 border border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
                                                            {completedTaskCount} Completed
                                                        </span>
                                                        <span className="px-2 py-0.5 rounded-md bg-amber-50 text-[9px] font-black text-amber-600 border border-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20">
                                                            {pendingTaskCount} Pending
                                                        </span>
                                                    </div>
                                                </div>
                                                {!isAddingTask && (
                                                    <button
                                                        onClick={() => setIsAddingTask(true)}
                                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-[10px] font-black hover:bg-primary hover:text-white transition-all"
                                                    >
                                                        <Plus size={14} />
                                                        Add Task
                                                    </button>
                                                )}
                                            </div>

                                            <div className="bg-white/85 dark:bg-gray-800/70 backdrop-blur-md rounded-2xl border border-neutral-medium/60 dark:border-gray-700 shadow-sm p-5 space-y-4">

                                            {isAddingTask && (
                                                <div className="p-4 bg-primary/[0.03] rounded-xl border border-primary/20 space-y-4 animate-in zoom-in-95 duration-200">
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-2 h-2 rounded-full bg-primary" />
                                                            <span className="text-[10px] font-black text-primary uppercase tracking-widest">New Task</span>
                                                        </div>
                                                        <p className="text-[11px] font-medium text-secondary dark:text-gray-400 mt-1">Create a milestone or deliverable for this special engagement.</p>
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] font-black text-secondary dark:text-gray-400 uppercase tracking-wider mb-1.5">Task Name</label>
                                                        <input
                                                            autoFocus
                                                            type="text"
                                                            value={newTaskName}
                                                            onChange={(e) => setNewTaskName(e.target.value)}
                                                            placeholder="e.g. Submit registration documents"
                                                            className="w-full bg-white dark:bg-gray-800 px-3 py-2.5 rounded-xl text-sm font-bold border border-neutral-medium dark:border-gray-700 outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary/20 transition-all"
                                                        />
                                                    </div>
                                                    <div className="flex justify-end gap-2 pt-1">
                                                        <button
                                                            onClick={() => setIsAddingTask(false)}
                                                            className="px-4 py-2.5 border border-neutral-medium dark:border-gray-700 rounded-xl text-[10px] font-black text-secondary dark:text-gray-400 hover:bg-neutral-medium/10 dark:hover:bg-gray-700 transition-all"
                                                        >
                                                            Cancel
                                                        </button>
                                                        <button
                                                            onClick={handleAddTask}
                                                            disabled={isProcessing || !newTaskName}
                                                            className="px-5 py-2.5 bg-primary hover:bg-primary-dark text-white rounded-xl text-[10px] font-black shadow-lg shadow-primary/20 transition-all active:scale-95 disabled:opacity-50"
                                                        >
                                                            {isProcessing ? 'Creating...' : 'Create Task'}
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                            <div className="space-y-4">
                                                {isWorklogLoading && (
                                                    <div className="py-8 text-center text-[10px] font-black uppercase tracking-[0.2em] text-secondary/50">
                                                        Loading project worklog...
                                                    </div>
                                                )}
                                                {!isWorklogLoading && worklogTasks.map(task => {
                                                    const taskActivities = worklogActivities.filter(a => a.taskID === task.taskID);
                                                    return (
                                                        <div key={task.taskID} className="group bg-white/70 dark:bg-gray-900/30 rounded-xl border border-neutral-medium/60 dark:border-gray-700 overflow-hidden transition-all hover:bg-white dark:hover:bg-gray-900/50">
                                                            {/* Task Header - Premium */}
                                                            <div className="px-4 py-3 flex items-center justify-between bg-neutral-light/30 dark:bg-gray-900/40">
                                                                {editingTaskId === task.taskID ? (
                                                                    <div className="flex-1 bg-white dark:bg-gray-800 rounded-xl border border-primary/20 p-3 space-y-3 shadow-sm">
                                                                        <div>
                                                                            <label className="block text-[10px] font-black text-secondary dark:text-gray-400 uppercase tracking-wider mb-1.5">Task Name</label>
                                                                            <input
                                                                                disabled={isProcessing}
                                                                                type="text"
                                                                                value={editTaskName}
                                                                                onChange={(e) => setEditTaskName(e.target.value)}
                                                                                className="w-full bg-neutral-light/60 dark:bg-gray-900 px-3 py-2 rounded-lg text-sm font-bold border border-neutral-medium dark:border-gray-700 outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                                                            />
                                                                        </div>
                                                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                                                            <div>
                                                                                <p className="text-[10px] font-black text-secondary dark:text-gray-400 uppercase tracking-wider mb-1.5">Status</p>
                                                                                <div className="flex gap-2">
                                                                                {(['Pending', 'Completed'] as const).map(s => (
                                                                                    <button
                                                                                        key={s}
                                                                                        disabled={isProcessing}
                                                                                        onClick={() => setEditTaskStatus(s)}
                                                                                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black border transition-all ${editTaskStatus === s
                                                                                                ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20'
                                                                                                : 'bg-white dark:bg-gray-800 text-secondary dark:text-gray-400 border-neutral-medium dark:border-gray-700'
                                                                                            } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                                                    >
                                                                                        {s}
                                                                                    </button>
                                                                                ))}
                                                                                </div>
                                                                            </div>
                                                                            <div className="flex gap-2">
                                                                                <button
                                                                                    disabled={isProcessing}
                                                                                    onClick={() => setEditingTaskId(null)}
                                                                                    className="px-3 py-2 text-[10px] font-black text-secondary dark:text-gray-400 hover:bg-neutral-medium/10 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                                                                >
                                                                                    Cancel
                                                                                </button>
                                                                                <button
                                                                                    onClick={() => handleUpdateTask(task.taskID)}
                                                                                    disabled={isProcessing || !editTaskName}
                                                                                    className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-[10px] font-black shadow-lg shadow-emerald-600/20 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                                                                >
                                                                                    {isProcessing && <Loader2 className="animate-spin" size={10} />}
                                                                                    {isProcessing ? 'Saving...' : 'Save'}
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <>
                                                                        <div className="flex items-center gap-3">
                                                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${task.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-primary/10 text-primary'
                                                                                }`}>
                                                                                <CheckSquare size={17} />
                                                                            </div>
                                                                            <div>
                                                                                <h4 className="text-sm font-bold text-neutral-dark dark:text-white leading-tight tracking-tight">{task.taskName}</h4>
                                                                                <div className="flex items-center gap-2 mt-1">
                                                                                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-lg border ${task.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                                                                                        }`}>
                                                                                        {task.status}
                                                                                    </span>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex items-center gap-1">
                                                                            <button
                                                                                onClick={() => {
                                                                                    setEditingTaskId(task.taskID);
                                                                                    setEditTaskName(task.taskName);
                                                                                    setEditTaskStatus(task.status as 'Pending' | 'Completed');
                                                                                }}
                                                                                className="p-2 text-secondary hover:text-primary hover:bg-primary/5 rounded-xl transition-all"
                                                                                title="Edit Task"
                                                                            >
                                                                                <Edit size={16} />
                                                                            </button>
                                                                            {canDeleteSpecialWork && (
                                                                                <button
                                                                                    onClick={() => {
                                                                                        setTaskToDelete(task);
                                                                                        setShowDeleteTaskModal(true);
                                                                                    }}
                                                                                    className="p-2 text-secondary hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                                                                                    title="Delete Task"
                                                                                >
                                                                                    <Trash2 size={16} />
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    </>
                                                                )}
                                                            </div>

                                                            {/* Activity Timeline - Compact & Connected */}
                                                            <div className="px-4 py-3">
                                                                <div className="space-y-4">
                                                                    {taskActivities.length > 3 && !expandedTasks.has(task.taskID) && (
                                                                        <button
                                                                            onClick={() => toggleTaskExpansion(task.taskID)}
                                                                            className="w-full py-1.5 mb-2 border border-dashed border-neutral-medium dark:border-gray-700 rounded-lg text-[9px] font-black uppercase tracking-[0.2em] text-secondary dark:text-gray-400 hover:bg-neutral-light/50 transition-all opacity-100"
                                                                        >
                                                                            View older history (+{taskActivities.length - 3})
                                                                        </button>
                                                                    )}

                                                                    <div className="relative pl-2 space-y-1">
                                                                        {[...taskActivities]
                                                                            .sort((a, b) => {
                                                                                const [am, ad, ay] = a.dateCompleted.split('/').map(Number);
                                                                                const [bm, bd, by] = b.dateCompleted.split('/').map(Number);
                                                                                return new Date(ay, am - 1, ad).getTime() - new Date(by, bm - 1, bd).getTime();
                                                                            })
                                                                            .slice(expandedTasks.has(task.taskID) ? 0 : -3)
                                                                            .map((activity, idx, arr) => (
                                                                                <div key={activity.activityID} className="flex gap-4 group/item">
                                                                                    {/* Timeline Left Column */}
                                                                                    <div className="relative shrink-0 w-2.5 flex flex-col items-center">
                                                                                        {/* Timeline Dot */}
                                                                                        <div className={`mt-[0.5rem] w-2.5 h-2.5 rounded-full border-[1.5px] z-10 transition-all shrink-0 ${idx === arr.length - 1
                                                                                                ? 'bg-primary border-primary shadow-[0_0_0_3px_rgba(var(--primary-rgb),0.1)]'
                                                                                                : 'bg-white dark:bg-gray-800 border-primary/40'
                                                                                            }`} />

                                                                                        {/* Timeline Connector Line */}
                                                                                        {idx < arr.length - 1 && (
                                                                                            <div className="absolute top-[1.125rem] bottom-[-0.75rem] w-[1.5px] bg-neutral-medium dark:bg-gray-700" />
                                                                                        )}
                                                                                    </div>

                                                                                    <div className="flex-1 min-w-0">
                                                                                        {editingActivityId === activity.activityID ? (
                                                                                            <div className="bg-white/90 dark:bg-gray-800/90 p-4 rounded-xl border border-primary/20 space-y-3 shadow-sm">
                                                                                                <div>
                                                                                                    <label className="block text-[10px] font-black text-secondary dark:text-gray-400 uppercase tracking-wider mb-1.5">Progress Note</label>
                                                                                                    <textarea
                                                                                                        value={editActivityDesc}
                                                                                                        onChange={(e) => setEditActivityDesc(e.target.value)}
                                                                                                        disabled={isProcessing}
                                                                                                        className="w-full bg-neutral-light/60 dark:bg-gray-900 px-3 py-2 rounded-xl text-sm font-medium border border-neutral-medium dark:border-gray-700 outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary/20 min-h-[88px] disabled:opacity-50 resize-none"
                                                                                                    />
                                                                                                </div>
                                                                                                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                                                                                                    <div>
                                                                                                        <label className="block text-[10px] font-black text-secondary dark:text-gray-400 uppercase tracking-wider mb-1.5">Date Completed</label>
                                                                                                        <input
                                                                                                            type="date"
                                                                                                            value={editActivityDate}
                                                                                                            onChange={(e) => setEditActivityDate(e.target.value)}
                                                                                                            disabled={isProcessing}
                                                                                                            className="bg-neutral-light/60 dark:bg-gray-900 px-3 py-2 rounded-lg text-xs font-bold border border-neutral-medium dark:border-gray-700 outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary/20 disabled:opacity-50 w-40"
                                                                                                        />
                                                                                                    </div>
                                                                                                    <div className="flex justify-end gap-2">
                                                                                                        <button
                                                                                                            onClick={() => setEditingActivityId(null)}
                                                                                                            disabled={isProcessing}
                                                                                                            className="px-3 py-2 text-[10px] font-black text-secondary hover:bg-neutral-medium/10 rounded-lg disabled:opacity-50"
                                                                                                        >
                                                                                                            Cancel
                                                                                                        </button>
                                                                                                        <button
                                                                                                            onClick={() => handleUpdateActivity(activity.activityID)}
                                                                                                            disabled={isProcessing || !editActivityDesc}
                                                                                                            className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-[10px] font-black shadow-lg shadow-emerald-600/20 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50"
                                                                                                        >
                                                                                                            {isProcessing && <Loader2 className="animate-spin" size={10} />}
                                                                                                            {isProcessing ? 'Saving...' : 'Save'}
                                                                                                        </button>
                                                                                                    </div>
                                                                                                </div>
                                                                                            </div>
                                                                                        ) : (
                                                                                            <div className="flex items-start justify-between group pb-3">
                                                                                                <div className="flex-1">
                                                                                                    <div className="inline-flex items-center px-2 py-0.5 rounded-full bg-primary/5 dark:bg-primary/10 border border-primary/10 mb-1.5">
                                                                                                        <p className="text-[9px] font-black text-primary/80 tracking-widest">{formatDisplayDate(activity.dateCompleted)}</p>
                                                                                                    </div>
                                                                                                    <p className="text-xs font-bold text-neutral-dark dark:text-gray-200 leading-relaxed transition-colors">
                                                                                                        {activity.description}
                                                                                                    </p>
                                                                                                </div>

                                                                                                <div className="relative shrink-0" ref={activeMenuActivityId === activity.activityID ? menuRef : null}>
                                                                                                    <button
                                                                                                        onClick={() => setActiveMenuActivityId(activeMenuActivityId === activity.activityID ? null : activity.activityID)}
                                                                                                        className="p-1 text-secondary hover:text-primary hover:bg-primary/5 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                                                                                    >
                                                                                                        <MoreVertical size={14} />
                                                                                                    </button>

                                                                                                    {activeMenuActivityId === activity.activityID && (
                                                                                                        <div className="absolute right-0 top-full mt-1 w-32 bg-white dark:bg-gray-800 rounded-xl border border-neutral-medium dark:border-gray-700 shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                                                                                            <button
                                                                                                                onClick={() => {
                                                                                                                    setEditingActivityId(activity.activityID);
                                                                                                                    setEditActivityDesc(activity.description);
                                                                                                                    const [m, d, y] = activity.dateCompleted.split('/');
                                                                                                                    setEditActivityDate(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`);
                                                                                                                    setActiveMenuActivityId(null);
                                                                                                                }}
                                                                                                                className="w-full px-4 py-2 text-left text-[10px] font-black uppercase tracking-widest text-neutral-dark dark:text-white hover:bg-primary/5 hover:text-primary transition-colors flex items-center gap-2"
                                                                                                            >
                                                                                                                <Edit size={12} />
                                                                                                                Edit
                                                                                                            </button>
                                                                                                            {canDeleteSpecialWork && (
                                                                                                                <button
                                                                                                                    onClick={() => {
                                                                                                                        setActivityToDelete(activity);
                                                                                                                        setShowDeleteActivityModal(true);
                                                                                                                        setActiveMenuActivityId(null);
                                                                                                                    }}
                                                                                                                    className="w-full px-4 py-2 text-left text-[10px] font-black uppercase tracking-widest text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/10 transition-colors flex items-center gap-2"
                                                                                                                >
                                                                                                                    <Trash2 size={12} />
                                                                                                                    Delete
                                                                                                                </button>
                                                                                                            )}
                                                                                                        </div>
                                                                                                    )}
                                                                                                </div>
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                    </div>

                                                                    {!addingActivityToTaskId && (
                                                                        <button
                                                                            onClick={() => setAddingActivityToTaskId(task.taskID)}
                                                                            className="flex items-center gap-1.5 text-primary hover:bg-primary/5 px-2 py-1 rounded-md transition-all group"
                                                                        >
                                                                            <Plus size={12} className="group-hover:scale-125 transition-transform" />
                                                                            <span className="text-[10px] font-black uppercase tracking-widest">Post Progress</span>
                                                                        </button>
                                                                    )}

                                                                    {addingActivityToTaskId === task.taskID && (
                                                                        <div className="mt-2 p-4 bg-primary/[0.03] rounded-xl border border-primary/20 space-y-3 animate-in slide-in-from-top-2 duration-200">
                                                                            <div className="flex items-center gap-2">
                                                                                <div className="w-2 h-2 rounded-full bg-primary" />
                                                                                <span className="text-[10px] font-black text-primary uppercase tracking-widest">Post Progress</span>
                                                                            </div>
                                                                            <div>
                                                                                <label className="block text-[10px] font-black text-secondary dark:text-gray-400 uppercase tracking-wider mb-1.5">Progress Note</label>
                                                                                <textarea
                                                                                    autoFocus
                                                                                    value={newActivityDesc}
                                                                                    onChange={(e) => setNewActivityDesc(e.target.value)}
                                                                                    placeholder="What was accomplished?"
                                                                                    className="w-full bg-white dark:bg-gray-800 px-3 py-2 rounded-xl text-sm font-medium border border-neutral-medium dark:border-gray-700 outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary/20 min-h-[80px] resize-none"
                                                                                />
                                                                            </div>
                                                                            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                                                                                <div>
                                                                                    <label className="block text-[10px] font-black text-secondary dark:text-gray-400 uppercase tracking-wider mb-1.5">Date Completed</label>
                                                                                    <input
                                                                                        type="date"
                                                                                        value={activityDate}
                                                                                        onChange={(e) => setActivityDate(e.target.value)}
                                                                                        className="w-40 bg-white dark:bg-gray-800 px-3 py-2 rounded-lg text-xs font-bold border border-neutral-medium dark:border-gray-700 outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary/20"
                                                                                    />
                                                                                </div>
                                                                                <div className="flex justify-end gap-2">
                                                                                    <button
                                                                                        onClick={() => {
                                                                                            setAddingActivityToTaskId(null);
                                                                                            setNewActivityDesc('');
                                                                                        }}
                                                                                        className="px-3 py-2 rounded-lg text-[10px] font-black text-secondary dark:text-gray-400 hover:bg-neutral-medium/10 transition-all"
                                                                                    >
                                                                                        Cancel
                                                                                    </button>
                                                                                    <button
                                                                                        onClick={() => handleAddActivity(task.taskID)}
                                                                                        disabled={isProcessing || !newActivityDesc}
                                                                                        className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-[10px] font-black transition-all disabled:opacity-50 shadow-md shadow-primary/20"
                                                                                    >
                                                                                        {isProcessing ? '...' : 'Add Log'}
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {taskActivities.length === 0 && !addingActivityToTaskId && (
                                                                        <p className="text-[10px] text-secondary/40 dark:text-gray-400/40 italic pl-6 py-1">No progress logged.</p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            {/* Empty state for special */}
                                            {!isWorklogLoading && worklogTasks.length === 0 && (
                                                <div className="py-12 px-6 text-center bg-white dark:bg-gray-800/40 rounded-[2.5rem] border-2 border-dashed border-neutral-medium dark:border-gray-800 group hover:border-primary/30 transition-all duration-500">
                                                    <div className="w-16 h-16 bg-neutral-light/50 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-500">
                                                        <Briefcase size={28} className="text-secondary/30 group-hover:text-primary transition-colors" />
                                                    </div>
                                                    <p className="text-xs text-secondary font-black uppercase tracking-[0.2em] mb-2">Project Blueprint Empty</p>
                                                    <p className="text-[10px] text-secondary/60 font-medium mb-6 leading-relaxed">Establish your first milestone to begin tracking granular progress for this engagement.</p>
                                                    <button
                                                        onClick={() => setIsAddingTask(true)}
                                                        className="inline-flex items-center gap-2 bg-neutral-dark text-white px-6 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-primary transition-all shadow-xl active:scale-95"
                                                    >
                                                        <Plus size={14} />
                                                        Add First Task
                                                    </button>
                                                </div>
                                            )}
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="flex items-center gap-2">
                                                <div className="w-1 h-4 bg-primary rounded-full" />
                                                <h4 className="text-sm font-black text-neutral-dark dark:text-white">Audit Logs</h4>
                                            </div>
                                            <div className="bg-white/85 dark:bg-gray-800/70 backdrop-blur-md rounded-2xl border border-neutral-medium/60 dark:border-gray-700 shadow-sm overflow-hidden">
                                                <div className={`${specialAuditLogs.length > 0 || isSpecialAuditLoading ? 'min-h-[330px]' : ''} transition-opacity duration-200 ${isSpecialAuditLoading && specialAuditLogs.length > 0 ? 'opacity-70' : 'opacity-100'}`}>
                                                    {specialAuditLogs.length > 0 ? (
                                                        specialAuditLogs.map((log) => {
                                                            const isExpanded = expandedSpecialAuditLogId === log.id;
                                                            const detailRows = getSpecialAuditDetailRows(log.details);
                                                            const hasDetails = detailRows.length > 0;
                                                            return (
                                                                <div key={log.id} className="border-b border-neutral-medium/40 dark:border-gray-700/60 last:border-0 hover:bg-neutral-light/50 dark:hover:bg-gray-800 transition-colors">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => hasDetails && setExpandedSpecialAuditLogId(isExpanded ? null : log.id)}
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
                                                                        {(formatSpecialAuditChangeSummary(log) || log.summary) && (
                                                                            <p className="mt-2 text-[11px] font-medium text-secondary dark:text-gray-400">{formatSpecialAuditChangeSummary(log) || log.summary}</p>
                                                                        )}
                                                                    </button>
                                                                    {isExpanded && (
                                                                        <div className="mx-5 mb-3 rounded-xl border border-neutral-medium/50 dark:border-gray-700/70 bg-neutral-light/40 dark:bg-gray-900/40 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
                                                                            <div className="grid grid-cols-[1fr_1fr_1fr] border-b border-neutral-medium/40 dark:border-gray-700/60 bg-white/50 dark:bg-gray-800/50">
                                                                                <div className="px-3 py-2 text-[9px] font-black text-secondary/70 uppercase tracking-widest">Field</div>
                                                                                <div className="px-3 py-2 text-[9px] font-black text-secondary/70 uppercase tracking-widest">Before</div>
                                                                                <div className="px-3 py-2 text-[9px] font-black text-secondary/70 uppercase tracking-widest">After</div>
                                                                            </div>
                                                                            {detailRows.map((row) => (
                                                                                <div key={row.label} className="grid grid-cols-[1fr_1fr_1fr] items-start border-b border-neutral-medium/30 dark:border-gray-700/50 last:border-0">
                                                                                    <div className="px-3 py-2 text-[10px] font-black text-neutral-dark dark:text-white">{row.label}</div>
                                                                                    <div className="px-3 py-2 text-[10px] font-semibold text-secondary dark:text-gray-400">
                                                                                        <div className="max-h-24 overflow-y-auto break-words pr-1 custom-scrollbar">{formatSpecialAuditDetailValue(row.key, row.before)}</div>
                                                                                    </div>
                                                                                    <div className="px-3 py-2 text-[10px] font-semibold text-secondary dark:text-gray-400">
                                                                                        <div className="max-h-24 overflow-y-auto break-words pr-1 custom-scrollbar">{formatSpecialAuditDetailValue(row.key, row.after)}</div>
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })
                                                    ) : isSpecialAuditLoading ? (
                                                        <div className="h-[330px] flex flex-col items-center justify-center gap-2 text-xs font-bold text-secondary/60">
                                                            <Loader2 size={16} className="animate-spin text-primary/70" />
                                                            Loading audit logs...
                                                        </div>
                                                    ) : (
                                                        <div className="m-4 py-8 text-center border border-dashed border-neutral-medium dark:border-gray-700 rounded-[2rem] bg-white/40 dark:bg-gray-900/40">
                                                            <p className="text-[9px] text-secondary font-black uppercase tracking-widest opacity-30">No audit logs recorded</p>
                                                        </div>
                                                    )}
                                                </div>
                                                {specialAuditTotalPages > 1 && (
                                                    <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-neutral-medium/40 dark:border-gray-700/60 bg-neutral-light/30 dark:bg-gray-900/30">
                                                        <button
                                                            onClick={() => loadSpecialAuditLogs(selectedItem, Math.max(specialAuditPage - 1, 1))}
                                                            disabled={isSpecialAuditLoading || specialAuditPage <= 1}
                                                            className="px-3 py-1.5 rounded-lg border border-neutral-medium dark:border-gray-700 text-[10px] font-black text-secondary hover:text-primary hover:border-primary disabled:opacity-40 disabled:cursor-not-allowed"
                                                        >
                                                            Previous
                                                        </button>
                                                        <span className="text-[10px] font-black text-secondary dark:text-gray-400">Page {specialAuditPage} of {specialAuditTotalPages}</span>
                                                        <button
                                                            onClick={() => loadSpecialAuditLogs(selectedItem, Math.min(specialAuditPage + 1, specialAuditTotalPages))}
                                                            disabled={isSpecialAuditLoading || specialAuditPage >= specialAuditTotalPages}
                                                            className="px-3 py-1.5 rounded-lg border border-neutral-medium dark:border-gray-700 text-[10px] font-black text-secondary hover:text-primary hover:border-primary disabled:opacity-40 disabled:cursor-not-allowed"
                                                        >
                                                            Next
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </section>
                                );
                            })()}
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Delete Activity Confirmation Modal */}
            {showDeleteActivityModal && (
                <div className="fixed inset-0 z-[11000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-sm w-full shadow-2xl border border-rose-100 dark:border-rose-900/30 animate-in zoom-in-95 duration-300">
                        <div className="flex flex-col items-center text-center">
                            <div className="w-16 h-16 bg-rose-100 dark:bg-rose-900/30 rounded-full flex items-center justify-center text-rose-600 dark:text-rose-400 mb-6">
                                <Trash2 size={32} />
                            </div>

                            <h3 className="text-xl font-bold text-neutral-dark dark:text-white mb-2">
                                Delete Activity Log?
                            </h3>
                            <p className="text-sm text-secondary dark:text-gray-400 mb-8 leading-relaxed">
                                Are you sure you want to remove this log? This action cannot be undone.
                            </p>

                            <div className="flex gap-3 w-full">
                                <button
                                    onClick={() => setShowDeleteActivityModal(false)}
                                    disabled={isProcessing}
                                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-secondary hover:bg-neutral-light dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleDeleteActivity}
                                    disabled={isProcessing}
                                    className="flex-1 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-rose-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    {isProcessing ? (
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
                </div>
            )}

            {/* Delete Task Confirmation Modal */}
            {showDeleteTaskModal && taskToDelete && (
                <div className="fixed inset-0 z-[11000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-sm w-full shadow-2xl border border-rose-100 dark:border-rose-900/30 animate-in zoom-in-95 duration-300">
                        <div className="flex flex-col items-center text-center">
                            <div className="w-16 h-16 bg-rose-100 dark:bg-rose-900/30 rounded-full flex items-center justify-center text-rose-600 dark:text-rose-400 mb-6">
                                <Trash2 size={32} />
                            </div>

                            <h3 className="text-xl font-bold text-neutral-dark dark:text-white mb-2">
                                Delete Task?
                            </h3>
                            <p className="text-sm text-secondary dark:text-gray-400 mb-8 leading-relaxed">
                                Are you sure you want to remove <span className="font-bold text-neutral-dark dark:text-white">"{taskToDelete.taskName}"</span>?<br />
                                <span className="text-rose-600 dark:text-rose-400 font-medium">This will also delete all associated progress logs.</span><br />
                                This action cannot be undone.
                            </p>

                            <div className="flex gap-3 w-full">
                                <button
                                    onClick={() => {
                                        setShowDeleteTaskModal(false);
                                        setTaskToDelete(null);
                                    }}
                                    disabled={isProcessing}
                                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-secondary hover:bg-neutral-light dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleDeleteTask}
                                    disabled={isProcessing}
                                    className="flex-1 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-rose-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    {isProcessing ? (
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
                </div>
            )}

            {/* Unfile Retainer Confirmation Modal */}
            {showUnfileModal && logToUnfile && (
                <div className="fixed inset-0 z-[11000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-sm w-full shadow-2xl border border-rose-100 dark:border-rose-900/30 animate-in zoom-in-95 duration-300">
                        <div className="flex flex-col items-center text-center">
                            <div className="w-16 h-16 bg-rose-100 dark:bg-rose-900/30 rounded-full flex items-center justify-center text-rose-600 dark:text-rose-400 mb-6">
                                <AlertTriangle size={32} />
                            </div>

                            <h3 className="text-xl font-bold text-neutral-dark dark:text-white mb-2">
                                Unfile Compliance?
                            </h3>
                            <p className="text-sm text-secondary dark:text-gray-400 mb-8 leading-relaxed">
                                This will remove the filed date and remarks for <span className="font-bold text-neutral-dark dark:text-white">"{logToUnfile.complianceName || logToUnfile.engagementName || 'this compliance'}"</span>.<br />
                                <span className="text-rose-600 dark:text-rose-400 font-medium">The compliance will return to Pending or Late based on its deadline.</span><br />
                                This action cannot be undone.
                            </p>

                            <div className="flex gap-3 w-full">
                                <button
                                    onClick={() => {
                                        setShowUnfileModal(false);
                                        setLogToUnfile(null);
                                    }}
                                    disabled={isProcessing}
                                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-secondary hover:bg-neutral-light dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleUnfileRetainerLog}
                                    disabled={isProcessing}
                                    className="flex-1 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-rose-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    {isProcessing ? (
                                        <>
                                            <Loader2 size={16} className="animate-spin" />
                                            Unfiling...
                                        </>
                                    ) : (
                                        'Yes, Unfile'
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const CollapsibleSection: React.FC<{
    title: string;
    count: number;
    icon: React.ReactNode;
    children: React.ReactNode;
    defaultOpen?: boolean;
    color?: string;
}> = ({ title, count, icon, children, defaultOpen = false, color = "primary" }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    return (
        <div className="mb-4">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-3 mb-2 pl-1 transition-colors group"
            >
                <ChevronRight
                    size={16}
                    className={`transition-transform duration-300 ${isOpen ? 'rotate-90 text-primary' : 'text-secondary/50 group-hover:text-secondary'}`}
                />
                <span className={`text-[13px] font-black uppercase tracking-[0.1em] transition-colors ${isOpen ? 'text-neutral-dark dark:text-white' : 'text-secondary group-hover:text-neutral-dark dark:group-hover:text-white'}`}>
                    {title}
                </span>
                <span className="ml-1 px-2 py-0.5 rounded-lg bg-primary/10 text-[10px] font-black text-primary shadow-sm shadow-primary/5">
                    {count}
                </span>
            </button>
            {isOpen && (
                <div className="mt-2 bg-white dark:bg-gray-800 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-lg shadow-neutral-dark/5 overflow-x-auto">
                    {children}
                </div>
            )}
        </div>
    );
};

const RetainerTable: React.FC<{
    instances: any[];
    user: any;
    onSelect: (inst: any) => void;
    allUsers: any[];
    groupBy: string;
}> = ({ instances, user, onSelect, allUsers, groupBy }) => {
    const isStaff = user?.role === UserRole.STAFF;
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

    const toggleGroup = (group: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(group)) next.delete(group);
            else next.add(group);
            return next;
        });
    };

    const getGroupStats = (items: any[]) => items.reduce((acc, inst) => {
        if (inst.status === 'LATE') acc.late += 1;
        else if (inst.status === 'Filed') acc.filed += 1;
        else acc.pending += 1;
        return acc;
    }, { late: 0, pending: 0, filed: 0 });

    const renderRow = (inst: any, isChild = false) => (
        <tr
            key={inst.id}
            onClick={() => onSelect(inst)}
            className={`group cursor-pointer transition-all duration-300 hover:bg-primary/[0.02] dark:hover:bg-primary/[0.05] border-b border-neutral-medium/50 dark:border-gray-800 last:border-0`}
        >
            <td className="px-4 py-2">
                <div className="font-bold text-neutral-dark dark:text-white text-[12px] tracking-tight group-hover:text-primary transition-colors" title={inst.clientName}>
                    {inst.clientName}
                </div>
            </td>
            <td className="px-4 py-2">
                <div className="text-[11.5px] font-bold text-secondary dark:text-gray-400 leading-snug" title={inst.complianceName}>
                    {inst.complianceName}
                </div>
            </td>
            <td className="px-4 py-2">
                <div className="flex items-center gap-1.5">
                    <Calendar size={12} className="text-secondary/50 dark:text-gray-400/50" />
                    <span className="text-[11px] font-extrabold text-neutral-dark dark:text-white">{inst.dueDate}</span>
                </div>
            </td>
            <td className="px-4 py-2">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider border shadow-sm ${inst.status === 'Filed'
                        ? 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
                        : inst.status === 'LATE'
                            ? 'bg-rose-50 text-rose-600 border-rose-100 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20'
                            : 'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20'
                    }`}>
                    <div className={`w-1 h-1 rounded-full mr-1.5 ${inst.status === 'Filed' ? 'bg-emerald-500' : inst.status === 'LATE' ? 'bg-rose-500' : 'bg-amber-500'
                        }`} />
                    {inst.status}
                </span>
            </td>
            <td className="px-4 py-2">
                <StaffAvatar staffName={inst.assignedStaff} allUsers={allUsers} />
            </td>
            <td className="px-4 py-2 text-right">
                <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-all transform translate-x-1 group-hover:translate-x-0">
                    <div className="p-1.5 bg-primary text-white rounded-lg shadow-lg shadow-primary/20 scale-90 group-hover:scale-100 transition-transform">
                        <ArrowUpRight size={12} strokeWidth={3} />
                    </div>
                </div>
            </td>
        </tr>
    );

    const renderTable = (items: any[]) => (
        <table className="w-full text-left border-collapse table-fixed">
            <thead>
                <tr className="bg-neutral-light/50 dark:bg-gray-900/50 border-b border-neutral-medium dark:border-gray-700">
                    <th className="w-[28%] px-4 py-2.5 text-[10px] font-black text-secondary dark:text-gray-400 uppercase tracking-[0.18em]">Client Entity</th>
                    <th className="w-[24%] px-4 py-2.5 text-[10px] font-black text-secondary dark:text-gray-400 uppercase tracking-[0.18em]">Compliance Type</th>
                    <th className="w-[14%] px-4 py-2.5 text-[10px] font-black text-secondary dark:text-gray-400 uppercase tracking-[0.18em]">Due Date</th>
                    <th className="w-[12%] px-4 py-2.5 text-[10px] font-black text-secondary dark:text-gray-400 uppercase tracking-[0.18em]">Status</th>
                    <th className="w-[14%] px-4 py-2.5 text-[10px] font-black text-secondary dark:text-gray-400 uppercase tracking-[0.18em]">Assigned To</th>
                    <th className="w-[8%] px-4 py-3 text-right"></th>
                </tr>
            </thead>
            <tbody className="divide-y divide-neutral-medium/30 dark:divide-gray-800">
                {groupBy === 'None' ? items.map(inst => renderRow(inst)) : 
                    (Object.entries(items.reduce((acc, inst) => {
                        const key = groupBy === 'Client' ? inst.clientName : groupBy === 'Compliance' ? inst.complianceName : inst.assignedStaff;
                        if (!acc[key]) acc[key] = [];
                        acc[key].push(inst);
                        return acc;
                    }, {} as Record<string, any[]>)) as [string, any][])
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([group, subItems]) => {
                        const isExpanded = expandedGroups.has(group);
                        const stats = getGroupStats(subItems);

                        return (
                            <React.Fragment key={group}>
                                <tr
                                    onClick={() => toggleGroup(group)}
                                    className="bg-neutral-light/40 dark:bg-gray-900/50 cursor-pointer hover:bg-primary/[0.04] dark:hover:bg-primary/[0.08] transition-colors"
                                >
                                    <td colSpan={6} className="px-5 py-2.5 border-b border-neutral-medium/50 dark:border-gray-800">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <ChevronRight
                                                size={14}
                                                className={`text-secondary/60 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                            />
                                            {groupBy === 'Staff' ? (
                                                <StaffGroupLabel staffName={group} allUsers={allUsers} />
                                            ) : (
                                                <span className="text-[11px] font-bold text-neutral-dark dark:text-white">{group}</span>
                                            )}
                                            <span className="px-1.5 py-0.5 rounded-md bg-white dark:bg-gray-800 text-[9px] font-black text-primary border border-neutral-medium dark:border-gray-700">
                                                {subItems.length} ITEMS
                                            </span>
                                            <div className="flex items-center gap-1 ml-auto">
                                                {stats.late > 0 && (
                                                    <span className="px-1.5 py-0.5 rounded-md bg-rose-50 text-[9px] font-black text-rose-600 border border-rose-100 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20">
                                                        {stats.late} LATE
                                                    </span>
                                                )}
                                                {stats.pending > 0 && (
                                                    <span className="px-1.5 py-0.5 rounded-md bg-amber-50 text-[9px] font-black text-amber-600 border border-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20">
                                                        {stats.pending} PENDING
                                                    </span>
                                                )}
                                                {stats.filed > 0 && (
                                                    <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 text-[9px] font-black text-emerald-600 border border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
                                                        {stats.filed} FILED
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                                {isExpanded && subItems.map(inst => renderRow(inst, true))}
                            </React.Fragment>
                        );
                    })
                }
            </tbody>
        </table>
    );

    if (isStaff) return <div className="bg-white dark:bg-gray-800 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-lg shadow-neutral-dark/5 overflow-x-auto">{renderTable(instances)}</div>;

    return <div className="bg-white dark:bg-gray-800 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-lg shadow-neutral-dark/5 overflow-x-auto">{renderTable(instances)}</div>;
};

const SpecialTable: React.FC<{
    instances: any[];
    user: any;
    onSelect: (inst: any) => void;
    allUsers: any[];
    groupBy: string;
}> = ({ instances, user, onSelect, allUsers, groupBy }) => {
    const isStaff = user?.role === UserRole.STAFF;
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

    const toggleGroup = (group: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(group)) next.delete(group);
            else next.add(group);
            return next;
        });
    };

    const getGroupStats = (items: any[]) => items.reduce((acc, inst) => {
        const status = inst.displayStatus || inst.status;
        if (status === 'Overdue') acc.overdue += 1;
        else if (status === 'Completed') acc.completed += 1;
        else if (status === 'Blocked') acc.blocked += 1;
        else if (status === 'In Progress') acc.inProgress += 1;
        else acc.planning += 1;
        return acc;
    }, { planning: 0, inProgress: 0, completed: 0, blocked: 0, overdue: 0 });

    const renderRow = (inst: any, isChild = false) => {
        // Frontend-only: show "Overdue" when not Completed and today > endDate
        let displayStatus = inst.displayStatus || inst.status;
        if (inst.status !== 'Completed' && inst.endDate) {
            try {
                const [m, d, y] = inst.endDate.split('/');
                const endDate = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
                endDate.setHours(23, 59, 59, 999);
                const today = new Date();
                if (today > endDate) {
                    displayStatus = 'Overdue';
                }
            } catch (e) {}
        }

        const statusColors: any = {
            'Completed': 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
            'In Progress': 'bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20',
            'Blocked': 'bg-rose-50 text-rose-600 border-rose-100 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20',
            'Planning': 'bg-neutral-50 text-neutral-600 border-neutral-100 dark:bg-gray-500/10 dark:text-gray-400 dark:border-gray-500/20',
            'Overdue': 'bg-red-50 text-red-600 border-red-100 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20'
        };
        const statusDot: any = { 'Completed': 'bg-emerald-500', 'In Progress': 'bg-blue-500', 'Blocked': 'bg-rose-500', 'Planning': 'bg-neutral-400', 'Overdue': 'bg-red-500' };

        return (
            <tr
                key={inst.id}
                onClick={() => onSelect(inst)}
                className="group cursor-pointer transition-all duration-300 hover:bg-primary/[0.02] dark:hover:bg-primary/[0.05] border-b border-neutral-medium/50 dark:border-gray-800 last:border-0"
            >
                <td className="px-4 py-2.5">
                    <div className="font-black text-neutral-dark dark:text-white text-[13px] tracking-tight group-hover:text-primary transition-colors" title={inst.engagementName}>
                        {inst.engagementName}
                    </div>
                </td>
                <td className="px-4 py-2.5">
                    <div className="font-bold text-secondary dark:text-gray-400 text-[12px] truncate" title={inst.clientName}>{inst.clientName}</div>
                </td>
                <td className="px-4 py-2.5">
                    <StaffAvatar staffName={inst.assignedStaff} allUsers={allUsers} />
                </td>
                <td className="px-4 py-2.5">
                    <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                            <Clock size={12} className="text-secondary/50 dark:text-gray-400/50" />
                            <span className="text-[12px] font-black text-neutral-dark dark:text-white">
                                {(() => {
                                    if (!inst.endDate) return 'No Date';
                                    try {
                                        const [m, d, y] = inst.endDate.split('/');
                                        const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
                                        return date.toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' });
                                    } catch (e) { return inst.endDate; }
                                })()}
                            </span>
                        </div>
                        <span className="text-[10px] font-bold text-secondary/40 dark:text-gray-400/40">
                            Starts: {(() => {
                                if (!inst.startDate) return 'No Date';
                                try {
                                    const [m, d, y] = inst.startDate.split('/');
                                    const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
                                    return date.toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' });
                                } catch (e) { return inst.startDate; }
                            })()}
                        </span>
                    </div>
                </td>
                <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border shadow-sm ${statusColors[displayStatus] || statusColors['Planning']}`}>
                        <div className={`w-1 h-1 rounded-full mr-1.5 ${statusDot[displayStatus] || statusDot['Planning']}`} />
                        {displayStatus}
                    </span>
                </td>
                <td className="px-4 py-2.5 text-right">
                    <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-all transform translate-x-1 group-hover:translate-x-0">
                        <div className="p-1.5 bg-primary text-white rounded-lg shadow-lg shadow-primary/20 scale-90 group-hover:scale-100 transition-transform">
                            <ArrowUpRight size={12} strokeWidth={3} />
                        </div>
                    </div>
                </td>
            </tr>
        );
    };

    const renderTable = (items: any[]) => (
        <table className="w-full text-left border-collapse table-fixed">
            <thead>
                <tr className="bg-neutral-light/50 dark:bg-gray-900/50 border-b border-neutral-medium dark:border-gray-700">
                    <th className="w-[25%] px-4 py-3 text-[10px] font-black text-secondary dark:text-gray-400 uppercase tracking-[0.2em]">Engagement Title</th>
                    <th className="w-[22%] px-4 py-3 text-[10px] font-black text-secondary dark:text-gray-400 uppercase tracking-[0.2em]">Client</th>
                    <th className="w-[15%] px-4 py-3 text-[10px] font-black text-secondary dark:text-gray-400 uppercase tracking-[0.2em]">Assigned To</th>
                    <th className="w-[18%] px-4 py-3 text-[10px] font-black text-secondary dark:text-gray-400 uppercase tracking-[0.2em]">Timeline</th>
                    <th className="w-[12%] px-4 py-3 text-[10px] font-black text-secondary dark:text-gray-400 uppercase tracking-[0.2em]">Status</th>
                    <th className="w-[8%] px-4 py-3 text-right"></th>
                </tr>
            </thead>
            <tbody className="divide-y divide-neutral-medium/30 dark:divide-gray-800">
                {groupBy === 'None' ? items.map(inst => renderRow(inst)) : 
                    (Object.entries(items.reduce((acc, inst) => {
                        const key = groupBy === 'Client' ? inst.clientName : groupBy === 'Status' ? (inst.displayStatus || inst.status) : inst.assignedStaff;
                        if (!acc[key]) acc[key] = [];
                        acc[key].push(inst);
                        return acc;
                    }, {} as Record<string, any[]>)) as [string, any[]][])
                        .sort(([a], [b]) => {
                            if (groupBy === 'Status') {
                                return (specialStatusOrder[a] ?? 99) - (specialStatusOrder[b] ?? 99);
                            }
                            return a.localeCompare(b);
                        })
                        .map(([group, subItems]) => {
                            const isExpanded = expandedGroups.has(group);
                            const stats = getGroupStats(subItems);

                            return (
                                <React.Fragment key={group}>
                                    <tr
                                        onClick={() => toggleGroup(group)}
                                        className="bg-neutral-light/40 dark:bg-gray-900/50 cursor-pointer hover:bg-primary/[0.04] dark:hover:bg-primary/[0.08] transition-colors"
                                    >
                                        <td colSpan={6} className="px-5 py-2.5 border-b border-neutral-medium/50 dark:border-gray-800">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <ChevronRight
                                                    size={14}
                                                    className={`text-secondary/60 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                                />
                                                {groupBy === 'Staff' ? (
                                                    <StaffGroupLabel staffName={group} allUsers={allUsers} />
                                                ) : (
                                                    <span className="text-[11px] font-bold text-neutral-dark dark:text-white">{group}</span>
                                                )}
                                                <span className="px-1.5 py-0.5 rounded-md bg-white dark:bg-gray-800 text-[9px] font-black text-primary border border-neutral-medium dark:border-gray-700">
                                                    {subItems.length} ITEMS
                                                </span>
                                                <div className="flex items-center gap-1 ml-auto">
                                                    {stats.planning > 0 && (
                                                        <span className="px-1.5 py-0.5 rounded-md bg-neutral-50 text-[9px] font-black text-neutral-600 border border-neutral-100 dark:bg-gray-500/10 dark:text-gray-400 dark:border-gray-500/20">
                                                            {stats.planning} Planning
                                                        </span>
                                                    )}
                                                    {stats.overdue > 0 && (
                                                        <span className="px-1.5 py-0.5 rounded-md bg-rose-50 text-[9px] font-black text-rose-600 border border-rose-100 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20">
                                                            {stats.overdue} Overdue
                                                        </span>
                                                    )}
                                                    {stats.inProgress > 0 && (
                                                        <span className="px-1.5 py-0.5 rounded-md bg-blue-50 text-[9px] font-black text-blue-600 border border-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20">
                                                            {stats.inProgress} In Progress
                                                        </span>
                                                    )}
                                                    {stats.completed > 0 && (
                                                        <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 text-[9px] font-black text-emerald-600 border border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
                                                            {stats.completed} Completed
                                                        </span>
                                                    )}
                                                    {stats.blocked > 0 && (
                                                        <span className="px-1.5 py-0.5 rounded-md bg-red-50 text-[9px] font-black text-red-600 border border-red-100 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20">
                                                            {stats.blocked} Blocked
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                    {isExpanded && subItems.map(inst => renderRow(inst, true))}
                                </React.Fragment>
                            );
                        })
                }
            </tbody>
        </table>
    );

    if (isStaff) return <div className="bg-white dark:bg-gray-800 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-lg shadow-neutral-dark/5 overflow-x-auto">{renderTable(instances)}</div>;

    return <div className="bg-white dark:bg-gray-800 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-lg shadow-neutral-dark/5 overflow-x-auto">{renderTable(instances)}</div>;
};

// --- Internal Helper Components to Reduce Duplication ---

const StaffAvatar: React.FC<{
    staffName: string;
    allUsers: any[];
}> = ({ staffName, allUsers }) => {
    const staff = allUsers.find(u => `${u.firstName} ${u.lastName}` === staffName || u.firstName === staffName);

    return (
        <UserHoverCard user={staff} fallbackName={staffName} size="md" showName />
    );
};

const StaffGroupLabel: React.FC<{
    staffName: string;
    allUsers: any[];
}> = ({ staffName, allUsers }) => {
    const staff = allUsers.find(u => `${u.firstName} ${u.lastName}` === staffName || u.firstName === staffName);

    return (
        <UserHoverCard user={staff} fallbackName={staffName} size="sm" showName nameClassName="text-[12px] font-bold text-neutral-dark dark:text-white truncate" />
    );
};

const EmptyState: React.FC<{
    icon: React.ElementType;
    title: string;
    query?: string;
    defaultMessage: string;
}> = ({ icon: Icon, title, query, defaultMessage }) => (
    <div key={`${title}-${query || 'empty'}`} className="p-16 text-center bg-white dark:bg-gray-800 rounded-2xl border border-dashed border-neutral-medium dark:border-gray-700 animate-in fade-in zoom-in-95 slide-in-from-top-4 duration-700">
        <div className="relative w-20 h-20 mx-auto mb-6">
            <Icon className="absolute inset-0 m-auto text-primary/10" size={64} />
            <Search className="absolute bottom-0 right-0 text-primary/30" size={24} />
        </div>
        <h3 className="text-xl font-black text-neutral-dark dark:text-white tracking-tight">{title}</h3>
        <p className="text-sm text-secondary/60 font-medium max-w-xs mx-auto mt-2">
            {query ? `No results match "${query}" in your current filters.` : defaultMessage}
        </p>
    </div>
);

const PaginationControls: React.FC<{
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (page: number) => void;
}> = ({ page, pageSize, total, onPageChange }) => {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const start = (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, total);

    return (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-gray-800 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-sm px-4 py-3">
            <p className="text-[11px] font-black text-secondary dark:text-gray-400 uppercase tracking-widest">
                Showing {start}-{end} of {total}
            </p>
            <div className="flex items-center gap-2">
                <button
                    onClick={() => onPageChange(Math.max(1, page - 1))}
                    disabled={page <= 1}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-medium dark:border-gray-700 text-[11px] font-black uppercase tracking-wider text-neutral-dark dark:text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-light dark:hover:bg-gray-700 transition-colors"
                >
                    <ChevronRight size={14} className="rotate-180" />
                    Prev
                </button>
                <span className="px-3 py-1.5 rounded-lg bg-neutral-light dark:bg-gray-900 text-[11px] font-black text-primary">
                    {page} / {totalPages}
                </span>
                <button
                    onClick={() => onPageChange(Math.min(totalPages, page + 1))}
                    disabled={page >= totalPages}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-medium dark:border-gray-700 text-[11px] font-black uppercase tracking-wider text-neutral-dark dark:text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-light dark:hover:bg-gray-700 transition-colors"
                >
                    Next
                    <ChevronRight size={14} />
                </button>
            </div>
        </div>
    );
};

const RetainerSummaryStrip: React.FC<{
    summary: { total: number; late: number; pending: number; filed: number; staffCount: number };
}> = ({ summary }) => {
    const items = [
        { label: 'Total', value: summary.total, tone: 'text-primary bg-primary/10 border-primary/15' },
        { label: 'Late', value: summary.late, tone: 'text-rose-600 bg-rose-50 border-rose-100 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20' },
        { label: 'Pending', value: summary.pending, tone: 'text-amber-600 bg-amber-50 border-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20' },
        { label: 'Filed', value: summary.filed, tone: 'text-emerald-600 bg-emerald-50 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20' },
        { label: 'Staff', value: summary.staffCount, tone: 'text-secondary bg-neutral-light border-neutral-medium dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700' }
    ];

    return (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {items.map(item => (
                <div key={item.label} className={`rounded-xl border px-3 py-2 ${item.tone}`}>
                    <div className="text-[11px] font-bold opacity-70">{item.label}</div>
                    <div className="text-xl font-black leading-tight">{item.value}</div>
                </div>
            ))}
        </div>
    );
};

const SpecialSummaryStrip: React.FC<{
    summary: { total: number; planning: number; inProgress: number; completed: number; blocked: number; overdue: number };
}> = ({ summary }) => {
    const items = [
        { label: 'Total', value: summary.total, tone: 'text-primary bg-primary/10 border-primary/15' },
        { label: 'Overdue', value: summary.overdue, tone: 'text-rose-600 bg-rose-50 border-rose-100 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20' },
        { label: 'Blocked', value: summary.blocked, tone: 'text-red-600 bg-red-50 border-red-100 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20' },
        { label: 'In Progress', value: summary.inProgress, tone: 'text-blue-600 bg-blue-50 border-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20' },
        { label: 'Planning', value: summary.planning, tone: 'text-neutral-600 bg-neutral-50 border-neutral-100 dark:bg-gray-500/10 dark:text-gray-300 dark:border-gray-500/20' },
        { label: 'Completed', value: summary.completed, tone: 'text-emerald-600 bg-emerald-50 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20' },
    ];

    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
            {items.map(item => (
                <div key={item.label} className={`rounded-xl border px-3 py-2 ${item.tone}`}>
                    <div className="text-[11px] font-bold opacity-70">{item.label}</div>
                    <div className="text-xl font-black leading-tight">{item.value}</div>
                </div>
            ))}
        </div>
    );
};

const RetainerStatusChips: React.FC<{
    value: string;
    onChange: (status: string) => void;
}> = ({ value, onChange }) => {
    const options = [
        { value: 'All', label: 'All' },
        { value: 'LATE', label: 'Late' },
        { value: 'Pending', label: 'Pending' },
        { value: 'Filed', label: 'Filed' }
    ];

    return (
        <div className="flex items-center gap-1 bg-neutral-light/50 dark:bg-gray-900 rounded-lg p-1 shrink-0 border border-neutral-medium/40 dark:border-gray-700/70">
            {options.map(option => (
                <button
                    key={option.value}
                    onClick={() => onChange(option.value)}
                    className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${value === option.value
                            ? 'bg-white dark:bg-gray-700 text-primary shadow-sm ring-1 ring-primary/15'
                            : 'text-secondary dark:text-gray-400 hover:text-neutral-dark dark:hover:text-white hover:bg-white/50 dark:hover:bg-gray-800'
                        }`}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
};

const SpecialStatusChips: React.FC<{
    value: string;
    onChange: (status: string) => void;
}> = ({ value, onChange }) => {
    const options = [
        { value: 'All', label: 'All' },
        { value: 'Overdue', label: 'Overdue' },
        { value: 'Blocked', label: 'Blocked' },
        { value: 'In Progress', label: 'In Progress' },
        { value: 'Planning', label: 'Planning' },
        { value: 'Completed', label: 'Completed' },
    ];

    return (
        <div className="flex items-center gap-1 bg-neutral-light/50 dark:bg-gray-900 rounded-lg p-1 shrink-0 border border-neutral-medium/40 dark:border-gray-700/70">
            {options.map(option => (
                <button
                    key={option.value}
                    onClick={() => onChange(option.value)}
                    className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${value === option.value
                            ? 'bg-white dark:bg-gray-700 text-primary shadow-sm ring-1 ring-primary/15'
                            : 'text-secondary dark:text-gray-400 hover:text-neutral-dark dark:hover:text-white hover:bg-white/50 dark:hover:bg-gray-800'
                        }`}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
};

const RetainerGroupChips: React.FC<{
    value: string;
    onChange: (val: any) => void;
    userRole?: string;
}> = ({ value, onChange, userRole }) => {
    const showStaffOption = userRole !== UserRole.STAFF;
    const options = [
        ...(showStaffOption ? [{ value: 'Staff', label: 'Staff' }] : []),
        { value: 'Client', label: 'Client' },
        { value: 'Compliance', label: 'Compliance' },
        { value: 'None', label: 'None' }
    ];

    return (
        <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[11px] font-bold text-secondary dark:text-gray-400 hidden sm:block">Group by</span>
            <div className="flex items-center gap-1 bg-neutral-light/50 dark:bg-gray-900 rounded-lg p-1 border border-neutral-medium/40 dark:border-gray-700/70">
                {options.map(option => (
                    <button
                        key={option.value}
                        onClick={() => onChange(option.value)}
                        className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${value === option.value
                                ? 'bg-white dark:bg-gray-700 text-primary shadow-sm ring-1 ring-primary/15'
                                : 'text-secondary dark:text-gray-400 hover:text-neutral-dark dark:hover:text-white hover:bg-white/50 dark:hover:bg-gray-800'
                            }`}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
        </div>
    );
};

const SpecialGroupChips: React.FC<{
    value: string;
    onChange: (val: any) => void;
    userRole?: string;
}> = ({ value, onChange, userRole }) => {
    const showStaffOption = userRole !== UserRole.STAFF;
    const options = [
        ...(showStaffOption ? [{ value: 'Staff', label: 'Staff' }] : []),
        { value: 'Client', label: 'Client' },
        { value: 'Status', label: 'Status' },
        { value: 'None', label: 'None' }
    ];

    return (
        <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[11px] font-bold text-secondary dark:text-gray-400 hidden sm:block">Group by</span>
            <div className="flex items-center gap-1 bg-neutral-light/50 dark:bg-gray-900 rounded-lg p-1 border border-neutral-medium/40 dark:border-gray-700/70">
                {options.map(option => (
                    <button
                        key={option.value}
                        onClick={() => onChange(option.value)}
                        className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${value === option.value
                                ? 'bg-white dark:bg-gray-700 text-primary shadow-sm ring-1 ring-primary/15'
                                : 'text-secondary dark:text-gray-400 hover:text-neutral-dark dark:hover:text-white hover:bg-white/50 dark:hover:bg-gray-800'
                            }`}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
        </div>
    );
};

const GroupBySelect: React.FC<{
    value: string;
    onChange: (val: any) => void;
    activeTab: 'Retainer' | 'Special';
    userRole?: string;
}> = ({ value, onChange, activeTab, userRole }) => {
    const showStaffOption = !(userRole === UserRole.SENIOR || userRole === UserRole.STAFF);

    return (
        <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-secondary dark:text-gray-400 hidden sm:block">Group By:</span>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="pl-2 pr-7 py-1.5 bg-neutral-light/50 dark:bg-gray-900 border border-transparent hover:border-neutral-medium/50 rounded-lg text-[11px] font-bold text-neutral-dark dark:text-white outline-none focus:ring-4 focus:ring-primary/5 transition-all appearance-none cursor-pointer w-[140px]"
                style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%236b7280\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")', backgroundPosition: 'right 0.4rem center', backgroundRepeat: 'no-repeat', backgroundSize: '0.9rem' }}
            >
                <option value="None">No Grouping</option>
                <option value="Client">By Client</option>
                {activeTab === 'Retainer' && <option value="Compliance">By Compliance</option>}
                {showStaffOption && <option value="Staff">By Staff</option>}
            </select>
        </div>
    );
};

export default Engagements;
