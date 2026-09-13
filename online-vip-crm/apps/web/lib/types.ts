export type DashboardSummary = {
  messagesToday: number;
  unreadConversations: number;
  openLeads: number;
  overdueTasks: number;
  asOf: string;
};

export type AuthUserPublic = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  role?: string | null;
  institutionId?: string | null;
};

export type InstitutionPublic = {
  id: string;
  name: string;
  slug?: string | null;
} | null;

export type LoginResponse = {
  accessToken: string;
  user: AuthUserPublic;
  institution: InstitutionPublic;
  permissions: string[];
};

export type Paginated<T> = {
  items: T[];
  total: number;
  take: number;
  skip: number;
};

export type Conversation = {
  id: string;
  provider?: string | null;
  channel?: string | null;
  status?: string | null;
  unreadCount?: number | null;
  lastMessageAt?: string | null;
  lastMessagePreview?: string | null;
  subject?: string | null;
  contact?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    displayName?: string | null;
    primaryPhone?: string | null;
    primaryEmail?: string | null;
  } | null;
};

export type Contact = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  primaryPhone?: string | null;
  primaryEmail?: string | null;
  type?: string | null;
  updatedAt?: string | null;
};

export type Lead = {
  id: string;
  title?: string | null;
  source?: string | null;
  score?: number | null;
  updatedAt?: string | null;
  stage?: {
    id: string;
    key?: string | null;
    name?: string | null;
    color?: string | null;
    sortOrder?: number | null;
    isWon?: boolean;
    isLost?: boolean;
  } | null;
  contact?: Contact | null;
  pipeline?: { id: string; name?: string | null } | null;
};

export type Task = {
  id: string;
  title: string;
  status?: string | null;
  priority?: string | null;
  dueAt?: string | null;
  description?: string | null;
  assignedUserId?: string | null;
};
