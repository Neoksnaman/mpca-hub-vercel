
export enum UserRole {
  ADMIN = 'Admin',
  HR = 'HR',
  STAFF = 'Staff',
  SENIOR = 'Senior',
  SUPERVISOR = 'Supervisor',
  MANAGER = 'Manager',
}

export enum Status {
  PENDING = 'Pending',
  IN_PROGRESS = 'In Progress',
  COMPLETED = 'Completed',
  APPROVED = 'Approved',
  REJECTED = 'Rejected',
  TODO = 'To Do',
  FILED = 'Filed',
  PAID = 'Paid',
}

export enum EngagementCategory {
  RETAINER = 'Retainer',
  SPECIAL = 'Special',
}

export interface Milestone {
  id: string;
  name: string;
  status: Status;
  dueDate: string;
  completedAt?: string;
  order: number;
}

export interface ComplianceMonth {
  month: string; // e.g. "2023-11"
  status: Status;
  filedDate?: string;
  paymentRef?: string;
}

export interface RetainerEngagement {
  id: string;
  clientId: string;
  serviceType: string;
  serviceName?: string;
  startDate: string;
  assignedStaff: string;
  engagementStatus: string;
}

export interface Client {
  id: string;
  name: string;
  tin: string;
  entityType: string;
  email: string;
  contactPerson: string;
  status: string;
  fiscalYearEnd: string;
}

export interface SpecialEngagement {
  id: string;
  clientId: string;
  assignedStaff: string;
  serviceType: string;
  serviceName?: string;
  projectTitle: string;
  startDate: string;
  endDate: string;
  status: string;
  description: string;
}

export interface TaxCompliance {
  id: string;
  clientId: string;
  formType: string;
  period: string;
  deadlineDate: string;
  filingStatus: 'Pending' | 'Filed' | 'Paid';
  confirmationNumber: string;
}

export interface DeliverableLog {
  id: string;
  engagementId: string;
  month: string;
  year: string;
  complianceType: string;
  status: 'Pending' | 'Filed' | 'In Review' | 'Overdue';
  dateFiled?: string;
  remarks?: string;
  assignedStaff: string;
}

export interface ProjectTask {
  taskID: string;
  specialID: string;
  taskName: string;
  status: string;
}

export interface ProjectActivity {
  activityID: string;
  taskID: string;
  dateCompleted: string;
  description: string;
}

export interface ClientCredential {
  credentialID: string;
  clientID: string;
  systemName: string;
  username: string;
  password: string;
  securityAnswer: string;
  remarks: string;
}

export interface Transmittal {
  transmittalID: string;
  clientID: string;
  userID: string;
  items: string; // Delimited by ||
  date: string;
  receiptUrl: string;
  receiverName?: string;
  receiverAddress?: string;
}

export interface Meeting {
  meetingID: string;
  date: string;
  subject: string;
  userIDs: string; // Comma separated
  momUrl: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'Engagement' | 'Client' | 'Operation' | 'Overdue' | 'TransmittalWarning';
  link: string;
  isRead: boolean;
  createdAt: string;
}

export interface AppData {
  retainers: RetainerEngagement[];
  specials: SpecialEngagement[];
  taxes: TaxCompliance[];
  users: User[];
  clients: Client[];
  deliverables: DeliverableLog[];
  services: Service[];
  taxCompliances: ServiceTaxCompliance[];
  deadlines: RetainerDeadline[];
  retainerLogs: any[][];
  taskLog: ProjectTask[];
  activityLog: ProjectActivity[];
  credentials: ClientCredential[];
  transmittals: Transmittal[];
  meetings: Meeting[];
  notifications: Notification[];
}

export interface Service {
  id: string;
  name: string;
  type: string;
}

export interface ServiceTaxCompliance {
  taxID: string;
  complianceName: string;
  complianceCode: string;
  frequency: 'Monthly' | 'Quarterly' | 'Annual';
}

export interface RetainerDeadline {
  deadlineID: string;
  retainerID: string;
  serviceID: string;
  taxID: string;
  dueDate: string; // e.g. "M+15", "Q+25"
}

export interface User {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  team?: string;
  status: 'Active' | 'Inactive';
  avatarUrl: string;
  email?: string;
}

