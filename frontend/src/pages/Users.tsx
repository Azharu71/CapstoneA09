import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useQuery } from "../hooks/useQuery";
import { supabase, unwrap } from "../lib/supabase";
import type { Profile, UserRole } from "../types/database";

type ProfileRow = Profile & { created_at?: string };

async function fetchAllProfiles(): Promise<ProfileRow[]> {
  return unwrap(
    await supabase
      .from("profiles")
      .select("id,name,role,is_active,created_at")
      .order("created_at", { ascending: false }),
  );
}

export default function Users() {
  const { profile, session } = useAuth();
  const isAdmin = profile?.role === "admin";
  const list = useQuery(fetchAllProfiles, []);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Proteksi rute: jika bukan admin, langsung kembalikan ke Dashboard
  if (!isAdmin) return <Navigate to="/" replace />;

  async function updateUser(
    userId: string,
    patch: { role?: UserRole; is_active?: boolean },
  ) {
    if (userId === session?.user.id && patch.is_active === false) {
      setMsg({
        text: "Gagal: Anda tidak dapat menonaktifkan akun sendiri.",
        ok: false,
      });
      return;
    }
    setBusyId(userId);
    setMsg(null);
    try {
      const { error } = await supabase
        .from("profiles")
        .update(patch)
        .eq("id", userId);
      if (error) throw new Error(error.message);
      await list.reload();
      setMsg({
        text: "Perubahan hak akses pengguna berhasil disimpan.",
        ok: true,
      });
    } catch (e) {
      setMsg({
        text: `Gagal memperbarui pengguna: ${e instanceof Error ? e.message : String(e)}`,
        ok: false,
      });
    } finally {
      setBusyId(null);
    }
  }

  const rows = list.data ?? [];

  return (
    <section id="users" className="block">
      <div className="flex flex-wrap justify-between items-end gap-[14px] mb-4">
        <div>
          <h2 className="text-[19px] font-bold text-ink m-0 mb-[5px]">
            Manajemen pengguna &amp; peran
          </h2>
          <div className="text-xs text-muted">
            Aktivasi akun baru dan pengaturan hak akses Administrator / Operator
          </div>
        </div>
        <button
          type="button"
          onClick={() => void list.reload()}
          className="border border-[#ccd6e3] bg-white rounded-lg py-[9px] px-[11px] text-xs text-ink font-bold cursor-pointer hover:brightness-95 transition-all"
        >
          Muat ulang
        </button>
      </div>

      {list.error && (
        <div className="bg-[#fff5e5] text-[#815414] p-[12px_14px] rounded-[10px] text-xs my-3">
          Gagal memuat daftar pengguna: {list.error}
        </div>
      )}

      {msg && (
        <div
          className={`p-[12px_14px] rounded-[10px] text-xs my-3 ${
            msg.ok
              ? "bg-[#e8f7f0] text-[#168873]"
              : "bg-[#fef2f2] text-[#991b1b]"
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="bg-white border border-line rounded-[14px] p-[19px] shadow-[0_3px_10px_#1a31500a]">
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-[#f7f9fc]">
                <th className="py-3 px-[13px] border-b border-[#edf1f6] text-left text-[10px] text-muted uppercase tracking-[0.4px]">
                  Nama Pengguna
                </th>

                <th className="py-3 px-[13px] border-b border-[#edf1f6] text-left text-[10px] text-muted uppercase tracking-[0.4px]">
                  Peran (Role)
                </th>
                <th className="py-3 px-[13px] border-b border-[#edf1f6] text-left text-[10px] text-muted uppercase tracking-[0.4px]">
                  Status Akun
                </th>
                <th className="py-3 px-[13px] border-b border-[#edf1f6] text-left text-[10px] text-muted uppercase tracking-[0.4px]">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const isSelf = u.id === session?.user.id;
                const isBusy = busyId === u.id;
                return (
                  <tr
                    key={u.id}
                    className="hover:bg-[#f8fafd] transition-colors border-b border-[#edf1f6] last:border-b-0"
                  >
                    <td className="py-3 px-[13px] font-semibold text-ink whitespace-nowrap">
                      {u.name || "—"}{" "}
                      {isSelf && (
                        <span className="ml-1.5 text-[10px] py-0.5 px-1.5 rounded bg-[#eef4fb] text-blue">
                          Anda
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-[13px] whitespace-nowrap">
                      <select
                        aria-label={`Peran untuk ${u.name}`}
                        disabled={isBusy || isSelf}
                        value={u.role}
                        onChange={(e) =>
                          void updateUser(u.id, {
                            role: e.target.value as UserRole,
                          })
                        }
                        className="border border-[#ccd6e3] bg-white rounded-lg py-1.5 px-2.5 text-xs text-ink cursor-pointer disabled:opacity-60"
                      >
                        <option value="operator">Operator</option>
                        <option value="admin">Administrator</option>
                      </select>
                    </td>
                    <td className="py-3 px-[13px] whitespace-nowrap">
                      <span
                        className="inline-block py-0.5 px-2 rounded-md font-bold text-[11px]"
                        style={
                          u.is_active
                            ? { background: "#e8f7f0", color: "#168873" }
                            : { background: "#fef2f2", color: "#b54747" }
                        }
                      >
                        {u.is_active ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                    <td className="py-3 px-[13px] whitespace-nowrap">
                      <button
                        type="button"
                        disabled={isBusy || isSelf}
                        onClick={() =>
                          void updateUser(u.id, { is_active: !u.is_active })
                        }
                        className="border border-[#ccd6e3] bg-white rounded-lg py-1.5 px-3 text-xs text-ink font-bold cursor-pointer hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                      >
                        {isBusy
                          ? "Menyimpan…"
                          : u.is_active
                            ? "Nonaktifkan"
                            : "Aktifkan Akun"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
