
import { User, AppData, RetainerEngagement, SpecialEngagement, TaxCompliance, Client, UserRole, ClientCredential, Service, Transmittal, Meeting, Notification, DeliverableLog, ChatThread, ChatMessage, ChatMention } from '../types';


// --- Shared Utilities ---
export const normalizeId = (id: any) => String(id || '').trim().replace(/^0+/, '') || '0';

/**
 * Generic API wrapper to handle consistent fetching and error parsing
 */
async function apiCall<T>(url: string, options: RequestInit = {}): Promise<T> {
    const isFormData = options.body instanceof FormData;
    const defaultOptions: RequestInit = {
        ...options,
        headers: {
            ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
            ...options.headers,
        },
    };

    const response = await fetch(url, defaultOptions);

    if (!response.ok) {
        let errorMsg = 'An error occurred';
        try {
            const error = await response.json();
            errorMsg = error.error || error.message || errorMsg;
        } catch (e) {
            errorMsg = `Server error: ${response.status} ${response.statusText}`;
        }

        // Handle 401 Unauthorized globally
        if (response.status === 401) {
            // Optional: window.location.href = '/login';
        }

        throw new Error(errorMsg);
    }

    try {
        return await response.json();
    } catch (e) {
        return { success: true } as any; // Handle non-JSON or success responses
    }
}

// --- Data Mapping Helpers ---
const mapRow = (row: any, schema: string[]) => {
    if (!Array.isArray(row)) return row;
    const obj: any = {};
    schema.forEach((key, index) => {
        obj[key] = row[index] || '';
    });
    return obj;
};

const mapUser = (row: any): User => {
    const u = mapRow(row, ['id', 'username', 'passwordSkip', 'firstName', 'lastName', 'role', 'team', 'status', 'avatarUrl', 'email']);
    return {
        id: u.id,
        username: u.username,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role as UserRole,
        team: u.team,
        status: u.status as 'Active' | 'Inactive',
        avatarUrl: u.avatarUrl,
        email: u.email
    };
};

const mapRetainer = (row: any, services: Service[], users: User[]): RetainerEngagement => {
    let base: any;
    if (!Array.isArray(row)) {
        base = {
            id: row.id || row.retainerID || '',
            clientId: row.clientId || row.clientID || '',
            serviceType: row.serviceType || row.serviceID || '',
            startDate: row.startDate || '',
            engagementStatus: row.engagementStatus || row.status || 'Active',
            assignedStaff: row.assignedStaff || row.assignedStaffID || ''
        };
    } else {
        base = {
            id: row[0] || '',
            clientId: row[1] || '',
            serviceType: row[2] || '',
            startDate: row[3] || '',
            engagementStatus: row[4] || 'Active',
            assignedStaff: row[5] || ''
        };
    }

    const service = services.find(s => normalizeId(s.id) === normalizeId(base.serviceType));
    const user = users.find(u => normalizeId(u.id) === normalizeId(base.assignedStaff));

    return {
        ...base,
        serviceName: service ? service.name : base.serviceType,
        assignedStaff: user ? `${user.firstName} ${user.lastName}` : base.assignedStaff
    };
};

export const isAuthenticated = () => true;

