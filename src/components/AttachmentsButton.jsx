import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { uid } from "../lib/data.js";
import { Link2, Paperclip, Trash2, X } from "lucide-react";
import { styles } from "../styles.js";
import { BRAND_DARK, OVERVIEW_LIGHT } from "../theme.js";

// Botón de "adjuntos" reutilizable: certificados UPME, actas de energización, fotos de avance de
// obra. Sube a un bucket privado de Supabase Storage y guarda quién/cuándo en la tabla "attachments".
// Los archivos se descargan con URL firmada temporal (el bucket no es público). En modo lector no
// se puede subir ni borrar, solo ver y descargar lo que ya hay.
export function AttachmentsButton({ projectId, modulo, entidadId, readOnly }) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState(null); // null = aún no cargado
  const [busy, setBusy] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const inputRef = useRef(null);

  const load = async () => {
    const { data } = await supabase
      .from("attachments")
      .select("*")
      .eq("project_id", projectId)
      .eq("modulo", modulo)
      .eq("entidad_id", String(entidadId))
      .order("created_at", { ascending: false });
    setFiles(data || []);
  };

  useEffect(() => {
    if (open && files === null) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    const path = `${projectId}/${modulo}/${entidadId}/${uid()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from("project-files").upload(path, file);
    if (!uploadError) {
      const { data: userData } = await supabase.auth.getUser();
      await supabase.from("attachments").insert({
        project_id: projectId, modulo, entidad_id: String(entidadId),
        file_path: path, file_name: file.name,
        uploaded_by: userData?.user?.id, uploaded_by_email: userData?.user?.email,
      });
      await load();
    }
    setBusy(false);
  };

  const handleAddLink = async () => {
    const url = linkUrl.trim();
    if (!url) return;
    setBusy(true);
    const { data: userData } = await supabase.auth.getUser();
    await supabase.from("attachments").insert({
      project_id: projectId, modulo, entidad_id: String(entidadId),
      link_url: /^https?:\/\//i.test(url) ? url : `https://${url}`,
      file_name: linkLabel.trim() || url,
      uploaded_by: userData?.user?.id, uploaded_by_email: userData?.user?.email,
    });
    setLinkUrl("");
    setLinkLabel("");
    await load();
    setBusy(false);
  };

  const handleDownload = async (att) => {
    if (att.link_url) { window.open(att.link_url, "_blank"); return; }
    const { data } = await supabase.storage.from("project-files").createSignedUrl(att.file_path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const handleDelete = async (att) => {
    setBusy(true);
    if (att.file_path) await supabase.storage.from("project-files").remove([att.file_path]);
    await supabase.from("attachments").delete().eq("id", att.id);
    await load();
    setBusy(false);
  };

  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <button type="button" className="ro-ok" style={styles.attachBtn} onClick={() => setOpen((v) => !v)} title="Adjuntos">
        <Paperclip size={12} /> {files && files.length > 0 ? files.length : ""}
      </button>
      {open && (
        <div style={styles.attachPopover} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: OVERVIEW_LIGHT.textPrimary }}>Adjuntos</span>
            <button type="button" className="ro-ok" style={styles.iconBtn} onClick={() => setOpen(false)}><X size={13} /></button>
          </div>
          {files === null ? (
            <div style={{ fontSize: 11, color: OVERVIEW_LIGHT.textSecondary }}>Cargando…</div>
          ) : files.length === 0 ? (
            <div style={{ fontSize: 11, color: OVERVIEW_LIGHT.textSecondary, marginBottom: 6 }}>Sin archivos todavía.</div>
          ) : (
            <div style={{ maxHeight: 180, overflowY: "auto", marginBottom: 6 }}>
              {files.map((f) => (
                <div key={f.id} style={styles.attachRow}>
                  <span
                    onClick={() => handleDownload(f)}
                    style={{ cursor: "pointer", color: BRAND_DARK, display: "flex", alignItems: "center", gap: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    title={f.link_url || f.file_name}
                  >
                    {f.link_url ? <Link2 size={11} style={{ flexShrink: 0 }} /> : <Paperclip size={11} style={{ flexShrink: 0 }} />}
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{f.file_name}</span>
                  </span>
                  {!readOnly && (
                    <button type="button" style={styles.rowDeleteBtn} onClick={() => handleDelete(f)} disabled={busy}>
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {!readOnly && (
            <>
              <input ref={inputRef} type="file" style={{ display: "none" }} onChange={handleUpload} />
              <button
                type="button"
                style={{ ...styles.addProjectBtn, width: "100%", opacity: busy ? 0.6 : 1 }}
                disabled={busy}
                onClick={() => inputRef.current?.click()}
              >
                {busy ? "Subiendo…" : "Subir archivo"}
              </button>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
                <input
                  placeholder="Nombre (opcional)"
                  value={linkLabel}
                  onChange={(e) => setLinkLabel(e.target.value)}
                  style={{ ...styles.miniInput, width: "100%" }}
                />
                <div style={{ display: "flex", gap: 4 }}>
                  <input
                    placeholder="Pega un enlace (Drive, SharePoint...)"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    style={{ ...styles.miniInput, flex: 1 }}
                  />
                  <button
                    type="button"
                    style={{ ...styles.iconBtn, opacity: busy || !linkUrl.trim() ? 0.5 : 1 }}
                    disabled={busy || !linkUrl.trim()}
                    onClick={handleAddLink}
                    title="Adjuntar enlace"
                  >
                    <Link2 size={13} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </span>
  );
}
