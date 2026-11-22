import { FormEvent, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { supabase, unwrap } from "../lib/supabase";

interface InitRoomProps {
  onRoomCreated: (newRoomId: number) => Promise<void>;
  initialError?: string | null;
  onRefresh?: () => void;
}

const DEFAULT_NODES = [
  {
    id: "node1cv",
    name: "Node 1 CV",
    desc: "Deteksi okupansi kamera (Computer Vision)",
  },
  {
    id: "node1ir",
    name: "Node 1 IR",
    desc: "Kontrol AC infra merah & sensor suhu SHT31",
  },
  { id: "node2", name: "Node 2", desc: "Smart Door Lock & relay pintu" },
  {
    id: "node3",
    name: "Node 3",
    desc: "Energy Monitor PZEM-004T (daya & energi)",
  },
];

export default function InitRoom({
  onRoomCreated,
  initialError,
  onRefresh,
}: InitRoomProps) {
  const { profile, session, signOut } = useAuth();

  // Input Ruang
  const [roomCode, setRoomCode] = useState("U-203");
  const [roomName, setRoomName] = useState("Ruang U-203");
  const [capacity, setCapacity] = useState("40");

  // Input CV Model
  const [modelName, setModelName] = useState("yolo26n");
  const [modelVersion, setModelVersion] = useState("v1");
  const [threshold, setThreshold] = useState("0.5");
  const [inputSize, setInputSize] = useState("320x320");

  // Input Node Status
  const [selectedNodes, setSelectedNodes] = useState<string[]>([
    "node1cv",
    "node1ir",
    "node2",
    "node3",
  ]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  function applyPreset() {
    setRoomCode("U-203");
    setRoomName("Ruang U-203");
    setCapacity("40");
    setModelName("yolo26n");
    setModelVersion("v1");
    setThreshold("0.5");
    setInputSize("320x320");
    setSelectedNodes(["node1cv", "node1ir", "node2", "node3"]);
    setError(null);
  }

  function toggleNode(nodeId: string) {
    setSelectedNodes((prev) =>
      prev.includes(nodeId)
        ? prev.filter((id) => id !== nodeId)
        : [...prev, nodeId],
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessNotice(null);

    const kode = roomCode.trim().toUpperCase();
    if (!kode) {
      return setError("Kode ruang tidak boleh kosong.");
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(kode)) {
      return setError(
        "Kode ruang hanya boleh berisi huruf, angka, dan tanda hubung (misal: U-203).",
      );
    }

    const cap = Number(capacity);
    if (!Number.isInteger(cap) || cap <= 0) {
      return setError(
        "Kapasitas ruang harus berupa bilangan bulat positif (minimal 1).",
      );
    }

    const th = Number(threshold);
    if (Number.isNaN(th) || th < 0 || th > 1) {
      return setError(
        "Confidence threshold harus bernilai antara 0.0 dan 1.0 (contoh: 0.5).",
      );
    }

    setBusy(true);

    try {
      // 1. Tambah data ruangan ke tabel rooms
      const { data: newRoom, error: roomErr } = await supabase
        .from("rooms")
        .insert({
          room_code: kode,
          room_name: roomName.trim() || `Ruang ${kode}`,
          capacity: cap,
        })
        .select(
          "room_id,room_code,room_name,capacity,ac_on_time,ac_off_time,ac_setpoint_c,ac_days",
        )
        .single();

      if (roomErr) {
        throw new Error(`Gagal menyimpan ruang: ${roomErr.message}`);
      }
      if (!newRoom) {
        throw new Error("Ruang berhasil dibuat namun tidak mengembalikan ID.");
      }

      const roomId = newRoom.room_id as number;

      // 2. Tambah model CV ke tabel cv_models (jika diisi)
      if (modelName.trim()) {
        try {
          const { error: cvErr } = await supabase.from("cv_models").upsert(
            {
              model_name: modelName.trim(),
              model_version: modelVersion.trim() || "v1",
              confidence_threshold: th,
              input_size: inputSize.trim() || "320x320",
              is_active: true,
            },
            { onConflict: "model_name,model_version" },
          );
          if (cvErr) console.warn("Pemberitahuan cv_models:", cvErr.message);
        } catch (e) {
          console.warn("Kesalahan opsional cv_models:", e);
        }
      }

      // 3. Tambah status node ke tabel node_status untuk ruang ini
      if (selectedNodes.length > 0) {
        try {
          const nodeRows = selectedNodes.map((node) => ({
            room_id: roomId,
            node,
            online: false,
          }));
          const { error: nodeErr } = await supabase
            .from("node_status")
            .upsert(nodeRows, { onConflict: "room_id,node" });
          if (nodeErr)
            console.warn("Pemberitahuan node_status:", nodeErr.message);
        } catch (e) {
          console.warn("Kesalahan opsional node_status:", e);
        }
      }

      setSuccessNotice(`Ruangan ${kode} berhasil dibuat! Memuat sistem…`);
      await onRoomCreated(roomId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg text-ink flex flex-col">
      {/* Top Header Bar */}
      <header className="bg-white border-b border-line px-5 py-4 md:px-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-blue text-white text-[20px] font-extrabold rounded-[9px] w-[38px] h-[38px] grid place-items-center shrink-0">
            S
          </div>
          <div>
            <strong className="text-navy text-base md:text-lg font-bold tracking-wide">
              SIRENA
            </strong>
            <small className="block text-[8px] md:text-[9px] tracking-[0.5px] text-muted">
              SISTEM INTEGRASI RUANG DAN ENERGI BERKELANJUTAN
            </small>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {session?.user.email && (
            <span className="hidden sm:inline-block py-1.5 px-3 bg-[#f2f6fb] border border-line rounded-full text-muted text-[11px]">
              {session.user.email} •{" "}
              {profile?.role === "admin" ? "Administrator" : "Operator"}
            </span>
          )}
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="border border-[#ccd6e3] bg-white rounded-lg py-1.5 px-3 text-xs text-ink font-semibold cursor-pointer hover:bg-[#f8fafc] transition-all"
            >
              Segarkan
            </button>
          )}
          <button
            type="button"
            onClick={() => void signOut()}
            className="border border-[#ccd6e3] bg-white rounded-lg py-1.5 px-3 text-xs text-ink font-semibold cursor-pointer hover:bg-[#f8fafc] transition-all"
          >
            Keluar
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-[900px] w-full mx-auto p-4 md:p-8">
        {/* Banner Intro */}
        <div className="bg-white border border-line rounded-[14px] p-5 md:p-6 mb-6 shadow-[0_2px_8px_#1a31500a]">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-ink m-0">
                Inisialisasi Ruangan & Konfigurasi Sistem
              </h1>
              <p className="text-xs md:text-sm text-muted mt-1.5 max-w-[620px] leading-relaxed">
                Database saat ini belum memiliki ruangan yang terdaftar.
                Lengkapi formulir di bawah ini untuk menambahkan ruangan pertama
                beserta pengaturan model Computer Vision dan Node IoT.
              </p>
            </div>
            <button
              type="button"
              onClick={applyPreset}
              className="self-start md:self-center shrink-0 border border-blue text-blue hover:bg-blue hover:text-white rounded-lg py-2 px-3.5 text-xs font-bold transition-all cursor-pointer"
            >
              Gunakan Nilai Demo (U-203)
            </button>
          </div>
        </div>

        {error && (
          <div
            className="bg-[#fef2f2] text-[#991b1b] border border-[#fecaca] p-3.5 rounded-[10px] text-xs mb-5"
            role="alert"
          >
            {error}
          </div>
        )}

        {successNotice && (
          <div
            className="bg-[#ecfdf5] text-[#065f46] border border-[#a7f3d0] p-3.5 rounded-[10px] text-xs mb-5"
            role="status"
          >
            {successNotice}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {/* Section 1: Informasi Ruang */}
          <div className="bg-white border border-line rounded-[14px] p-5 md:p-6 shadow-[0_2px_8px_#1a31500a]">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-line">
              <span className="w-6 h-6 rounded-full bg-blue text-white text-xs font-bold grid place-items-center">
                1
              </span>
              <h2 className="text-sm md:text-base font-bold text-ink m-0">
                Data Ruangan
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="room_code"
                  className="block text-xs font-semibold text-muted mb-1.5"
                >
                  Kode Ruang <span className="text-red-500">*</span>
                </label>
                <input
                  id="room_code"
                  type="text"
                  required
                  disabled={busy}
                  placeholder="U-203"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  className="w-full p-2.5 border border-[#ccd6e3] rounded-lg text-xs text-ink bg-white focus:outline-none focus:border-blue uppercase font-medium"
                />
              </div>

              <div>
                <label
                  htmlFor="room_name"
                  className="block text-xs font-semibold text-muted mb-1.5"
                >
                  Nama Ruang <span className="text-red-500">*</span>
                </label>
                <input
                  id="room_name"
                  type="text"
                  required
                  disabled={busy}
                  placeholder="Ruang U-203"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  className="w-full p-2.5 border border-[#ccd6e3] rounded-lg text-xs text-ink bg-white focus:outline-none focus:border-blue"
                />
              </div>

              <div>
                <label
                  htmlFor="capacity"
                  className="block text-xs font-semibold text-muted mb-1.5"
                >
                  Kapasitas (Orang) <span className="text-red-500">*</span>
                </label>
                <input
                  id="capacity"
                  type="number"
                  min="1"
                  required
                  disabled={busy}
                  placeholder="40"
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  className="w-full p-2.5 border border-[#ccd6e3] rounded-lg text-xs text-ink bg-white focus:outline-none focus:border-blue"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Model Computer Vision */}
          <div className="bg-white border border-line rounded-[14px] p-5 md:p-6 shadow-[0_2px_8px_#1a31500a]">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-line">
              <span className="w-6 h-6 rounded-full bg-blue text-white text-xs font-bold grid place-items-center">
                2
              </span>
              <div>
                <h2 className="text-sm md:text-base font-bold text-ink m-0">
                  Model Computer Vision
                </h2>
                <span className="text-[11px] text-muted">
                  Biarkan secara default
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label
                  htmlFor="model_name"
                  className="block text-xs font-semibold text-muted mb-1.5"
                >
                  Nama Model
                </label>
                <input
                  id="model_name"
                  type="text"
                  disabled={busy}
                  placeholder="yolo26n"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  className="w-full p-2.5 border border-[#ccd6e3] rounded-lg text-xs text-ink bg-white focus:outline-none focus:border-blue"
                />
              </div>

              <div>
                <label
                  htmlFor="model_version"
                  className="block text-xs font-semibold text-muted mb-1.5"
                >
                  Versi Model
                </label>
                <input
                  id="model_version"
                  type="text"
                  disabled={busy}
                  placeholder="v1"
                  value={modelVersion}
                  onChange={(e) => setModelVersion(e.target.value)}
                  className="w-full p-2.5 border border-[#ccd6e3] rounded-lg text-xs text-ink bg-white focus:outline-none focus:border-blue"
                />
              </div>

              <div>
                <label
                  htmlFor="threshold"
                  className="block text-xs font-semibold text-muted mb-1.5"
                >
                  Confidence Threshold
                </label>
                <input
                  id="threshold"
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  disabled={busy}
                  placeholder="0.5"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  className="w-full p-2.5 border border-[#ccd6e3] rounded-lg text-xs text-ink bg-white focus:outline-none focus:border-blue"
                />
              </div>

              <div>
                <label
                  htmlFor="input_size"
                  className="block text-xs font-semibold text-muted mb-1.5"
                >
                  Input Size
                </label>
                <input
                  id="input_size"
                  type="text"
                  disabled={busy}
                  placeholder="320x320"
                  value={inputSize}
                  onChange={(e) => setInputSize(e.target.value)}
                  className="w-full p-2.5 border border-[#ccd6e3] rounded-lg text-xs text-ink bg-white focus:outline-none focus:border-blue"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Setup Node Status */}
          <div className="bg-white border border-line rounded-[14px] p-5 md:p-6 shadow-[0_2px_8px_#1a31500a]">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-line">
              <span className="w-6 h-6 rounded-full bg-blue text-white text-xs font-bold grid place-items-center">
                3
              </span>
              <div>
                <h2 className="text-sm md:text-base font-bold text-ink m-0">
                  Inisialisasi Node Perangkat
                </h2>
                <span className="text-[11px] text-muted">
                  Mendaftarkan perangkat IoT untuk ruangan ini dengan status
                  awal offline
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {DEFAULT_NODES.map((node) => {
                const checked = selectedNodes.includes(node.id);
                return (
                  <label
                    key={node.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      checked
                        ? "bg-[#f2f6fb] border-[#b0c8e8]"
                        : "bg-white border-line opacity-75 hover:opacity-100"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={busy}
                      onChange={() => toggleNode(node.id)}
                      className="mt-0.5 rounded cursor-pointer"
                    />
                    <div>
                      <div className="text-xs font-bold text-ink">
                        {node.name}
                      </div>
                      <div className="text-[11px] text-muted mt-0.5">
                        {node.desc}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Action Footer */}
          <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
            <button
              type="submit"
              disabled={busy}
              className="w-full sm:w-auto py-2.5 px-6 bg-blue border border-blue text-white rounded-lg font-bold text-xs cursor-pointer hover:brightness-95 disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              {busy && (
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
              )}
              {busy
                ? "Menyimpan & Menginisialisasi…"
                : "Simpan & Inisialisasi Ruangan"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
