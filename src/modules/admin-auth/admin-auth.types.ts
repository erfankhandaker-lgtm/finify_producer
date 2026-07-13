export interface AdminTokenPayload {
  sub: string;
  sid: string;
  username: string;
  roles: string[];
  permissions: string[];
  type: 'admin_access';
}

export interface AdminRequestContext {
  ipAddress?: string;
  userAgent?: string;
}
