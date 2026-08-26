export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          avatar_path: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          avatar_path?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: { display_name?: string; avatar_path?: string | null; updated_at?: string };
        Relationships: [];
      };
      houses: {
        Row: {
          id: string;
          name: string;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: { name?: string; updated_at?: string };
        Relationships: [];
      };
      house_members: {
        Row: {
          id: string;
          house_id: string;
          user_id: string;
          role: Database['public']['Enums']['house_role'];
          status: Database['public']['Enums']['house_member_status'];
          joined_at: string;
        };
        Insert: {
          id?: string;
          house_id: string;
          user_id: string;
          role?: Database['public']['Enums']['house_role'];
          status?: Database['public']['Enums']['house_member_status'];
          joined_at?: string;
        };
        Update: {
          role?: Database['public']['Enums']['house_role'];
          status?: Database['public']['Enums']['house_member_status'];
        };
        Relationships: [];
      };
      house_invites: {
        Row: {
          id: string;
          house_id: string;
          token_hash: string;
          created_by: string;
          expires_at: string;
          used_at: string | null;
          used_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          house_id: string;
          token_hash: string;
          created_by: string;
          expires_at: string;
          used_at?: string | null;
          used_by?: string | null;
          created_at?: string;
        };
        Update: { used_at?: string | null; used_by?: string | null };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_house: { Args: { house_name: string }; Returns: string };
      create_house_invite: {
        Args: { target_house_id: string };
        Returns: { token: string; expires_at: string }[];
      };
      accept_house_invite: { Args: { invite_token: string }; Returns: string };
      update_house_member_role: {
        Args: {
          target_house_id: string;
          target_user_id: string;
          new_role: Database['public']['Enums']['house_role'];
        };
        Returns: undefined;
      };
      remove_house_member: {
        Args: { target_house_id: string; target_user_id: string };
        Returns: undefined;
      };
    };
    Enums: { house_role: 'owner' | 'member'; house_member_status: 'active' | 'inactive' };
    CompositeTypes: Record<string, never>;
  };
};
