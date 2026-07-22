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
      buku_history: {
        Row: {
          buku_id: string
          created_at: string
          data_lama: Json
          diubah_oleh: string | null
          id: string
        }
        Insert: {
          buku_id: string
          created_at?: string
          data_lama: Json
          diubah_oleh?: string | null
          id?: string
        }
        Update: {
          buku_id?: string
          created_at?: string
          data_lama?: Json
          diubah_oleh?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "buku_history_buku_id_fkey"
            columns: ["buku_id"]
            isOneToOne: false
            referencedRelation: "buku"
            referencedColumns: ["id"]
          },
        ]
      }
      denda: {
        Row: {
          catatan: string | null
          created_at: string
          dibebaskan_oleh: string | null
          dilunasi_oleh: string | null
          id: string
          jumlah: number
          peminjaman_id: string
          status: Database["public"]["Enums"]["denda_status"]
          tanggal_dihitung: string
          updated_at: string
        }
        Insert: {
          catatan?: string | null
          created_at?: string
          dibebaskan_oleh?: string | null
          dilunasi_oleh?: string | null
          id?: string
          jumlah?: number
          peminjaman_id: string
          status?: Database["public"]["Enums"]["denda_status"]
          tanggal_dihitung?: string
          updated_at?: string
        }
        Update: {
          catatan?: string | null
          created_at?: string
          dibebaskan_oleh?: string | null
          dilunasi_oleh?: string | null
          id?: string
          jumlah?: number
          peminjaman_id?: string
          status?: Database["public"]["Enums"]["denda_status"]
          tanggal_dihitung?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "denda_peminjaman_id_fkey"
            columns: ["peminjaman_id"]
            isOneToOne: true
            referencedRelation: "peminjaman"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "peminjaman_user_profiles_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pengaturan_denda: {
        Row: {
          batas_ambil_reservasi_jam: number
          grace_days: number
          id: number
          max_denda: number | null
          purge_hari: number
          tarif_per_hari: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          batas_ambil_reservasi_jam?: number
          grace_days?: number
          id?: number
          max_denda?: number | null
          purge_hari?: number
          tarif_per_hari?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          batas_ambil_reservasi_jam?: number
          grace_days?: number
          id?: number
          max_denda?: number | null
          purge_hari?: number
          tarif_per_hari?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
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
      purge_log: {
        Row: {
          created_at: string
          detail: Json | null
          entitas: string
          id: string
          jumlah: number
        }
        Insert: {
          created_at?: string
          detail?: Json | null
          entitas: string
          id?: string
          jumlah: number
        }
        Update: {
          created_at?: string
          detail?: Json | null
          entitas?: string
          id?: string
          jumlah?: number
        }
        Relationships: []
      }
      reservasi: {
        Row: {
          buku_id: string
          created_at: string
          eksemplar_id: string | null
          id: string
          posisi_antrian: number
          status: Database["public"]["Enums"]["reservasi_status"]
          tanggal_kadaluarsa: string | null
          tanggal_reservasi: string
          tanggal_tersedia: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          buku_id: string
          created_at?: string
          eksemplar_id?: string | null
          id?: string
          posisi_antrian?: number
          status?: Database["public"]["Enums"]["reservasi_status"]
          tanggal_kadaluarsa?: string | null
          tanggal_reservasi?: string
          tanggal_tersedia?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          buku_id?: string
          created_at?: string
          eksemplar_id?: string | null
          id?: string
          posisi_antrian?: number
          status?: Database["public"]["Enums"]["reservasi_status"]
          tanggal_kadaluarsa?: string | null
          tanggal_reservasi?: string
          tanggal_tersedia?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservasi_buku_id_fkey"
            columns: ["buku_id"]
            isOneToOne: false
            referencedRelation: "buku"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservasi_eksemplar_id_fkey"
            columns: ["eksemplar_id"]
            isOneToOne: false
            referencedRelation: "eksemplar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservasi_user_profiles_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      expire_reservasi_lewat: { Args: never; Returns: number }
      hapus_permanen_buku: { Args: { _buku_id: string }; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hitung_denda_untuk: { Args: { _peminjaman_id: string }; Returns: number }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      kembalikan_versi_buku: {
        Args: { _history_id: string }
        Returns: undefined
      }
      mahasiswa_layak_pinjam: { Args: { _user_id: string }; Returns: boolean }
      promosikan_reservasi_berikutnya: {
        Args: { _buku_id: string; _eksemplar_id: string }
        Returns: string
      }
      pulihkan_buku: { Args: { _buku_id: string }; Returns: undefined }
      purge_buku_terhapus_lama: { Args: never; Returns: number }
      tandai_peminjaman_terlambat: { Args: never; Returns: number }
    }
    Enums: {
      app_role: "super_admin" | "admin" | "admin_sementara" | "mahasiswa"
      denda_status: "belum_bayar" | "lunas" | "dibebaskan"
      eksemplar_status: "tersedia" | "dipinjam" | "dipesan" | "hilang" | "rusak"
      peminjaman_status:
        | "menunggu"
        | "disetujui"
        | "ditolak"
        | "dipinjam"
        | "dikembalikan"
        | "terlambat"
      reservasi_status:
        | "menunggu"
        | "tersedia"
        | "diambil"
        | "kadaluarsa"
        | "batal"
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
      denda_status: ["belum_bayar", "lunas", "dibebaskan"],
      eksemplar_status: ["tersedia", "dipinjam", "dipesan", "hilang", "rusak"],
      peminjaman_status: [
        "menunggu",
        "disetujui",
        "ditolak",
        "dipinjam",
        "dikembalikan",
        "terlambat",
      ],
      reservasi_status: [
        "menunggu",
        "tersedia",
        "diambil",
        "kadaluarsa",
        "batal",
      ],
    },
  },
} as const
