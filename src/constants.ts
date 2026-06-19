
import { UserRole, Status, Task, EngagementCategory } from './types';
import { Home, Users, CheckSquare, FileText, Briefcase, BarChart2, Settings, BookOpen } from 'lucide-react';

export const MOCK_USER: any = {
  id: 'user-1',
  username: 'Jane Doe',
  role: UserRole.MANAGER,
  email: 'jane.doe@myapp.com',
  leaveBalance: 14,
  status: 'Active',
  avatarUrl: 'https://picsum.photos/seed/janedoe/100/100'
};

export const MOCK_USERS: any[] = [
    MOCK_USER,
    { id: 'user-2', username: 'John Smith', role: UserRole.STAFF, email: 'john.smith@myapp.com', leaveBalance: 5, status: 'Active', avatarUrl: 'https://picsum.photos/seed/johnsmith/100/100' },
    { id: 'user-3', username: 'Peter Jones', role: UserRole.STAFF, email: 'peter.jones@myapp.com', leaveBalance: 10, status: 'Active', avatarUrl: 'https://picsum.photos/seed/peterjones/100/100' },
    { id: 'user-4', username: 'Mary Williams', role: UserRole.ADMIN, email: 'mary.williams@myapp.com', leaveBalance: 20, status: 'Active', avatarUrl: 'https://picsum.photos/seed/marywilliams/100/100' },
    { id: 'user-5', username: 'David Brown', role: UserRole.HR, email: 'david.brown@myapp.com', leaveBalance: 15, status: 'Active', avatarUrl: 'https://picsum.photos/seed/davidbrown/100/100' },
];

export const MOCK_CLIENTS: any[] = [
  { id: 'client-1', name: 'Innovate Inc.', contactInfo: { email: 'contact@innovate.com', phone: '555-1234' }, industry: 'Technology' },
  { id: 'client-2', name: 'Global Logistics', contactInfo: { email: 'info@globallogistics.com', phone: '555-5678' }, industry: 'Transport' },
  { id: 'client-3', name: 'HealthFirst Medical', contactInfo: { email: 'support@healthfirst.com', phone: '555-8765' }, industry: 'Healthcare' },
];

export const MOCK_ENGAGEMENTS: any[] = [
  { 
    id: 'eng-1', 
    clientId: 'client-1', 
    category: EngagementCategory.RETAINER,
    type: 'BIR Monthly Tax Retainer', 
    status: Status.IN_PROGRESS, 
    startDate: '2023-01-01', 
    endDate: '2023-12-31', 
    deadline: '2023-12-31',
    compliance: [
      { month: '2023-01', status: Status.PAID, filedDate: '2023-01-15', paymentRef: 'TX-001' },
      { month: '2023-02', status: Status.PAID, filedDate: '2023-02-14', paymentRef: 'TX-002' },
      { month: '2023-03', status: Status.PAID, filedDate: '2023-03-12', paymentRef: 'TX-003' },
      { month: '2023-04', status: Status.PAID, filedDate: '2023-04-14', paymentRef: 'TX-004' },
      { month: '2023-05', status: Status.FILED, filedDate: '2023-05-15' },
      { month: '2023-06', status: Status.FILED, filedDate: '2023-06-15' },
      { month: '2023-07', status: Status.PENDING },
      { month: '2023-08', status: Status.PENDING },
      { month: '2023-09', status: Status.PENDING },
      { month: '2023-10', status: Status.PENDING },
      { month: '2023-11', status: Status.PENDING },
      { month: '2023-12', status: Status.PENDING },
    ]
  },
  { 
    id: 'eng-2', 
    clientId: 'client-2', 
    category: EngagementCategory.SPECIAL,
    type: 'SEC Amendment', 
    status: Status.IN_PROGRESS, 
    startDate: '2023-10-15', 
    endDate: '2023-11-15', 
    deadline: '2023-11-20',
    milestones: [
      { id: 'm-1', name: 'Drafting of Documents', status: Status.COMPLETED, dueDate: '2023-10-20', order: 1 },
      { id: 'm-2', name: 'Board Approval', status: Status.COMPLETED, dueDate: '2023-10-25', order: 2 },
      { id: 'm-3', name: 'SEC Submission', status: Status.IN_PROGRESS, dueDate: '2023-11-05', order: 3 },
      { id: 'm-4', name: 'Release of Amended Cert', status: Status.PENDING, dueDate: '2023-11-15', order: 4 },
    ]
  },
  { 
    id: 'eng-3', 
    clientId: 'client-1', 
    category: EngagementCategory.SPECIAL,
    type: 'Business Permit Renewal', 
    status: Status.PENDING, 
    startDate: '2024-01-10', 
    endDate: '2024-03-10', 
    deadline: '2024-03-15',
    milestones: [
      { id: 'm-1', name: 'Assessment', status: Status.PENDING, dueDate: '2024-01-15', order: 1 },
      { id: 'm-2', name: 'Payment', status: Status.PENDING, dueDate: '2024-01-20', order: 2 },
      { id: 'm-3', name: 'Issuance', status: Status.PENDING, dueDate: '2024-01-30', order: 3 },
    ]
  },
  { 
    id: 'eng-4', 
    clientId: 'client-3', 
    category: EngagementCategory.RETAINER,
    type: 'BIR Monthly Tax Retainer', 
    status: Status.IN_PROGRESS, 
    startDate: '2023-11-01', 
    endDate: '2024-02-28', 
    deadline: '2024-02-28',
    compliance: [
      { month: '2023-11', status: Status.FILED, filedDate: '2023-11-10' },
      { month: '2023-12', status: Status.PENDING },
    ]
  },
];

