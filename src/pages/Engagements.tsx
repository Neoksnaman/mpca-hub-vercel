import React, { useState, useContext, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { AppContext } from '../App';
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
    MoreVertical,
    Trash2,
    AlertTriangle
} from 'lucide-react';
import { UserRole, Status } from '../types';
import { fetchAllData, addRetainerLog, updateRetainerLog, addTask, addActivity, updateTask, updateActivity, deleteActivity, deleteTask, updateSpecial, addNotification } from '../services/googleSheetsService';
import { months, computeActualDueDate } from '../utils/dateUtils';

const normalizeId = (id: any) => String(id || '').trim().replace(/^0+/, '') || '0';

const formatDisplayDate = (dateStr: string) => {
    if (!dateStr || !dateStr.includes('/')) return dateStr;
    const [m, d, y] = dateStr.split('/');
    const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    return date.toLocaleDateString('default', { month: 'long', day: 'numeric', year: 'numeric' });
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

    const [activeTab, setActiveTab] = useState<'Retainer' | 'Special'>('Retainer');
    const [groupBy, setGroupBy] = useState<'None' | 'Client' | 'Compliance' | 'Staff'>('None');
    const [searchQuery, setSearchQuery] = useState('');
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

    const location = useLocation();

    // Auto-switch tab based on navigation state
    useEffect(() => {
        if (location.state && (location.state as any).activeTab) {
            setActiveTab((location.state as any).activeTab);
            
            if ((location.state as any).specialId && specials.length > 0) {
                const targetSpecialId = (location.state as any).specialId;
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
    }, [location.state, specials, clients]);
    const [showDeleteActivityModal, setShowDeleteActivityModal] = useState(false);
    const [activityToDelete, setActivityToDelete] = useState<any | null>(null);
    const [showDeleteTaskModal, setShowDeleteTaskModal] = useState(false);
    const [taskToDelete, setTaskToDelete] = useState<any | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

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
                await updateRetainerLog({
                    deadline: id,
                    period: selectedItem.periodKey,
                    dateCompleted: formattedDate,
                    remarks: remarks
                });
                context?.showToast('Log entry updated successfully', 'success');
                setIsEditingDate(false);
            } else {
                await addRetainerLog({
                    deadline: id,
                    period: selectedItem.periodKey,
                    dateCompleted: formattedDate,
                    remarks: remarks
                });
                context?.showToast('Compliance marked as Filed successfully', 'success');
                setIsDetailOpen(false);
            }
            context?.refreshData();
        } catch (err: any) {
            context?.showToast(err.message || 'Failed to update status', 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleUpdateSpecialStatus = async (newStatus: string) => {
        if (!selectedItem || isProcessing) return;

        // Validation: If status is being set to Completed, all tasks must be completed first
        if (newStatus === 'Completed') {
            const relatedTasks = (context?.taskLog || []).filter(t => normalizeId(t.specialID) === normalizeId(selectedItem.id));
            const incompleteTasks = relatedTasks.filter(t => t.status !== 'Completed');

            if (incompleteTasks.length > 0) {
                context?.showToast(`Cannot complete engagement. ${incompleteTasks.length} task(s) are still pending.`, 'error');
                return;
            }
        }

        setIsProcessing(true);
        try {
            await updateSpecial(selectedItem.id, { status: newStatus });
            context?.showToast(`Status updated to ${newStatus}`, 'success');
            await context?.refreshData();
        } catch (err: any) {
            context?.showToast(err.message || 'Failed to update status', 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleAddTask = async () => {
        if (!selectedItem || !newTaskName) return;
        setIsProcessing(true);
        try {
            const maxId = (context?.taskLog || []).reduce((max, t) => {
                const id = parseInt(t.taskID);
                return isNaN(id) ? max : Math.max(max, id);
            }, 0);
            const nextId = maxId + 1;
            const formattedId = nextId.toString().padStart(4, '0');

            await addTask({
                taskID: formattedId,
                specialID: selectedItem.id,
                taskName: newTaskName,
                status: 'Pending'
            });
            context?.showToast('Task added successfully!', 'success');
            await context?.refreshData();
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

            const taskObj = context?.taskLog.find(t => t.taskID === taskId);
            const specialEng = context?.specials.find(s => s.id === taskObj?.specialID);
            if (specialEng?.assignedStaff) {
                 const staffObj = allUsers.find(u => `${u.firstName} ${u.lastName}` === specialEng.assignedStaff || u.firstName === specialEng.assignedStaff);
                 if (staffObj && staffObj.id !== user?.id) {
                     await addNotification({
                         userId: staffObj.id,
                         title: 'Task Updated',
                         message: `Task "${editTaskName}" was updated to ${editTaskStatus}.`,
                         type: 'Engagement',
                         link: '/engagements'
                     }).catch(() => {});
                 }
            }

            context?.showToast('Task updated successfully!', 'success');
            await context?.refreshData();
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
            const maxId = (context.activityLog || []).reduce((max, a) => {
                const id = parseInt(a.activityID);
                return isNaN(id) ? max : Math.max(max, id);
            }, 0);
            const nextId = maxId + 1;
            const formattedId = nextId.toString().padStart(4, '0');

            // Format date from YYYY-MM-DD to MM/DD/YYYY
            const [y, m, d] = activityDate.split('-');
            const formattedDate = `${m}/${d}/${y}`;

            const newActivity = {
                activityID: formattedId,
                taskID: taskID,
                dateCompleted: formattedDate,
                description: newActivityDesc
            };

            const success = await addActivity(newActivity);
            if (success) {
                const taskObj = context.taskLog.find(t => t.taskID === taskID);
                const specialEng = context.specials.find(s => s.id === taskObj?.specialID);
                if (specialEng?.assignedStaff) {
                     const staffObj = allUsers.find(u => `${u.firstName} ${u.lastName}` === specialEng.assignedStaff || u.firstName === specialEng.assignedStaff);
                     if (staffObj && staffObj.id !== user?.id) {
                         await addNotification({
                             userId: staffObj.id,
                             title: 'New Activity Logged',
                             message: `Progress logged on task "${taskObj?.taskName}": ${newActivityDesc}`,
                             type: 'Engagement',
                             link: '/engagements'
                         }).catch(() => {});
                     }
                }

                setAddingActivityToTaskId(null);
                setNewActivityDesc('');
                context.showToast?.('Progress logged successfully!', 'success');
                await context.refreshData();
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
                const actObj = context.activityLog.find(a => a.activityID === activityID);
                const taskObj = context.taskLog.find(t => t.taskID === actObj?.taskID);
                const specialEng = context.specials.find(s => s.id === taskObj?.specialID);
                if (specialEng?.assignedStaff) {
                     const staffObj = allUsers.find(u => `${u.firstName} ${u.lastName}` === specialEng.assignedStaff || u.firstName === specialEng.assignedStaff);
                     if (staffObj && staffObj.id !== user?.id) {
                         await addNotification({
                             userId: staffObj.id,
                             title: 'Activity Updated',
                             message: `Activity updated for task "${taskObj?.taskName}".`,
                             type: 'Engagement',
                             link: '/engagements'
                         }).catch(() => {});
                     }
                }

                setEditingActivityId(null);
                context.showToast?.('Activity updated successfully!', 'success');
                await context.refreshData();
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
                await context.refreshData();
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
                await context.refreshData();
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
        compliance: 'All'
    });    const years = Array.from({ length: 25 }, (_, i) => String(2026 + i));

    // Special Filters
    const [specialFilter, setSpecialFilter] = useState({
        client: 'All',
        staff: 'All',
        status: 'All',
        priority: 'All',
        due: 'All'
    });

    const isManagerOrAbove = user?.role === UserRole.MANAGER || user?.role === UserRole.SUPERVISOR || user?.role === UserRole.ADMIN;

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
        }
    }, [selectedItem, isDetailOpen]);




    // --- Tab 1: Retainer Monitoring Logic ---
    const retainerInstances = useMemo(() => {
        const deadlines = context?.deadlines || [];
        const currentMonth = retainerFilter.month;
        const currentYear = retainerFilter.year;

        const instances = deadlines.map(d => {
            const retainer = retainers.find(r => normalizeId(r.id) === normalizeId(d.retainerID));
            if (!retainer) return null;

            const client = clients.find(c => normalizeId(c.id) === normalizeId(retainer.clientId));
            if (!client || client.status === 'Inactive') return null;

            const compliance = d.taxID ? context?.taxCompliances?.find(tc => tc.taxID === d.taxID) : null;
            const service = !d.taxID ? context?.services?.find(s => normalizeId(s.id) === normalizeId(d.serviceID)) : null;

            const complianceName = compliance?.complianceName || service?.name || 'General Compliance';

            // Frequency Check: Should this show up in this month?
            const frequency = d.dueDate.startsWith('M') ? 'Monthly' :
                d.dueDate.startsWith('Q') ? 'Quarterly' :
                    (d.dueDate.startsWith('Y') || d.dueDate.startsWith('A')) ? 'Annual' : 'Monthly';

            const calendarOnlyTaxIDs = ['0007', '0008', '0012', '0013', '0016', '0017', '0018', '0019', '0020', '0021', '0022'].map(id => normalizeId(id));
            const isCalendarOnly = calendarOnlyTaxIDs.includes(normalizeId(d.taxID));

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
                const no4thQtrTaxIDs = ['0009', '0010', '0014', '0015'].map(id => normalizeId(id));
                if (no4thQtrTaxIDs.includes(normalizedTaxID) && monthIdx === fyMonth) {
                    return null;
                }
            } else if (frequency === 'Annual') {
                if (monthIdx !== fyMonth) return null;
            }

            const dueInfo = computeActualDueDate(currentMonth, currentYear, d.dueDate, isCalendarOnly ? '12/31' : (client?.fiscalYearEnd || '12/31'));
            const periodKey = `${String(monthIdx).padStart(2, '0')}/${currentYear}`;
            const match = retainerLogs.find(l => normalizeId(l[0]) === normalizeId(d.deadlineID) && l[1] === periodKey);

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
                complianceCode: compliance?.complianceCode || service?.name || d.serviceID,
                frequency: frequency,
                dueDateCode: d.dueDate,
                taxID: d.taxID
            };
        }).filter(Boolean).filter(d => {
            // Search
            if (searchQuery && !d!.clientName.toLowerCase().includes(searchQuery.toLowerCase()) && !d!.complianceName.toLowerCase().includes(searchQuery.toLowerCase())) return false;

            // Client Filter
            if (retainerFilter.client !== 'All' && d!.clientName !== retainerFilter.client) return false;

            // Compliance Filter
            if (retainerFilter.compliance !== 'All') {
                if (d!.complianceCode !== retainerFilter.compliance) return false;
            }

            return true;
        }) as any[];

        const filtered = instances.filter(d => {
            // Role Based Visibility
            if (user?.role === UserRole.STAFF) {
                // Staff can only see their own
                return d!.assignedStaff === user.firstName || d!.assignedStaff === `${user.firstName} ${user.lastName}`;
            } else if (user?.role === UserRole.SENIOR) {
                // Seniors see their own + their team members
                const staff = allUsers.find(u => u.firstName === d!.assignedStaff || `${u.firstName} ${u.lastName}` === d!.assignedStaff);
                const isOwn = d!.assignedStaff === user.firstName || d!.assignedStaff === `${user.firstName} ${user.lastName}`;
                return isOwn || (staff?.team === user.team);
            }
            return true;
        }).sort((a, b) => {
            return a.actualDueDate.getTime() - b.actualDueDate.getTime();
        });

        return filtered;
    }, [context?.deadlines, context?.taxCompliances, retainers, clients, retainerFilter, searchQuery, user, allUsers, retainerLogs]);

    // Dynamic Filter Options based on Role and Time
    const availableRetainerClients = useMemo(() => {
        const deadlines = context?.deadlines || [];
        const currentMonth = retainerFilter.month;
        const currentYear = retainerFilter.year;

        return Array.from(new Set(
            deadlines.map(d => {
                const retainer = retainers.find(r => normalizeId(r.id) === normalizeId(d.retainerID));
                if (!retainer) return null;

                // Role-based visibility check
                if (user?.role === UserRole.STAFF) {
                    if (retainer.assignedStaff !== user.firstName && retainer.assignedStaff !== `${user.firstName} ${user.lastName}`) return null;
                } else if (user?.role === UserRole.SENIOR) {
                    const staff = allUsers.find(u => u.firstName === retainer.assignedStaff || `${u.firstName} ${u.lastName}` === retainer.assignedStaff);
                    const isOwn = retainer.assignedStaff === user.firstName || retainer.assignedStaff === `${user.firstName} ${user.lastName}`;
                    if (!isOwn && staff?.team !== user.team) return null;
                }

                const client = clients.find(c => normalizeId(c.id) === normalizeId(retainer.clientId));
                if (!client) return null;

                // Frequency Check
                const frequency = d.dueDate.startsWith('M') ? 'Monthly' :
                    d.dueDate.startsWith('Q') ? 'Quarterly' :
                        (d.dueDate.startsWith('Y') || d.dueDate.startsWith('A')) ? 'Annual' : 'Monthly';

                const calendarOnlyTaxIDs = ['0007', '0008', '0012', '0013', '0016', '0017', '0018', '0019', '0020', '0021', '0022'].map(id => normalizeId(id));
                const isCalendarOnly = calendarOnlyTaxIDs.includes(normalizeId(d.taxID));
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

                return client.name;
            }).filter(Boolean)
        )).sort();
    }, [context?.deadlines, retainers, clients, retainerFilter.month, retainerFilter.year, user, allUsers]);

    const availableRetainerCompliances = useMemo(() => {
        const deadlines = context?.deadlines || [];
        const currentMonth = retainerFilter.month;
        const currentYear = retainerFilter.year;

        return Array.from(new Set(
            deadlines.map(d => {
                const retainer = retainers.find(r => normalizeId(r.id) === normalizeId(d.retainerID));
                if (!retainer) return null;

                // Role-based visibility
                if (user?.role === UserRole.STAFF) {
                    if (retainer.assignedStaff !== user.firstName && retainer.assignedStaff !== `${user.firstName} ${user.lastName}`) return null;
                } else if (user?.role === UserRole.SENIOR) {
                    const staff = allUsers.find(u => u.firstName === retainer.assignedStaff || `${u.firstName} ${u.lastName}` === retainer.assignedStaff);
                    const isOwn = retainer.assignedStaff === user.firstName || retainer.assignedStaff === `${user.firstName} ${user.lastName}`;
                    if (!isOwn && staff?.team !== user.team) return null;
                }

                const client = clients.find(c => normalizeId(c.id) === normalizeId(retainer.clientId));
                if (!client || client.status === 'Inactive') return null;
                if (retainerFilter.client !== 'All' && client?.name !== retainerFilter.client) return null;

                // Frequency Check
                const frequency = d.dueDate.startsWith('M') ? 'Monthly' :
                    d.dueDate.startsWith('Q') ? 'Quarterly' :
                        (d.dueDate.startsWith('Y') || d.dueDate.startsWith('A')) ? 'Annual' : 'Monthly';

                const calendarOnlyTaxIDs = ['0007', '0008', '0012', '0013', '0016', '0017', '0018', '0019', '0020', '0021', '0022'].map(id => normalizeId(id));
                const isCalendarOnly = calendarOnlyTaxIDs.includes(normalizeId(d.taxID));
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

                const compliance = d.taxID ? context?.taxCompliances?.find(tc => tc.taxID === d.taxID) : null;
                const service = !d.taxID ? context?.services?.find(s => normalizeId(s.id) === normalizeId(d.serviceID)) : null;
                return compliance?.complianceCode || service?.name || d.serviceID;
            }).filter(Boolean)
        )).sort();
    }, [context?.deadlines, context?.taxCompliances, retainers, clients, retainerFilter.month, retainerFilter.year, retainerFilter.client, user, allUsers]);

    // --- Tab 2: Special Engagements Logic ---
    // Dynamic Filter Options for Specials
    const availableSpecialClients = useMemo(() => {
        return Array.from(new Set(
            specials.map(s => {
                const client = clients.find(c => normalizeId(c.id) === normalizeId(s.clientId));
                if (!client || client.status === 'Inactive') return null;

                // Role Based Visibility
                if (!isManagerOrAbove) {
                    if (user?.role === UserRole.SENIOR) {
                        const staff = allUsers.find(u => u.id === s.assignedStaff || `${u.firstName} ${u.lastName}` === s.assignedStaff);
                        if (staff?.team !== user.team && s.assignedStaff !== user.firstName && s.assignedStaff !== `${user.firstName} ${user.lastName}`) return null;
                    } else {
                        // Staff
                        if (s.assignedStaff !== user?.firstName && s.assignedStaff !== `${user?.firstName} ${user?.lastName}`) return null;
                    }
                }

                // Cross-filter: Only show clients for the selected staff
                if (specialFilter.staff !== 'All' && s.assignedStaff !== specialFilter.staff) return null;

                return client?.name;
            }).filter(Boolean)
        )).sort();
    }, [specials, clients, user, isManagerOrAbove, allUsers, specialFilter.staff]);

    const availableSpecialStaff = useMemo(() => {
        return Array.from(new Set(
            specials.map(s => {
                const client = clients.find(c => normalizeId(c.id) === normalizeId(s.clientId));
                if (!client || client.status === 'Inactive') return null;

                // Role Based Visibility
                if (!isManagerOrAbove) {
                    if (user?.role === UserRole.SENIOR) {
                        const staff = allUsers.find(u => u.id === s.assignedStaff || `${u.firstName} ${u.lastName}` === s.assignedStaff);
                        if (staff?.team !== user.team && s.assignedStaff !== user.firstName && s.assignedStaff !== `${user.firstName} ${user.lastName}`) return null;
                    } else {
                        // Staff
                        if (s.assignedStaff !== user?.firstName && s.assignedStaff !== `${user?.firstName} ${user?.lastName}`) return null;
                    }
                }

                // Cross-filter: Only show staff for the selected client
                if (specialFilter.client !== 'All' && client?.name !== specialFilter.client) return null;

                return s.assignedStaff;
            }).filter(Boolean)
        )).sort();
    }, [specials, clients, user, isManagerOrAbove, allUsers, specialFilter.client]);

    const specialInstances = useMemo(() => {
        return specials.map(s => {
            const client = clients.find(c => normalizeId(c.id) === normalizeId(s.clientId));
            if (!client || client.status === 'Inactive') return null;

            return {
                ...s,
                clientName: client?.name || 'Unknown Client',
                engagementName: s.projectTitle || s.serviceName || s.serviceType,
                priority: s.priority || 'Medium' // Defaulting for now
            };
        }).filter(Boolean).filter(s => {
            if (!s) return false;
            // Role Based Visibility (Keep this for the actual list)
            if (!isManagerOrAbove) {
                if (user?.role === UserRole.SENIOR) {
                    const staff = allUsers.find(u => u.id === s.assignedStaff || `${u.firstName} ${u.lastName}` === s.assignedStaff);
                    if (staff?.team !== user.team && s.assignedStaff !== user.firstName && s.assignedStaff !== `${user.firstName} ${user.lastName}`) return false;
                } else {
                    // Staff
                    if (s.assignedStaff !== user?.firstName && s.assignedStaff !== `${user?.firstName} ${user?.lastName}`) return false;
                }
            }

            // Search
            if (searchQuery && !s.clientName.toLowerCase().includes(searchQuery.toLowerCase()) && !s.engagementName.toLowerCase().includes(searchQuery.toLowerCase())) return false;

            // Filters
            if (specialFilter.client !== 'All' && s.clientName !== specialFilter.client) return false;
            if (specialFilter.staff !== 'All' && s.assignedStaff !== specialFilter.staff) return false;
            if (specialFilter.status !== 'All' && s.status !== specialFilter.status) return false;
            if (specialFilter.priority !== 'All' && s.priority !== specialFilter.priority) return false;

            return true;
        }).sort((a, b) => {
            const dateA = new Date(a.endDate || 0);
            const dateB = new Date(b.endDate || 0);
            return dateA.getTime() - dateB.getTime();
        });
    }, [specials, clients, specialFilter, searchQuery, user, isManagerOrAbove, allUsers]);
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
                        <h1 className="text-3xl font-black text-neutral-dark dark:text-white tracking-tight">Engagement Monitoring</h1>
                    </div>
                    <p className="text-sm text-secondary dark:text-gray-300 font-medium pl-4 opacity-70 dark:opacity-100">Strategic tracking of active engagements and regulatory deadlines</p>
                </div>

                {/* Enhanced Navigation Tabs */}
                <div className="flex p-1 bg-neutral-light dark:bg-gray-900 rounded-xl shrink-0 border border-neutral-medium dark:border-gray-700">
                    <button
                        onClick={() => setActiveTab('Retainer')}
                        className={`flex items-center gap-2.5 px-6 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all duration-300 ${activeTab === 'Retainer'
                                ? 'bg-white dark:bg-gray-700 text-primary shadow-lg ring-1 ring-black/[0.03]'
                                : 'text-secondary hover:text-neutral-dark dark:hover:text-white hover:bg-black/5'
                            }`}
                    >
                        <FileText size={16} />
                        Retainers
                    </button>
                    <button
                        onClick={() => setActiveTab('Special')}
                        className={`flex items-center gap-2.5 px-6 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all duration-300 ${activeTab === 'Special'
                                ? 'bg-white dark:bg-gray-700 text-primary shadow-lg ring-1 ring-black/[0.03]'
                                : 'text-secondary hover:text-neutral-dark dark:hover:text-white hover:bg-black/5'
                            }`}
                    >
                        <Briefcase size={16} />
                        Specials
                    </button>
                </div>
            </div>

            {/* Modern Streamlined Toolbar */}
            <div className="bg-white dark:bg-gray-800 p-1.5 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-sm shadow-neutral-dark/5">
                <div className="flex flex-col 2xl:flex-row 2xl:items-center gap-1.5">
                    {/* Integrated Search - Flexible based on resolution */}
                    <div className="relative group w-full 2xl:flex-1 2xl:min-w-[400px]">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-secondary/40 dark:text-gray-400/60 group-focus-within:text-primary transition-colors" size={16} />
                        <input
                            type="text"
                            placeholder="Search engagements, clients, or staff..."
                            className="w-full pl-10 pr-4 py-2 bg-neutral-light/50 dark:bg-gray-900/50 border border-transparent focus:border-primary/20 rounded-xl text-[13px] font-medium text-neutral-dark dark:text-white outline-none focus:ring-4 focus:ring-primary/5 transition-all placeholder:text-secondary/30 dark:placeholder:text-gray-500"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    {/* Filters and Grouping - Row 2 on small, Row 1 on large */}
                    <div className="flex flex-nowrap items-center gap-2 px-0.5 overflow-x-auto no-scrollbar">
                        {activeTab === 'Retainer' ? (
                            <>
                                <select
                                    value={retainerFilter.client}
                                    onChange={(e) => setRetainerFilter(prev => ({ ...prev, client: e.target.value }))}
                                    className="pl-2 pr-7 py-1.5 bg-neutral-light/50 dark:bg-gray-900 border border-transparent hover:border-neutral-medium/50 rounded-lg text-[11px] font-bold text-neutral-dark dark:text-white outline-none focus:ring-4 focus:ring-primary/5 transition-all appearance-none cursor-pointer w-[260px]"
                                    style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%236b7280\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")', backgroundPosition: 'right 0.4rem center', backgroundRepeat: 'no-repeat', backgroundSize: '0.9rem' }}
                                >
                                    <option value="All">All Clients</option>
                                    {availableRetainerClients.map(name => <option key={name} value={name}>{name}</option>)}
                                </select>

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
                            </>
                        ) : (
                            <>
                                <select
                                    value={specialFilter.client}
                                    onChange={(e) => setSpecialFilter(prev => ({ ...prev, client: e.target.value }))}
                                    className="pl-2 pr-7 py-1.5 bg-neutral-light/50 dark:bg-gray-900 border border-transparent hover:border-neutral-medium/50 rounded-lg text-[11px] font-bold text-neutral-dark dark:text-white outline-none focus:ring-4 focus:ring-primary/5 transition-all appearance-none cursor-pointer w-[260px]"
                                    style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%236b7280\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")', backgroundPosition: 'right 0.4rem center', backgroundRepeat: 'no-repeat', backgroundSize: '0.9rem' }}
                                >
                                    <option value="All">All Clients</option>
                                    {availableSpecialClients.map(name => <option key={name} value={name}>{name}</option>)}
                                </select>

                                <select
                                    value={specialFilter.staff}
                                    onChange={(e) => setSpecialFilter(prev => ({ ...prev, staff: e.target.value }))}
                                    className="pl-2 pr-7 py-1.5 bg-neutral-light/50 dark:bg-gray-900 border border-transparent hover:border-neutral-medium/50 rounded-lg text-[11px] font-bold text-neutral-dark dark:text-white outline-none focus:ring-4 focus:ring-primary/5 transition-all appearance-none cursor-pointer w-[220px]"
                                    style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%236b7280\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")', backgroundPosition: 'right 0.4rem center', backgroundRepeat: 'no-repeat', backgroundSize: '0.9rem' }}
                                >
                                    <option value="All">All Staff</option>
                                    {availableSpecialStaff.map(staff => <option key={staff} value={staff}>{staff}</option>)}
                                </select>
                            </>
                        )}


                        <GroupBySelect
                            value={groupBy}
                            onChange={setGroupBy}
                            activeTab={activeTab}
                            userRole={user?.role}
                        />
                    </div>
                </div>
            </div>

            {/* Ultra-Compact Content Area */}
            <div className="min-h-[500px]">
                {activeTab === 'Retainer' ? (
                    retainerInstances.length === 0 ? (
                        <EmptyState
                            key={`retainer-empty-${searchQuery}`}
                            icon={FileText}
                            title="No retainers found"
                            query={searchQuery}
                            defaultMessage="No engagements found matching your current view."
                        />
                    ) : (
                        <RetainerTable
                            instances={retainerInstances}
                            user={user}
                            onSelect={(inst) => { setSelectedItem(inst); setIsDetailOpen(true); }}
                            allUsers={allUsers}
                            groupBy={groupBy}
                        />
                    )
                ) : (
                    specialInstances.length === 0 ? (
                        <EmptyState
                            key={`special-empty-${searchQuery}`}
                            icon={Briefcase}
                            title="No specials found"
                            query={searchQuery}
                            defaultMessage="No special projects found matching your current view."
                        />
                    ) : (
                        <SpecialTable
                            instances={specialInstances}
                            user={user}
                            onSelect={(inst) => { setSelectedItem(inst); setIsDetailOpen(true); }}
                            allUsers={allUsers}
                            groupBy={groupBy}
                        />
                    )
                )}
            </div>

            {/* Engagement Detail Drawer */}
            {isDetailOpen && selectedItem && createPortal(
                <div className="fixed inset-0 z-[10000] overflow-hidden">
                    <div className="absolute inset-0 bg-neutral-dark/40 backdrop-blur-sm transition-opacity" onClick={() => { setIsDetailOpen(false); setIsEditingDate(false); }} />
                    <div className="absolute inset-y-0 right-0 max-w-2xl w-full bg-white dark:bg-gray-900 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
                        {/* Drawer Header */}
                        <div className="p-6 border-b border-neutral-medium dark:border-gray-800 flex items-center justify-between bg-neutral-light/30 dark:bg-gray-800/30">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="bg-rose-50 text-rose-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">
                                        {activeTab === 'Retainer' ? 'Retainer Engagement' : 'Special Project'}
                                    </span>
                                </div>
                                <h2 className="text-xl font-black text-neutral-dark dark:text-white">
                                    {activeTab === 'Retainer' ? selectedItem.complianceName : selectedItem.engagementName}
                                </h2>
                            </div>
                            <button
                                onClick={() => setIsDetailOpen(false)}
                                className="p-2 hover:bg-neutral-medium/20 dark:hover:bg-gray-800 rounded-full transition-colors text-secondary"
                            >
                                <X size={20} />
                            </button>
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

                                return activeTab === 'Retainer' ? (
                                    <section className="space-y-8 animate-in fade-in slide-in-from-top duration-500">
                                        {/* Client Summary - Retainer Specific - Modernized */}
                                        <div className="bg-white/80 dark:bg-gray-800/60 backdrop-blur-md rounded-[2rem] border border-white dark:border-gray-700 shadow-xl shadow-primary/5 p-6 relative overflow-hidden group">
                                            <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/5 rounded-full blur-3xl transition-all group-hover:bg-primary/10" />

                                            <h3 className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-4 relative z-10 opacity-70">Client Information</h3>
                                            <div className="grid grid-cols-2 gap-8 relative z-10">
                                                <div>
                                                    <p className="text-[10px] font-black text-secondary dark:text-gray-400 uppercase tracking-wider mb-1.5 opacity-60 dark:opacity-100">Client Name</p>
                                                    <p className="text-base font-black text-neutral-dark dark:text-white leading-tight tracking-tight">{selectedItem.clientName}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-black text-secondary dark:text-gray-400 uppercase tracking-wider mb-1.5 opacity-60 dark:opacity-100">Assigned Staff</p>
                                                    <StaffAvatar staffName={selectedItem.assignedStaff} allUsers={allUsers} />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-1 h-4 bg-primary rounded-full" />
                                                    <h3 className="text-sm font-black text-neutral-dark dark:text-white uppercase tracking-wider">Compliance Instance</h3>
                                                </div>
                                                <div className={`px-4 py-1 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] shadow-sm ${currentItem.status === 'Filed' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' :
                                                        currentItem.status === 'LATE' ? 'bg-rose-500/10 text-rose-600 border border-rose-500/20' :
                                                            'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                                                    }`}>
                                                    {currentItem.status}
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-3 gap-4">
                                                <div className="p-4 bg-white/60 dark:bg-gray-800/40 backdrop-blur-sm rounded-2xl border border-white/50 dark:border-gray-700 shadow-lg shadow-primary/5">
                                                    <p className="text-[9px] font-black text-primary uppercase mb-2 opacity-70">Tax Period</p>
                                                    <p className="text-sm font-black text-neutral-dark dark:text-white leading-none">{currentItem.taxPeriod}</p>
                                                </div>
                                                <div className="p-4 bg-white/60 dark:bg-gray-800/40 backdrop-blur-sm rounded-2xl border border-white/50 dark:border-gray-700 shadow-lg shadow-primary/5">
                                                    <p className="text-[9px] font-black text-primary uppercase mb-2 opacity-70">Deadline</p>
                                                    <p className="text-sm font-black text-neutral-dark dark:text-white leading-none">{currentItem.dueDate}</p>
                                                </div>
                                                <div className="p-4 bg-white/60 dark:bg-gray-800/40 backdrop-blur-sm rounded-2xl border border-white/50 dark:border-gray-700 shadow-lg shadow-primary/5">
                                                    <div className="flex justify-between items-center mb-2">
                                                        <p className="text-[9px] font-black text-primary uppercase opacity-70">Completed</p>
                                                        {(currentItem.status === 'Filed' || currentItem.status === 'LATE') && !isEditingDate && (
                                                            <button
                                                                onClick={() => {
                                                                    setIsEditingDate(true);
                                                                    if (currentItem.dateFiled) {
                                                                        const [m, d, y] = currentItem.dateFiled.split('/');
                                                                        setCompletionDate(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`);
                                                                    }
                                                                }}
                                                                className="text-[9px] font-black text-primary hover:underline uppercase tracking-widest"
                                                            >
                                                                Edit
                                                            </button>
                                                        )}
                                                    </div>
                                                    {(currentItem.status === 'Filed' || currentItem.status === 'LATE') && !isEditingDate ? (
                                                        <p className="text-sm font-black text-emerald-600 leading-none">{currentItem.dateFiled}</p>
                                                    ) : (
                                                        <input
                                                            type="date"
                                                            value={completionDate}
                                                            onChange={(e) => setCompletionDate(e.target.value)}
                                                            className="w-full text-sm font-black text-neutral-dark dark:text-white bg-transparent outline-none border-none p-0 focus:ring-0 cursor-pointer h-4"
                                                        />
                                                    )}
                                                </div>
                                            </div>

                                            <div className="p-5 bg-white/60 dark:bg-gray-800/40 backdrop-blur-sm rounded-2xl border border-white/50 dark:border-gray-700 shadow-lg shadow-primary/5">
                                                <p className="text-[9px] font-black text-primary uppercase mb-2 opacity-70">Filing Remarks</p>
                                                {(currentItem.status === 'Filed' || currentItem.status === 'LATE') && !isEditingDate ? (
                                                    <p className="text-xs font-bold text-neutral-dark dark:text-white italic opacity-80">{currentItem.remarks || 'No remarks provided'}</p>
                                                ) : (
                                                    <textarea
                                                        value={remarks}
                                                        onChange={(e) => setRemarks(e.target.value)}
                                                        placeholder="Add reasoning for late filing or extensions..."
                                                        className="w-full text-xs font-bold text-neutral-dark dark:text-white bg-transparent outline-none border-none p-0 focus:ring-0 resize-none min-h-[50px] custom-scrollbar"
                                                    />
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex gap-4">
                                            {currentItem.status === 'Pending' ? (
                                                <button
                                                    disabled={isProcessing}
                                                    onClick={() => handleMarkAsFiled(currentItem.id)}
                                                    className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 text-white py-3 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-emerald-600/30 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                                                >
                                                    {isProcessing ? 'Processing...' : 'Marked Filed & Completed'}
                                                </button>
                                            ) : (
                                                isEditingDate && (
                                                    <button
                                                        disabled={isProcessing}
                                                        onClick={() => handleMarkAsFiled(currentItem.id)}
                                                        className="flex-1 bg-gradient-to-r from-primary to-primary-dark text-white py-3 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-primary/30 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                                                    >
                                                        {isProcessing ? 'Updating...' : 'Update Completion Date'}
                                                    </button>
                                                )
                                            )}
                                            {isEditingDate && (
                                                <button
                                                    onClick={() => setIsEditingDate(false)}
                                                    className="px-8 py-3 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] text-secondary border border-neutral-medium dark:border-gray-700 hover:bg-neutral-light transition-all"
                                                >
                                                    Cancel Edit
                                                </button>
                                            )}
                                        </div>

                                        {/* History/Log would go here */}
                                        <div className="pt-6 border-t border-neutral-medium/50 dark:border-gray-800">
                                            <div className="flex items-center gap-2 mb-4">
                                                <div className="w-1 h-4 bg-primary rounded-full" />
                                                <h4 className="text-sm font-black text-neutral-dark dark:text-white uppercase tracking-wider">Historical Audit Trail</h4>
                                            </div>
                                            <div className="space-y-3">
                                                {auditTrail.map((entry) => (
                                                    <div key={entry.cycle} className="flex items-center justify-between p-4 bg-white/40 dark:bg-gray-800/20 backdrop-blur-sm rounded-2xl border border-neutral-medium/30 dark:border-gray-700/50 hover:bg-white/60 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 group cursor-default">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-2 h-2 rounded-full shadow-lg ${
                                                                entry.status === 'Filed' ? 'bg-emerald-500 shadow-emerald-500/50' : 
                                                                entry.status === 'LATE' ? 'bg-rose-500 shadow-rose-500/50' : 
                                                                'bg-amber-500 shadow-amber-500/50'}`} />
                                                            <div className="flex flex-col">
                                                                <span className="text-xs font-black text-neutral-dark dark:text-white tracking-tight">{entry.period}</span>
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-col items-end gap-1">
                                                            <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-md ${
                                                                entry.status === 'Filed' ? 'bg-emerald-500/10 text-emerald-600' : 
                                                                entry.status === 'LATE' ? 'bg-rose-500/10 text-rose-600' : 
                                                                'bg-amber-500/10 text-amber-600'}`}>
                                                                {entry.status}
                                                            </span>
                                                            {entry.dateFiled && (
                                                                <span className="text-[10px] font-black text-secondary dark:text-gray-400 uppercase opacity-100">{formatDisplayDate(entry.dateFiled)}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </section>
                                ) : (
                                    <section className="space-y-8">
                                        {/* Combined Project Information - Enhanced Glassmorphism */}
                                        <div className="animate-in fade-in slide-in-from-top duration-500">
                                            <div className="flex items-center gap-2 mb-4">
                                                <div className="w-1 h-4 bg-primary rounded-full" />
                                                <h3 className="text-sm font-black text-neutral-dark dark:text-white uppercase tracking-wider">Project Information</h3>
                                            </div>
                                            <div className="bg-white/80 dark:bg-gray-800/60 backdrop-blur-md rounded-[2rem] border border-white dark:border-gray-700 shadow-2xl shadow-primary/5 p-6 space-y-5 relative overflow-hidden group">
                                                {/* Decorative background glow */}
                                                <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/10 rounded-full blur-3xl transition-all group-hover:bg-primary/20" />

                                                <div className="grid grid-cols-2 gap-8 relative z-10">
                                                    <div>
                                                        <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-1 opacity-70">Client Name</p>
                                                        <p className="text-sm font-black text-neutral-dark dark:text-white leading-tight tracking-tight">{selectedItem.clientName}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-1 opacity-70">Assigned Staff</p>
                                                        <StaffAvatar staffName={selectedItem.assignedStaff} allUsers={allUsers} />
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-8 relative z-10">
                                                    <div>
                                                        <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-1 opacity-70">Current Status</p>
                                                        <div className="flex">
                                                            <select
                                                                value={currentItem.status}
                                                                onChange={(e) => handleUpdateSpecialStatus(e.target.value)}
                                                                disabled={isProcessing}
                                                                className={`appearance-none px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-[0.15em] shadow-sm border transition-all cursor-pointer focus:ring-2 focus:ring-primary/20 outline-none disabled:opacity-50 ${currentItem.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' :
                                                                        currentItem.status === 'In Progress' ? 'bg-blue-500/10 text-blue-600 border-blue-500/20' :
                                                                            currentItem.status === 'Blocked' ? 'bg-rose-500/10 text-rose-600 border-rose-500/20' :
                                                                                'bg-neutral-500/10 text-neutral-600 border-neutral-500/20'
                                                                    }`}
                                                            >
                                                                <option value="Planning">Planning</option>
                                                                <option value="In Progress">In Progress</option>
                                                                <option value="Completed">Completed</option>
                                                                <option value="Blocked">Blocked</option>
                                                            </select>
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-1 opacity-70">Project Due Date</p>
                                                        <div className="flex items-center gap-2">
                                                            <Calendar size={14} className="text-primary opacity-60" />
                                                            <p className="text-sm font-black text-neutral-dark dark:text-white leading-tight tracking-tight">
                                                                {formatDisplayDate(selectedItem.endDate) || 'Not specified'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="pt-4 border-t border-neutral-medium/50 dark:border-gray-700/50 relative z-10">
                                                    <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-1 opacity-70 dark:opacity-100">Project Description</p>
                                                    <p className="text-xs text-neutral-dark dark:text-gray-300 leading-relaxed font-bold italic opacity-80 dark:opacity-100">
                                                        {selectedItem.description || "No project description provided."}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom duration-700 delay-200">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-1 h-4 bg-primary rounded-full" />
                                                    <h3 className="text-sm font-black text-neutral-dark dark:text-white uppercase tracking-wider">Project Tasks & Milestones</h3>
                                                </div>
                                                {!isAddingTask && (
                                                    <button
                                                        onClick={() => setIsAddingTask(true)}
                                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest hover:bg-primary hover:text-white transition-all transform hover:scale-105"
                                                    >
                                                        <Plus size={14} />
                                                        Add Task
                                                    </button>
                                                )}
                                            </div>

                                            {isAddingTask && (
                                                <div className="p-6 bg-gradient-to-br from-primary/5 to-transparent rounded-3xl border border-primary/20 space-y-4 shadow-xl shadow-primary/5 animate-in zoom-in-95 duration-200">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <div className="w-2 h-2 rounded-full bg-primary" />
                                                        <span className="text-[10px] font-black text-primary uppercase tracking-widest">New Project Milestone</span>
                                                    </div>
                                                    <input
                                                        autoFocus
                                                        type="text"
                                                        value={newTaskName}
                                                        onChange={(e) => setNewTaskName(e.target.value)}
                                                        placeholder="Enter task name..."
                                                        className="w-full bg-white dark:bg-gray-800 p-4 rounded-2xl text-sm font-bold border border-neutral-medium dark:border-gray-700 outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all shadow-inner"
                                                    />
                                                    <div className="flex gap-3">
                                                        <button
                                                            onClick={handleAddTask}
                                                            disabled={isProcessing || !newTaskName}
                                                            className="flex-1 bg-primary hover:bg-primary-dark text-white py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg shadow-primary/30 transition-all active:scale-95 disabled:opacity-50"
                                                        >
                                                            {isProcessing ? 'Creating...' : 'Initialize Task'}
                                                        </button>
                                                        <button
                                                            onClick={() => setIsAddingTask(false)}
                                                            className="px-6 py-3 border-2 border-neutral-medium dark:border-gray-700 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] text-secondary dark:text-gray-400 hover:bg-neutral-medium/10 dark:hover:bg-gray-700 transition-all"
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                            <div className="space-y-4">
                                                {(context?.taskLog || []).filter(t => normalizeId(t.specialID) === normalizeId(selectedItem.id)).map(task => {
                                                    const taskActivities = (context?.activityLog || []).filter(a => a.taskID === task.taskID);
                                                    return (
                                                        <div key={task.taskID} className="group bg-white/60 dark:bg-gray-800/40 backdrop-blur-sm rounded-[1.5rem] border border-white dark:border-gray-700 shadow-xl shadow-primary/5 overflow-hidden transition-all hover:shadow-2xl hover:shadow-primary/10 hover:-translate-y-1 duration-300">
                                                            {/* Task Header - Premium */}
                                                            <div className="px-6 py-4 flex items-center justify-between bg-gradient-to-r from-neutral-light/30 to-transparent dark:from-gray-800/30">
                                                                {editingTaskId === task.taskID ? (
                                                                    <div className="flex-1 space-y-3">
                                                                        <input
                                                                            disabled={isProcessing}
                                                                            type="text"
                                                                            value={editTaskName}
                                                                            onChange={(e) => setEditTaskName(e.target.value)}
                                                                            className="w-full bg-white dark:bg-gray-800 px-3 py-2 rounded-xl text-sm font-black border border-primary/20 outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                                                        />
                                                                        <div className="flex items-center justify-between">
                                                                            <div className="flex gap-2">
                                                                                {(['Pending', 'Completed'] as const).map(s => (
                                                                                    <button
                                                                                        key={s}
                                                                                        disabled={isProcessing}
                                                                                        onClick={() => setEditTaskStatus(s)}
                                                                                        className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all ${editTaskStatus === s
                                                                                                ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20'
                                                                                                : 'bg-white dark:bg-gray-800 text-secondary dark:text-gray-400 border-neutral-medium dark:border-gray-700'
                                                                                            } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                                                    >
                                                                                        {s}
                                                                                    </button>
                                                                                ))}
                                                                            </div>
                                                                            <div className="flex gap-2">
                                                                                <button
                                                                                    disabled={isProcessing}
                                                                                    onClick={() => setEditingTaskId(null)}
                                                                                    className="px-3 py-1 text-[9px] font-black uppercase tracking-widest text-secondary dark:text-gray-400 hover:bg-neutral-medium/10 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                                                                >
                                                                                    Cancel
                                                                                </button>
                                                                                <button
                                                                                    onClick={() => handleUpdateTask(task.taskID)}
                                                                                    disabled={isProcessing || !editTaskName}
                                                                                    className="bg-emerald-600 text-white px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest shadow-lg shadow-emerald-600/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                                                                >
                                                                                    {isProcessing && <Loader2 className="animate-spin" size={10} />}
                                                                                    {isProcessing ? 'Saving...' : 'Save'}
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <>
                                                                        <div className="flex items-center gap-4">
                                                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-inner ${task.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-primary/10 text-primary'
                                                                                }`}>
                                                                                <CheckSquare size={20} />
                                                                            </div>
                                                                            <div>
                                                                                <h4 className="text-sm font-black text-neutral-dark dark:text-white leading-tight tracking-tight">{task.taskName}</h4>
                                                                                <div className="flex items-center gap-2 mt-1">
                                                                                    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg border ${task.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
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
                                                                                            <div className="bg-white/80 dark:bg-gray-800/80 p-4 rounded-2xl border border-primary/20 space-y-3 shadow-lg">
                                                                                                <textarea
                                                                                                    value={editActivityDesc}
                                                                                                    onChange={(e) => setEditActivityDesc(e.target.value)}
                                                                                                    disabled={isProcessing}
                                                                                                    className="w-full bg-white dark:bg-gray-700 px-3 py-2 rounded-xl text-xs font-bold border border-neutral-medium dark:border-gray-600 outline-none focus:ring-2 focus:ring-primary/20 min-h-[80px] disabled:opacity-50"
                                                                                                />
                                                                                                <div className="flex items-center justify-between gap-4">
                                                                                                    <input
                                                                                                        type="date"
                                                                                                        value={editActivityDate}
                                                                                                        onChange={(e) => setEditActivityDate(e.target.value)}
                                                                                                        disabled={isProcessing}
                                                                                                        className="bg-white dark:bg-gray-700 px-3 py-1.5 rounded-lg text-[10px] font-black border border-neutral-medium dark:border-gray-600 outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50 w-32"
                                                                                                    />
                                                                                                    <div className="flex gap-2">
                                                                                                        <button
                                                                                                            onClick={() => setEditingActivityId(null)}
                                                                                                            disabled={isProcessing}
                                                                                                            className="px-3 py-1 text-[9px] font-black uppercase tracking-widest text-secondary hover:bg-neutral-medium/10 rounded-lg disabled:opacity-50"
                                                                                                        >
                                                                                                            Cancel
                                                                                                        </button>
                                                                                                        <button
                                                                                                            onClick={() => handleUpdateActivity(activity.activityID)}
                                                                                                            disabled={isProcessing || !editActivityDesc}
                                                                                                            className="bg-emerald-600 text-white px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest shadow-lg shadow-emerald-600/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50"
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
                                                                        <div className="mt-2 p-3 bg-primary/[0.03] rounded-xl border border-primary/10 space-y-2 animate-in slide-in-from-top-2 duration-200">
                                                                            <textarea
                                                                                autoFocus
                                                                                value={newActivityDesc}
                                                                                onChange={(e) => setNewActivityDesc(e.target.value)}
                                                                                placeholder="What was accomplished?"
                                                                                className="w-full bg-white dark:bg-gray-800 p-2 rounded-lg text-xs font-medium border border-neutral-medium dark:border-gray-700 outline-none focus:ring-2 focus:ring-primary/10 h-14 resize-none"
                                                                            />
                                                                            <div className="flex items-center justify-between gap-2">
                                                                                <input
                                                                                    type="date"
                                                                                    value={activityDate}
                                                                                    onChange={(e) => setActivityDate(e.target.value)}
                                                                                    className="w-32 bg-white dark:bg-gray-800 px-2 py-1 rounded-md text-[10px] font-bold border border-neutral-medium dark:border-gray-700 outline-none"
                                                                                />
                                                                                <div className="flex gap-2">
                                                                                    <button
                                                                                        onClick={() => {
                                                                                            setAddingActivityToTaskId(null);
                                                                                            setNewActivityDesc('');
                                                                                        }}
                                                                                        className="px-3 py-1 rounded-md text-[9px] font-black uppercase tracking-widest text-secondary dark:text-gray-400 hover:bg-neutral-medium/10 transition-all"
                                                                                    >
                                                                                        Cancel
                                                                                    </button>
                                                                                    <button
                                                                                        onClick={() => handleAddActivity(task.taskID)}
                                                                                        disabled={isProcessing || !newActivityDesc}
                                                                                        className="bg-primary hover:bg-primary-dark text-white px-3 py-1 rounded-md text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-50 shadow-md shadow-primary/20"
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
                                            {(context?.taskLog || []).filter(t => normalizeId(t.specialID) === normalizeId(selectedItem.id)).length === 0 && (
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
    const isSenior = user?.role === UserRole.SENIOR;
    const isStaff = user?.role === UserRole.STAFF;

    const renderRow = (inst: any, isChild = false) => (
        <tr
            key={inst.id}
            onClick={() => onSelect(inst)}
            className={`group cursor-pointer transition-all duration-300 hover:bg-primary/[0.02] dark:hover:bg-primary/[0.05] border-b border-neutral-medium/50 dark:border-gray-800 last:border-0`}
        >
            <td className="px-4 py-2.5">
                <div className={`font-black text-neutral-dark dark:text-white text-[13px] tracking-tight group-hover:text-primary transition-colors ${isChild ? 'opacity-50' : ''}`} title={inst.clientName}>
                    {inst.clientName}
                </div>
            </td>
            <td className="px-4 py-2.5">
                <div className="flex flex-col">
                    <span className="text-[11px] font-black text-secondary dark:text-gray-400 uppercase tracking-wider">{inst.complianceName}</span>
                    <span className="text-[10px] font-bold text-secondary/50 dark:text-gray-400/50 italic opacity-100">{inst.taxPeriod}</span>
                </div>
            </td>
            <td className="px-4 py-2.5">
                <div className="flex items-center gap-1.5">
                    <Calendar size={12} className="text-secondary/50 dark:text-gray-400/50" />
                    <span className="text-[12px] font-black text-neutral-dark dark:text-white">{inst.dueDate}</span>
                </div>
            </td>
            <td className="px-4 py-2.5">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border shadow-sm ${inst.status === 'Filed'
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
            <td className="px-4 py-2.5">
                <StaffAvatar staffName={inst.assignedStaff} allUsers={allUsers} />
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

    const renderTable = (items: any[]) => (
        <table className="w-full text-left border-collapse table-fixed">
            <thead>
                <tr className="bg-neutral-light/50 dark:bg-gray-900/50 border-b border-neutral-medium dark:border-gray-700">
                    <th className="w-[28%] px-4 py-3 text-[10px] font-black text-secondary dark:text-gray-400 uppercase tracking-[0.2em]">Client Entity</th>
                    <th className="w-[22%] px-4 py-3 text-[10px] font-black text-secondary dark:text-gray-400 uppercase tracking-[0.2em]">Compliance Type</th>
                    <th className="w-[15%] px-4 py-3 text-[10px] font-black text-secondary dark:text-gray-400 uppercase tracking-[0.2em]">Due Date</th>
                    <th className="w-[12%] px-4 py-3 text-[10px] font-black text-secondary dark:text-gray-400 uppercase tracking-[0.2em]">Status</th>
                    <th className="w-[15%] px-4 py-3 text-[10px] font-black text-secondary dark:text-gray-400 uppercase tracking-[0.2em]">Assigned To</th>
                    <th className="w-[8%] px-4 py-3 text-right"></th>
                </tr>
            </thead>
            <tbody className="divide-y divide-neutral-medium/30 dark:divide-gray-800">
                {groupBy === 'None' ? items.map(inst => renderRow(inst)) : 
                    Object.entries(items.reduce((acc, inst) => {
                        const key = groupBy === 'Client' ? inst.clientName : groupBy === 'Compliance' ? inst.complianceName : inst.assignedStaff;
                        if (!acc[key]) acc[key] = [];
                        acc[key].push(inst);
                        return acc;
                    }, {} as Record<string, any[]>)).map(([group, subItems]) => (
                        <React.Fragment key={group}>
                            <tr className="bg-neutral-light/30 dark:bg-gray-900/40">
                                <td colSpan={6} className="px-6 py-2 border-b border-neutral-medium/50 dark:border-gray-800">
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                                        <span className="text-[10px] font-black text-secondary dark:text-gray-400 uppercase tracking-[0.2em]">{group}</span>
                                        <span className="px-1.5 py-0.5 rounded-md bg-white dark:bg-gray-800 text-[9px] font-black text-primary border border-neutral-medium dark:border-gray-700 ml-auto">
                                            {subItems.length} ITEMS
                                        </span>
                                    </div>
                                </td>
                            </tr>
                            {subItems.map(inst => renderRow(inst, true))}
                        </React.Fragment>
                    ))
                }
            </tbody>
        </table>
    );

    if (isStaff) return <div className="bg-white dark:bg-gray-800 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-lg shadow-neutral-dark/5 overflow-x-auto">{renderTable(instances)}</div>;

    if (isSenior) {
        const myEngagements = instances.filter(i => i.assignedStaff === user.firstName || i.assignedStaff === `${user.firstName} ${user.lastName}`);
        const others = instances.filter(i => i.assignedStaff !== user.firstName && i.assignedStaff !== `${user.firstName} ${user.lastName}`);
        const staffGroups = others.reduce((acc, i) => {
            if (!acc[i.assignedStaff]) acc[i.assignedStaff] = [];
            acc[i.assignedStaff].push(i);
            return acc;
        }, {} as Record<string, any[]>);

        return (
            <div className="space-y-2 py-1">
                <CollapsibleSection title="My Engagements" count={myEngagements.length} icon={<FileText size={16} />} defaultOpen={true}>
                    {myEngagements.length > 0 ? renderTable(myEngagements) : (
                        <div className="p-12 text-center animate-in fade-in zoom-in-95 duration-500">
                            <FileText className="mx-auto text-secondary/20 mb-3" size={32} />
                            <p className="text-[11px] font-black text-secondary/40 uppercase tracking-widest italic">No personal engagements due</p>
                        </div>
                    )}
                </CollapsibleSection>
                {Object.entries(staffGroups).sort(([a], [b]) => a.localeCompare(b)).map(([staffName, items]) => (
                    <CollapsibleSection key={staffName} title={`${staffName.split(' ')[0]}'s Engagements`} count={items.length} icon={<Briefcase size={16} />} color="secondary">
                        {renderTable(items)}
                    </CollapsibleSection>
                ))}
            </div>
        );
    }

    return <div className="bg-white dark:bg-gray-800 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-lg shadow-neutral-dark/5 overflow-x-auto">{renderTable(instances)}</div>;
};

const SpecialTable: React.FC<{
    instances: any[];
    user: any;
    onSelect: (inst: any) => void;
    allUsers: any[];
    groupBy: string;
}> = ({ instances, user, onSelect, allUsers, groupBy }) => {
    const isSenior = user?.role === UserRole.SENIOR;
    const isStaff = user?.role === UserRole.STAFF;

    const renderRow = (inst: any, isChild = false) => {
        const statusColors: any = {
            'Completed': 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
            'In Progress': 'bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20',
            'Blocked': 'bg-rose-50 text-rose-600 border-rose-100 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20',
            'Planning': 'bg-neutral-50 text-neutral-600 border-neutral-100 dark:bg-gray-500/10 dark:text-gray-400 dark:border-gray-500/20'
        };
        const statusDot: any = { 'Completed': 'bg-emerald-500', 'In Progress': 'bg-blue-500', 'Blocked': 'bg-rose-500', 'Planning': 'bg-neutral-400' };

        return (
            <tr
                key={inst.id}
                onClick={() => onSelect(inst)}
                className="group cursor-pointer transition-all duration-300 hover:bg-primary/[0.02] dark:hover:bg-primary/[0.05] border-b border-neutral-medium/50 dark:border-gray-800 last:border-0"
            >
                <td className="px-4 py-2.5">
                    <div className={`font-black text-neutral-dark dark:text-white text-[13px] tracking-tight group-hover:text-primary transition-colors ${isChild ? 'opacity-50' : ''}`} title={inst.engagementName}>
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
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border shadow-sm ${statusColors[inst.status] || statusColors['Planning']}`}>
                        <div className={`w-1 h-1 rounded-full mr-1.5 ${statusDot[inst.status] || statusDot['Planning']}`} />
                        {inst.status}
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
                    Object.entries(items.reduce((acc, inst) => {
                        const key = groupBy === 'Client' ? inst.clientName : inst.assignedStaff;
                        if (!acc[key]) acc[key] = [];
                        acc[key].push(inst);
                        return acc;
                    }, {} as Record<string, any[]>)).map(([group, subItems]) => (
                        <React.Fragment key={group}>
                            <tr className="bg-neutral-light/30 dark:bg-gray-900/40">
                                <td colSpan={6} className="px-6 py-2 border-b border-neutral-medium/50 dark:border-gray-800">
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                                        <span className="text-[10px] font-black text-secondary uppercase tracking-[0.2em]">{group}</span>
                                        <span className="px-1.5 py-0.5 rounded-md bg-white dark:bg-gray-800 text-[9px] font-black text-primary border border-neutral-medium dark:border-gray-700 ml-auto">
                                            {subItems.length} ITEMS
                                        </span>
                                    </div>
                                </td>
                            </tr>
                            {subItems.map(inst => renderRow(inst, true))}
                        </React.Fragment>
                    ))
                }
            </tbody>
        </table>
    );

    if (isStaff) return <div className="bg-white dark:bg-gray-800 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-lg shadow-neutral-dark/5 overflow-x-auto">{renderTable(instances)}</div>;

    if (isSenior) {
        const myEngagements = instances.filter(i => i.assignedStaff === user.firstName || i.assignedStaff === `${user.firstName} ${user.lastName}`);
        const others = instances.filter(i => i.assignedStaff !== user.firstName && i.assignedStaff !== `${user.firstName} ${user.lastName}`);
        const staffGroups = others.reduce((acc, i) => {
            if (!acc[i.assignedStaff]) acc[i.assignedStaff] = [];
            acc[i.assignedStaff].push(i);
            return acc;
        }, {} as Record<string, any[]>);

        return (
            <div className="space-y-2 py-1">
                <CollapsibleSection title="My Projects" count={myEngagements.length} icon={<Briefcase size={16} />} defaultOpen={true}>
                    {myEngagements.length > 0 ? renderTable(myEngagements) : (
                        <div className="p-12 text-center animate-in fade-in zoom-in-95 duration-500">
                            <Briefcase className="mx-auto text-secondary/20 mb-3" size={32} />
                            <p className="text-[11px] font-black text-secondary/40 uppercase tracking-widest italic">No personal projects active</p>
                        </div>
                    )}
                </CollapsibleSection>
                {Object.entries(staffGroups).sort(([a], [b]) => a.localeCompare(b)).map(([staffName, items]) => (
                    <CollapsibleSection key={staffName} title={`${staffName.split(' ')[0]}'s Projects`} count={items.length} icon={<Briefcase size={16} />} color="secondary">
                        {renderTable(items)}
                    </CollapsibleSection>
                ))}
            </div>
        );
    }

    return <div className="bg-white dark:bg-gray-800 rounded-2xl border border-neutral-medium dark:border-gray-700 shadow-lg shadow-neutral-dark/5 overflow-x-auto">{renderTable(instances)}</div>;
};

// --- Internal Helper Components to Reduce Duplication ---

const StaffAvatar: React.FC<{
    staffName: string;
    allUsers: any[];
}> = ({ staffName, allUsers }) => {
    const staff = allUsers.find(u => `${u.firstName} ${u.lastName}` === staffName || u.firstName === staffName);
    const initials = staffName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);

    return (
        <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center overflow-hidden shrink-0">
                {staff?.avatarUrl ? (
                    <img src={staff.avatarUrl} alt={staffName} className="w-full h-full object-cover" />
                ) : (
                    <span className="text-[10px] font-black text-primary">{initials}</span>
                )}
            </div>
            <span className="text-[12px] font-bold text-neutral-dark dark:text-white truncate max-w-[150px]">{staffName}</span>
        </div>
    );
};

const EmptyState: React.FC<{
    icon: React.ElementType;
    title: string;
    query?: string;
    defaultMessage: string;
}> = ({ icon: Icon, title, query, defaultMessage }) => (
    <div className="p-16 text-center bg-white dark:bg-gray-800 rounded-2xl border border-dashed border-neutral-medium dark:border-gray-700 animate-in fade-in zoom-in-95 slide-in-from-top-4 duration-700">
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
