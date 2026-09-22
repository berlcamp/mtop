-- Every motorcab belongs to an operators' association (MODA). This adds the
-- association registry, seeds it from the AOMODA directory, and links each
-- franchise to one.
--
-- The registry is editable from Admin -> Associations rather than being
-- hardcoded: presidents and contact numbers change every election cycle, and
-- new associations get chartered.

CREATE TABLE mtop.associations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL UNIQUE,
  president_name TEXT,
  contact_number TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE mtop.associations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read associations"
  ON mtop.associations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert associations"
  ON mtop.associations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update associations"
  ON mtop.associations FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete associations"
  ON mtop.associations FOR DELETE TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON mtop.associations TO authenticated;
GRANT ALL ON mtop.associations TO service_role;

CREATE INDEX idx_associations_name ON mtop.associations(name);

-- Seed: the AOMODA association directory, in its published order.
INSERT INTO mtop.associations (name, president_name, contact_number, sort_order) VALUES
  ('OCHDA', 'ABNER C. NÚÑEZA', '0907-865-9909', 1),
  ('MIMODA', 'JEFFREY S. AGANOS', '0963-519-3441', 2),
  ('GALMA', 'ELBERNABE K. TROCIO', '0950-338-0044', 3),
  ('LICADA', 'RETCHIE W. MAGALLANO', '0963-939-7870', 4),
  ('MPMDA', 'NAPOLEON P. NAVARRO JR.', '0906-308-4206', 5),
  ('VALMODA', 'ALDRIN D. SUMIYAYA', '0912-285-2737', 6),
  ('CMODA', 'ROMEO RABACA JR.', '0970-870-7711', 7),
  ('PUREGOLD', 'JEOFEL JAN G. ENDRINA', '0923-461-8643', 8),
  ('BVS MODA', 'BOBBY S. GUILLEN', '0938-686-0843', 9),
  ('GASMODA', 'GERRY T. EVARITTE', '0938-001-6508', 10),
  ('SAMDA', 'NOVEL P. DELOS SANTOS', '0935-069-8424', 11),
  ('BMDA', 'ANECITO D. BALAMBAO JR.', '0910-632-5838', 12),
  ('BMMODA', 'WARLITO F. LAMBAN', '0963-938-5201', 13),
  ('TALIDA', 'RICHARD E. LASTIMOSA', '0956-207-8850', 14),
  ('EMMODA', 'PEDY PANCHO', '0946-395-0918', 15),
  ('MONDA', 'DANILO T. CASINTO', '0965-523-9316', 16),
  ('AIRPORT LINER', 'EDGAR SANTANDER', '0950-111-2587', 17),
  ('LMODA', 'ROLDAN GARBO', '0910-324-3557', 18),
  ('COKIMODA', 'JUVETH V. BATION', '0965-379-0338', 19),
  ('CAMODA', 'BETHUEL S. CANDIA', '0910-946-7335', 20),
  ('MUMCDA', 'RUBEN B. OTOM', '0938-003-3292', 21),
  ('BBMODA', 'ERNIE B. GARCINES', '0912-227-9641', 22),
  ('DIMODA', 'BIENVENIDO S. HINOCTAN JR.', '0975-916-2964', 23),
  ('MHODA', 'RICSON C. BENDOY', '0915-457-3400', 24),
  ('LAPMODA', 'LEONELL A. ELTAGON', '0910-671-6943', 25),
  ('BIRMODA', 'JULITO M. LEDESMA', '0910-713-5123', 26),
  ('LAMJODA', 'MARCELO V. ALDUHEZA', '0981-391-7916', 27),
  ('OCHNS', 'ERWIN D. LACORTE', '0950-292-8474', 28),
  ('MOELCI MODA', 'ALEXANDER TIROL', '0946-232-5678', 29),
  ('MACROMODA', 'SEGUNDINO B. ESTOCONING', '0950-104-7209', 30),
  ('B - MIT - P2', 'GERRY P. PASOK', '0970-910-2796', 31),
  ('LSU ABANIL', 'EDGARDO ELCARTE', '0907-161-2888', 32),
  ('AOSSA', 'STEPHEN A. REGIS', '0951-575-3372', 33),
  ('CODAM', 'JAN EDISON D. GOMEZ', '0981-601-8545', 34),
  ('DOC MODA', 'ORLANDO M. MALIGDONG', '0950-526-6366', 35),
  ('TM MODA', 'PEPE H. MAGHANOY', '0981-504-1895', 36),
  ('JIMODA', 'JERRY S. PANG-AN', '0948-207-1805', 37),
  ('MESUMODA', 'RANEL ROSAL', '0970-915-0817', 38),
  ('MUSSMA', 'EDGAR C. PON', '0912-641-4757', 39),
  ('MSODA', 'EDGAR D. MAMINTAD', '0951-655-3387', 40),
  ('IBJT MODA', 'JIMMY URSAIZ', '0998-443-2088', 41),
  ('FAITH MODA', 'ZALDY H. MONARCA', '0912-941-7018', 42),
  ('MMCODA', 'ELDRED N. MEDINA', '0950-227-2696', 43),
  ('OPMODA', 'EDUARDO B. ARAÑEZ', '0930-144-7032', 44),
  ('JOS MODA', 'LAURENCIO ARSENAL', '0963-561-3161', 45),
  ('BBS MODA', 'RAMON B. ADORNA', '0950-124-0551', 46),
  ('CAMDA', 'ROMEO E. CARDENAS SR.', '0946-861-2420', 47),
  ('LASUDA', 'REUBEN Y. CARDENAS', '0912-174-9057', 48),
  ('TRIMODA', 'MARCELINO D. GUMIMOD', '0910-886-7989', 49),
  ('AOCADA', 'JOEFFREY LOPEZ', '0963-939-8424', 50),
  ('BAMODA', 'ROBERTO M. RAMAYRAT', '0946-372-5017', 51),
  ('OPDA', 'FEDERICO M. SALVACION JR.', '0948-733-3032', 52),
  ('SSR MODA', 'VICTOR CENIZA', '0951-885-5479', 53),
  ('PHIL MODA', 'JUNNY CAW-IT', '0910-746-5025', 54),
  ('MUPHAI', 'DANILO L. ZAMORA', '0950-696-2867', 55),
  ('ELMODA', 'CELSO C. BALABA', '0909-970-8006', 56),
  ('PANDA MODA', 'ERNESTO T. RODRIGUEZ', '0946-100-2446', 57),
  ('CAMADA 2', 'OSCAR B. CALIMPONG', '0946-666-2328', 58),
  ('LABINAY MODA', 'BELTRAN CARILLO', '0985-321-9820', 59),
  ('OCSAT - RS MODA', 'DIOGENES JASARENU', '0910-586-8552', 60),
  ('SSMODA', 'REVIRCK M. CAYMAN', '0967-315-8511', 61),
  ('MUMODA', 'JUDITO GERUNDIO', '0910-200-3808', 62),
  ('SAGOCAMODA', 'CRISTINO D. MONTEFALCON JR.', '0930-363-0502', 63),
  ('KFCMODA', 'CRISPEN N. YOLDAN', '0965-378-1576', 64),
  ('CHOMODA', 'RICKY M. CALINGA', '0912-259-5263', 65),
  ('MAMODA', 'MILVYN P. VILLANUEVA', '0912-428-8259', 66),
  ('SPPDC MODA', 'JERRY E. BERJAME', '0948-720-7789', 67),
  ('SJV MODA', 'ROMEO P. RODRIQUEZ', '0946-913-1396', 68),
  ('CCSN MODA', 'NONIE B. OBIDO', '0963-921-7238', 69),
  ('SUPER MODA', 'AGAPITO M. CABALLERO', '0909-774-5254', 70);

-- Link the franchise to its association. Nullable because existing franchises
-- predate this column; ON DELETE RESTRICT (the default) means an association
-- that is already in use cannot be deleted -- deactivate it instead.
ALTER TABLE mtop.mtop_franchises
  ADD COLUMN IF NOT EXISTS association_id UUID REFERENCES mtop.associations(id);

CREATE INDEX IF NOT EXISTS idx_franchises_association_id
  ON mtop.mtop_franchises(association_id);

COMMENT ON COLUMN mtop.mtop_franchises.association_id IS
  'The operators association (MODA) this motorcab belongs to. Managed from '
  'Admin -> Associations.';