export const loginWithUsernamePassword = (username: string, password: string) =>
    apiCall<User>('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) });

export const fetchAllData = async (): Promise<AppData> => {
    const rawData = await apiCall<any>('/api/data');

    const services = (rawData.services || []).map((row: any) => mapRow(row, ['id', 'name', 'type'])) as Service[];
    const users = (rawData.users || []).map(mapUser);

    const getServiceName = (id: string) => {
        const s = services.find(s => normalizeId(s.id) === normalizeId(id));
        return s ? s.name : id;
    };

    const getStaffName = (id: string) => {
        const u = users.find(u => normalizeId(u.id) === normalizeId(id));
        return u ? `${u.firstName} ${u.lastName}` : id;
    };

    const retainers = (rawData.retainers || [])
        .filter((row: any) => !Array.isArray(row) || (row[0] !== 'retainerID' && row[0] !== 'id'))
        .map((row: any) => mapRetainer(row, services, users));

    const clients = (rawData.clients || [])
        .filter((row: any) => !Array.isArray(row) || (row[0] !== 'clientID' && row[0] !== 'id'))
        .map((row: any[]) => mapRow(row, ['id', 'name', 'tin', 'entityType', 'email', 'contactPerson', 'status', 'fiscalYearEnd'])) as Client[];

    const deliverables: DeliverableLog[] = (rawData.deliverables || []).map((row: any) => mapRow(row, ['id', 'clientId', 'deliverableType', 'dueDate', 'status', 'assignedStaff']));

    const specials = (rawData.specials || [])
        .filter((row: any) => !Array.isArray(row) || (row[0] !== 'specialID' && row[0] !== 'id' && row[0] !== 'Special ID'))
        .map((row: any[]) => {
            const s = mapRow(row, ['id', 'clientId', 'assignedStaff', 'serviceType', 'projectTitle', 'startDate', 'endDate', 'status', 'description']);
            return {
                ...s,
                assignedStaff: getStaffName(s.assignedStaff || ''),
                serviceName: getServiceName(s.serviceType)
            } as SpecialEngagement;
        });

    const taxes = (rawData.taxes || []).map((row: any[]) =>
        mapRow(row, ['id', 'clientId', 'formType', 'period', 'deadlineDate', 'filingStatus', 'confirmationNumber'])
    );

    const taxCompliances = (rawData.taxCompliances || []).map((row: any[]) => mapRow(row, ['taxID', 'complianceName', 'complianceCode', 'frequency']));
    const deadlines = (rawData.deadlines || []).map((row: any[]) => mapRow(row, ['deadlineID', 'retainerID', 'serviceID', 'taxID', 'dueDate']));

    const retainerLogs = rawData.retainerLogs || [];
    const taskLog = (rawData.taskLog || []).map((row: any[]) => mapRow(row, ['taskID', 'specialID', 'taskName', 'status']));
    const activityLog = (rawData.activityLog || []).map((row: any[]) => mapRow(row, ['activityID', 'taskID', 'dateCompleted', 'description']));
    const credentials = (rawData.credentials || []) as ClientCredential[];
    const transmittals = (rawData.transmittals || []) as Transmittal[];
    const meetings = (rawData.meetings || []) as Meeting[];
    const notifications = (rawData.notifications || []) as Notification[];

    return {
        retainers, specials, taxes, users, clients, deliverables, services,
        taxCompliances, deadlines, retainerLogs, taskLog, activityLog,
        credentials, transmittals, meetings, notifications
    };
};

export const logout = () => apiCall('/api/logout', { method: 'POST' });

export const uploadFile = (file: File, type: 'Transmittal' | 'Meeting') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);
    return apiCall<{ id: string, url: string }>('/api/upload', {
        method: 'POST',
        body: formData,
        headers: {}
    });
};

export const deleteFile = (fileId: string) =>
    apiCall<any>(`/api/delete-file/${fileId}`, { method: 'DELETE' });

export const addTransmittal = (data: Omit<Transmittal, 'transmittalID'>) =>
    apiCall<{ success: boolean, transmittalID: string }>('/api/transmittals', {
        method: 'POST',
        body: JSON.stringify(data)
    });

export const addMeeting = (data: Omit<Meeting, 'meetingID'>) =>
    apiCall<{ success: boolean, meetingID: string }>('/api/meetings', {
        method: 'POST',
        body: JSON.stringify(data)
    });

export const addNotification = (data: Omit<Notification, 'id' | 'createdAt' | 'isRead'>) =>
    apiCall<{ success: boolean, id: string }>('/api/notifications', {
        method: 'POST',
        body: JSON.stringify(data)
    });

export const fetchNotifications = (userId: string, limit = 50) =>
    apiCall<Notification[]>(`/api/notifications?userId=${encodeURIComponent(userId)}&limit=${limit}`);

