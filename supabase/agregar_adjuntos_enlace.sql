-- Permite que un adjunto sea un enlace web (Drive, SharePoint, etc.) en vez de un archivo subido.
-- Corre esto en Supabase → SQL Editor. No afecta los adjuntos que ya existen (siguen siendo
-- archivos con file_path normal); simplemente permite que las filas nuevas de tipo "enlace" no
-- traigan archivo.
alter table attachments add column if not exists link_url text;
alter table attachments alter column file_path drop not null;
