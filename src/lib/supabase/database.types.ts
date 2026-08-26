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
      shopping_items: {
        Row: {
          id: string;
          house_id: string;
          product_id: string | null;
          category_id: string | null;
          name: string;
          normalized_name: string;
          quantity: number;
          unit: string;
          category_key: string;
          category_name: string | null;
          preferred_brand: string;
          notes: string;
          priority: string;
          status: string;
          added_by_name: string;
          created_by: string;
          updated_by: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id: string;
          house_id: string;
          product_id?: string | null;
          category_id?: string | null;
          name: string;
          normalized_name: string;
          quantity: number;
          unit: string;
          category_key: string;
          category_name?: string | null;
          preferred_brand?: string;
          notes?: string;
          priority?: string;
          status?: string;
          added_by_name: string;
          created_by: string;
          updated_by: string;
          created_at: string;
          updated_at: string;
          deleted_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['shopping_items']['Insert']>;
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
      apply_shopping_item: {
        Args: {
          item_id: string;
          target_house_id: string;
          target_product_id: string | null;
          target_category_id: string | null;
          item_name: string;
          item_normalized_name: string;
          item_quantity: number;
          item_unit: string;
          item_category_key: string;
          item_category_name: string;
          item_preferred_brand: string;
          item_notes: string;
          item_priority: string;
          item_status: string;
          item_added_by_name: string;
          item_created_at: string;
          item_updated_at: string;
          item_deleted_at: string | null;
        };
        Returns: Database['public']['Tables']['shopping_items']['Row'][];
      };
    };
    Enums: { house_role: 'owner' | 'member'; house_member_status: 'active' | 'inactive' };
    CompositeTypes: Record<string, never>;
  };
};
