export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      buku: {
        Row: {
          created_at: string
          deleted_at: string | null
          deskripsi: string | null
          id: string
          isbn: string | null
          judul: string
          kategori: string | null
          kode_buku: string
          lokasi_rak: string | null
          penerbit: string | null
          pengarang: string | null
          sampul_path: string | null
          tahun_terbit: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          deskripsi?: string | null
          id?: string
          isbn?: string | null
          judul: string
          kategori?: string | null
          kode_buku: string
          lokasi_rak?: string | null
          penerbit?: string | null
          pengarang?: string | null
          sampul_path?: string | null
          tahun_terbit?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          deskripsi?: string | null
          id?: string
          isbn?: string | null
          judul?: string
          kategori?: string | null
          kode_buku?: string
          lokasi_rak?: string | null
          penerbit?: string | null
          pengarang?: string | null
          sampul_path?: string | null
          tahun_terbit?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      eksemplar: {
        Row: {
          barcode_value: string
          buku_id: string
          created_at: string
          deleted_at: string | null
          id: string
          kode_eksemplar: string
          status: Database["public"]["Enums"]["eksemplar_status"]
          updated_at: string
        }
        Insert: {
          barcode_value: string
          buku_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          kode_eksemplar: string
          status?: Database["public"]["Enums"]["eksemplar_status"]
          updated_at?: string
        }
        Update: {
          barcode_value?: string
          buku_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          kode_eksemplar?: string
          status?: Database["public"]["Enums"]["eksemplar_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "eksemplar_buku_id_fkey"
            columns: ["buku_id"]
            isOneToOne: false
            referencedRelation: "buku"
            referencedColumns: ["id"]
          },
        ]
      }
      peminjaman: {
        Row: {
          buku_id: string | null
          catatan: string | null
          created_at: string
          disetujui_oleh: string | null
          durasi_hari: number | null
          eksemplar_id: string | null
          id: string
          status: Database["public"]["Enums"]["peminjaman_status"]
          tanggal_jatuh_tempo: string | null
          tanggal_kembali: string | null
          tanggal_pengajuan: string
          tanggal_pinjam: string | null
          user_id: string
        }
        Insert: {
          buku_id?: string | null
          catatan?: string | null
          created_at?: string
          disetujui_oleh?: string | null
          durasi_hari?: number | null
          eksemplar_id?: string | null
          id?: string
          status?: Database["public"]["Enums"]["peminjaman_status"]
          tanggal_jatuh_tempo?: string | null
          tanggal_kembali?: string | null
          tanggal_pengajuan?: string
          tanggal_pinjam?: string | null
          user_id: string
        }
        Update: {
          buku_id?: string | null
          catatan?: string | null
          created_at?: string
          disetujui_oleh?: string | null
          durasi_hari?: number | null
          eksemplar_id?: string | null
          id?: string
          status?: Database["public"]["Enums"]["peminjaman_status"]
          tanggal_jatuh_tempo?: string | null
          tanggal_kembali?: string | null
          tanggal_pengajuan?: string
          tanggal_pinjam?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "peminjaman_buku_id_fkey"
            columns: ["buku_id"]
            isOneToOne: false
            referencedRelation: "buku"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "peminjaman_eksemplar_id_fkey"
            columns: ["eksemplar_id"]
            isOneToOne: false
            referencedRelation: "eksemplar"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          is_profile_completed: boolean
          nama: string | null
          nim: string | null
          prodi: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          is_profile_completed?: boolean
          nama?: string | null
          nim?: string | null
          prodi?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          is_profile_completed?: boolean
          nama?: string | null
          nim?: string | null
          prodi?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "super_admin" | "admin" | "admin_sementara" | "mahasiswa"
      eksemplar_status: "tersedia" | "dipinjam" | "dipesan" | "hilang" | "rusak"
      peminjaman_status:
        | "menunggu"
        | "disetujui"
        | "ditolak"
        | "dipinjam"
        | "dikembalikan"
        | "terlambat"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["super_admin", "admin", "admin_sementara", "mahasiswa"],
      eksemplar_status: ["tersedia", "dipinjam", "dipesan", "hilang", "rusak"],
      peminjaman_status: [
        "menunggu",
        "disetujui",
        "ditolak",
        "dipinjam",
        "dikembalikan",
        "terlambat",
      ],
    },
  },
} as const