export const markNotificationRead = (id: string) =>
    apiCall<{ success: boolean }>('/api/notifications/read', {
        method: 'POST',
        body: JSON.stringify({ id })
    });

export const markAllNotificationsRead = (userId: string) =>
    apiCall<{ success: boolean }>('/api/notifications/read-all', {
        method: 'POST',
        body: JSON.stringify({ userId })
    });

export const fetchChatThreads = (userId: string, limit = 30) =>
    apiCall<ChatThread[]>(`/api/chat/threads?userId=${encodeURIComponent(userId)}&limit=${limit}`);

export const fetchChatMessages = (threadId: string, userId: string, limit = 10, before?: string) => {
    const params = new URLSearchParams({ threadId, userId, limit: String(limit) });
    if (before) params.set('before', before);
    return apiCall<ChatMessage[]>(`/api/chat/messages?${params.toString()}`);
};

export const sendChatMessage = (data: { threadId?: string; senderUserID: string; recipientUserIDs: string[]; message: string; type?: 'direct' | 'group'; threadTitle?: string; mentions?: ChatMention[] }) =>
    apiCall<{ success: boolean; threadId: string; message: ChatMessage }>('/api/chat/messages', {
        method: 'POST',
        body: JSON.stringify(data)
    });

export const markChatThreadRead = (threadId: string, userId: string) =>
    apiCall<{ success: boolean; modifiedCount: number }>('/api/chat/read', {
        method: 'POST',
        body: JSON.stringify({ threadId, userId })
    });

export const toggleChatReaction = (messageId: string, userId: string, reaction: string) =>
    apiCall<{ success: boolean; message: ChatMessage }>('/api/chat/reactions', {
        method: 'POST',
        body: JSON.stringify({ messageId, userId, reaction })
    });

export const updateChatThreadSettings = (data: { threadId: string; userId: string; threadTitle: string; participantUserIDs: string[]; adminUserIDs: string[] }) =>
    apiCall<{ success: boolean; thread: ChatThread }>('/api/chat/thread-settings', {
        method: 'PUT',
        body: JSON.stringify(data)
    });

export const addClient = (clientData: Omit<Client, 'id'>) =>
    apiCall<Client>('/api/clients', { method: 'POST', body: JSON.stringify(clientData) });