export const MOCK_TASKS: Task[] = [
  { id: 'task-1', engagementId: 'eng-1', title: 'Review Accounts Receivable', assigneeId: 'user-2', status: Status.IN_PROGRESS, dueDate: '2023-11-25' },
  { id: 'task-2', engagementId: 'eng-1', title: 'Draft Audit Report', assigneeId: 'user-1', status: Status.TODO, dueDate: '2023-11-28' },
  { id: 'task-3', engagementId: 'eng-4', title: 'Initial Client Meeting', assigneeId: 'user-1', status: Status.COMPLETED, dueDate: '2023-11-10' },
  { id: 'task-4', engagementId: 'eng-4', title: 'Test Internal Controls', assigneeId: 'user-3', status: Status.IN_PROGRESS, dueDate: '2023-12-15' },
  { id: 'task-5', engagementId: 'eng-2', title: 'Finalize Tax Filing', assigneeId: 'user-3', status: Status.COMPLETED, dueDate: '2023-11-14' },
  { id: 'task-6', engagementId: 'eng-1', title: 'Inventory Count Observation', assigneeId: 'user-2', status: Status.TODO, dueDate: '2023-11-22' },
];

export const MOCK_TIMELOGS: any[] = [
  { id: 'time-1', userId: 'user-2', engagementId: 'eng-1', hours: 8, notes: 'AR testing', date: '2023-11-19' },
  { id: 'time-2', userId: 'user-3', engagementId: 'eng-4', hours: 6, notes: 'Planning meeting', date: '2023-11-18' },
  { id: 'time-3', userId: 'user-1', engagementId: 'eng-1', hours: 4, notes: 'Reviewing team progress', date: '2023-11-19' },
  { id: 'time-4', userId: 'user-2', engagementId: 'eng-1', hours: 8, notes: 'AR testing day 2', date: '2023-11-20' },
];

export const MOCK_LEAVE_REQUESTS: any[] = [
  { id: 'leave-1', userId: 'user-2', type: 'Annual', startDate: '2023-12-22', endDate: '2024-01-02', reason: 'Holiday vacation', status: Status.APPROVED },
  { id: 'leave-2', userId: 'user-3', type: 'Sick', startDate: '2023-11-20', endDate: '2023-11-21', reason: 'Flu', status: Status.PENDING },
  { id: 'leave-3', userId: 'user-1', type: 'Annual', startDate: '2024-01-15', endDate: '2024-01-19', reason: 'Personal trip', status: Status.PENDING },
];

export const MOCK_TRANSMITTALS: any[] = [
  { id: 'trans-1', clientId: 'client-1', engagementId: 'eng-1', documentName: 'Audit Confirmation - Bank A', transmittedAt: '2023-11-20', receivedBy: 'John Custodian', method: 'Courier', status: 'In Transit' },
  { id: 'trans-2', clientId: 'client-2', engagementId: 'eng-3', documentName: 'Signed Tax Return - FY2023', transmittedAt: '2023-11-15', receivedBy: 'Mary Taxpayer', method: 'Portal', status: 'Acknowledged' },
  { id: 'trans-3', clientId: 'client-1', engagementId: 'eng-2', documentName: 'Voucher Samples', transmittedAt: '2023-11-18', receivedBy: 'Audit Team', method: 'Personal', status: 'Received' },
];


export const MAX_TEMPLATE_SIZE = 5 * 1024 * 1024; // 5 MB

export const NAV_LINKS = [
  { name: 'Dashboard', path: '/dashboard', icon: Home },
  {
    name: 'Engagements',
    path: '/retainers',
    icon: CheckSquare,
    children: [
      { name: 'Retainers', path: '/retainers', icon: FileText },
      { name: 'Special Projects', path: '/special-projects', icon: Briefcase },
    ],
  },
  { name: 'Clients', path: '/clients', icon: Users },
  {
    name: 'Operations',
    path: '/transmittals',
    icon: Briefcase,
    children: [
      { name: 'Transmittals', path: '/transmittals', icon: FileText },
      { name: 'Meetings', path: '/meetings', icon: Users },
    ],
  },
  { name: 'Library', path: '/library', icon: BookOpen },
  { name: 'Reports', path: '/reports', icon: BarChart2 },
  { name: 'Settings', path: '/settings', icon: Settings },
];
