-- ═══════════════════════════════════════════════════════════════════════════
-- APORTACIONS RECORRENTS (ordres permanents del broker)
-- Data: 2026-08-24 · Aplicada al projecte nvcmwhzcskihgktltavm
--
-- Array JSONB de regles, UNA PER POSICIÓ:
--   {
--     id: 'apr_xxx',
--     posicio_id: 'pos_xxx',           -- referència a clients.posicions[].id
--     import: 160,
--     periodicitat: 'mensual'|'bimensual'|'trimestral'|'semestral'|'anual',
--     data_inici: '2026-01-01',        -- 1a aportació; el seu dia és el recurrent
--     data_fi: null,                   -- opcional
--     actiu: true,
--     processada_fins: '2026-04-01',   -- marca d'aigua: res anterior es repregunta
--     saltades: ['2026-03-01'],        -- ocurrències descartades (traçabilitat)
--     nota: 'Ordre permanent MyInvestor'
--   }
--
-- Les regles NO generen moviments soles. El motor (tbi-recurrents.js) calcula
-- les ocurrències vençudes i la persona (client o assessor) les confirma des de
-- platform.html o tbi-app.html. Els moviments creats queden marcats amb
-- origen:'recurrent' i regla_id, de manera que sempre se sap d'on venen.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'clients'
      AND column_name = 'aportacions_recurrents'
  ) THEN
    ALTER TABLE public.clients
      ADD COLUMN aportacions_recurrents jsonb NOT NULL DEFAULT '[]'::jsonb;

    COMMENT ON COLUMN public.clients.aportacions_recurrents IS
      'Regles d''aportació recorrent (una per posició). Vegeu tbi-recurrents.js.';
  END IF;
END $$;
