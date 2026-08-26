export type AuthUser = {
  id: string;
  email: string;
};

export type AuthSession = {
  accessToken: string;
  user: AuthUser;
};

export type AuthStateEvent =
  | 'INITIAL_SESSION'
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'TOKEN_REFRESHED'
  | 'USER_UPDATED'
  | 'PASSWORD_RECOVERY';

export type SignUpResult = {
  session: AuthSession | null;
  user: AuthUser;
  requiresEmailConfirmation: boolean;
};
