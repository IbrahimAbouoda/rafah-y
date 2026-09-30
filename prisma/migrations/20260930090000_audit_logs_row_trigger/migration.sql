-- AC-20 · Sprint 6 (قرار 2026-09-30): حذف مستخدم لا يملك أسطر تدقيق كان مستحيلًا.
-- audit_logs.actorId عليه ON DELETE SET NULL، فحذف أي مستخدم يُصدر UPDATE على audit_logs،
-- والمشغّل FOR EACH STATEMENT يرفضه حتى لو لم يطابق أي سطر. المشغّل الآن على مستوى السطر:
-- أي سطر تدقيق فعلي ما زال لا يُعدَّل ولا يُحذف (AC-19 ②)، وحذف مستخدم له أسطر تدقيق ما زال يُرفض.
-- TRUNCATE لا يعمل إلا بمشغّل على مستوى الجملة، فيبقى له مشغّل مستقل. الدالة نفسها لا تتغيّر.

DROP TRIGGER audit_logs_append_only ON audit_logs;

CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION audit_logs_block_mutation();

CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT
  EXECUTE FUNCTION audit_logs_block_mutation();