export const updateClient = (id: string, data: any) =>
    apiCall<any>(`/api/clients/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const addRetainer = (data: { clientId: string; assignments?: any[]; serviceId?: string; assignedStaffId?: string; startDate?: string; status?: string; }) =>
    apiCall<any>('/api/retainers', { method: 'POST', body: JSON.stringify(data) });

export const updateRetainer = (id: string, data: any) =>
    apiCall<any>(`/api/retainers/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const deleteRetainer = (id: string) =>
    apiCall<any>(`/api/retainers/${id}`, { method: 'DELETE' });

export const addSpecial = (data: { clientId: string, assignments: any[] }) =>
    apiCall<any>('/api/specials', { method: 'POST', body: JSON.stringify(data) });

export const updateSpecial = (id: string, data: any) =>
    apiCall<any>(`/api/specials/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const deleteSpecial = (id: string) =>
    apiCall<any>(`/api/specials/${id}`, { method: 'DELETE' });

export const addRetainerLog = (data: { deadline: string; period: string; dateCompleted: string; remarks?: string; }) =>
    apiCall<any>('/api/retainer-logs', { method: 'POST', body: JSON.stringify(data) });

export const updateRetainerLog = (data: { deadline: string; period: string; dateCompleted: string; remarks?: string; }) =>
    apiCall<any>('/api/retainer-logs', { method: 'PUT', body: JSON.stringify(data) });

export const deleteRetainerLog = (deadline: string, period: string) => {
    const params = new URLSearchParams({ deadline, period });
    return apiCall<any>(`/api/retainer-logs?${params.toString()}`, { method: 'DELETE' });
};

export const fetchAuditLogs = (params: { entityType: string; entityId: string; period?: string; limit?: number; page?: number }) => {
    const query = new URLSearchParams({
        entityType: params.entityType,
        entityId: params.entityId,
        limit: String(params.limit || 5),
        page: String(params.page || 1)
    });
    if (params.period) query.set('period', params.period);
    return apiCall<{ logs: any[]; total: number; page: number; totalPages: number }>(`/api/audit-logs?${query.toString()}`);
};

export const fetchSpecialWorklog = (specialID: string) =>
    apiCall<{ taskLog: any[]; activityLog: any[] }>(`/api/specials/${specialID}/worklog`);

export const addTask = (data: { taskID?: string; specialID: string; taskName: string; status?: string; }) =>
    apiCall<any>('/api/tasks', { method: 'POST', body: JSON.stringify(data) });

export const addActivity = (data: { activityID?: string; taskID: string; dateCompleted: string; description: string; }) =>
    apiCall<any>('/api/activities', { method: 'POST', body: JSON.stringify(data) });

export const updateTask = (taskID: string, data: { taskName?: string; status?: string }) =>
    apiCall<any>(`/api/tasks/${taskID}`, { method: 'PUT', body: JSON.stringify(data) });

export const updateActivity = (activityID: string, data: { description?: string; dateCompleted?: string }) =>
    apiCall<any>(`/api/activities/${activityID}`, { method: 'PUT', body: JSON.stringify(data) });

export const deleteActivity = (id: string) =>
    apiCall<any>(`/api/activities/${id}`, { method: 'DELETE' });

export const deleteTask = (id: string) =>
    apiCall<any>(`/api/tasks/${id}`, { method: 'DELETE' });

export const addCredential = (data: Omit<ClientCredential, 'credentialID'>) =>
    apiCall<any>('/api/credentials', { method: 'POST', body: JSON.stringify(data) });

export const updateCredential = (id: string, data: Partial<ClientCredential>) =>
    apiCall<any>(`/api/credentials/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const deleteCredential = (id: string) =>
    apiCall<any>(`/api/credentials/${id}`, { method: 'DELETE' });

export const updateTransmittal = (id: string, data: Partial<Transmittal>) =>
    apiCall<any>(`/api/transmittals/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const updateMeeting = (id: string, data: Partial<Meeting>) =>
    apiCall<any>(`/api/meetings/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const deleteTransmittal = (id: string) =>
    apiCall<any>(`/api/transmittals/${id}`, { method: 'DELETE' });

export const deleteMeeting = (id: string) =>
    apiCall<any>(`/api/meetings/${id}`, { method: 'DELETE' });

export const updateUserProfile = (id: string, data: { firstName?: string; lastName?: string; email?: string; avatarUrl?: string; }) =>
    apiCall<{ success: boolean; user: User }>(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const createUser = (data: { username: string; password: string; firstName: string; lastName: string; role: UserRole; team?: string; status: 'Active' | 'Inactive'; avatarUrl?: string; email?: string; }) =>
    apiCall<{ success: boolean; user: User }>('/api/users', { method: 'POST', body: JSON.stringify(data) });

export const updateUserAdmin = (id: string, data: { username?: string; password?: string; firstName?: string; lastName?: string; role?: UserRole; team?: string; status?: 'Active' | 'Inactive'; avatarUrl?: string; email?: string; }) =>
    apiCall<{ success: boolean; user: User }>(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const updateUserPassword = (id: string, currentPassword: string, newPassword: string) =>
    apiCall<{ success: boolean }>(`/api/users/${id}/password`, { method: 'PUT', body: JSON.stringify({ currentPassword, newPassword }) });

export const uploadAvatar = (avatarDataUrl: string, username: string) =>
    apiCall<{ id: string; url: string }>('/api/upload-avatar', { method: 'POST', body: JSON.stringify({ avatarDataUrl, username }) });

export const checkDeadlines = () =>
    apiCall<{ success: boolean; message: string }>('/api/check-deadlines', { method: 'POST' });
