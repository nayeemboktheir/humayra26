-- Audit §2.4 — "Users can update own messages" allowed staff impersonation.
--
-- The policy was:
--   FOR UPDATE USING (auth.uid() = user_id)
-- with no WITH CHECK. Postgres reuses USING as the check, so ownership was enforced but
-- every *column* was left free. A user could PATCH their own support-thread row and
-- rewrite `message`/`subject`, or set `sender_role = 'admin'` and `sent_by` to any uuid,
-- fabricating messages that render as if staff sent them. That is directly usable as
-- chargeback/dispute evidence.
--
-- The companion INSERT policy (20260627175158) already pins `sender_role = 'user'` and
-- `sent_by = auth.uid()`; only UPDATE was missing an equivalent.
--
-- RLS policies cannot reference OLD, so the column restriction is enforced with a
-- BEFORE UPDATE trigger instead. A trigger (rather than a column-level GRANT) is used
-- deliberately: revoking UPDATE on the other columns from `authenticated` would also
-- strip it from admins, who share that role.

CREATE OR REPLACE FUNCTION public.admin_messages_restrict_user_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admins keep full control of the row.
  IF public.has_role((SELECT auth.uid()), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Everyone else may only flip is_read. Any other edit is silently reverted to the
  -- stored value, so a tampering PATCH succeeds as a no-op rather than erroring and
  -- revealing which columns are guarded.
  NEW.id          := OLD.id;
  NEW.user_id     := OLD.user_id;
  NEW.subject     := OLD.subject;
  NEW.message     := OLD.message;
  NEW.sent_by     := OLD.sent_by;
  NEW.sender_role := OLD.sender_role;
  NEW.order_id    := OLD.order_id;
  NEW.thread_id   := OLD.thread_id;
  NEW.created_at  := OLD.created_at;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_messages_restrict_user_update ON public.admin_messages;
CREATE TRIGGER trg_admin_messages_restrict_user_update
  BEFORE UPDATE ON public.admin_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.admin_messages_restrict_user_update();

-- Also give the policy an explicit WITH CHECK so ownership is asserted on the new row
-- as well as the old one, rather than relying on USING being reused.
DROP POLICY IF EXISTS "Users can update own messages" ON public.admin_messages;
CREATE POLICY "Users can update own messages" ON public.admin_messages
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
