-- Wrap auth.uid() in a scalar subquery across every RLS policy.
--
-- In a policy USING clause, a bare auth.uid() is re-evaluated for EVERY ROW scanned.
-- Wrapping it as (SELECT auth.uid()) lets the planner hoist it into an InitPlan that
-- runs once per query. This is Supabase's documented #1 RLS performance fix, and it
-- applies to the ~60 bare call sites in this schema, including every
-- has_role(auth.uid(), 'admin') check (each of which re-probes user_roles per row).
--
-- Policies are rebuilt from their live definitions rather than retyped by hand, so the
-- predicates cannot drift from what is currently deployed. Only the auth.uid() call
-- shape changes; permissive/restrictive, command, roles, and logic are preserved.
DO $$
DECLARE
  pol record;
  new_qual text;
  new_check text;
  stmt text;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (qual LIKE '%auth.uid()%' OR with_check LIKE '%auth.uid()%')
  LOOP
    -- Skip anything already hoisted, so re-running this migration is a no-op.
    IF pol.qual LIKE '%SELECT auth.uid()%' OR pol.with_check LIKE '%SELECT auth.uid()%' THEN
      CONTINUE;
    END IF;

    new_qual  := replace(pol.qual,       'auth.uid()', '(SELECT auth.uid())');
    new_check := replace(pol.with_check, 'auth.uid()', '(SELECT auth.uid())');

    EXECUTE format('DROP POLICY %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);

    stmt := format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s',
                   pol.policyname,
                   pol.schemaname,
                   pol.tablename,
                   pol.permissive,
                   pol.cmd,
                   array_to_string(pol.roles, ', '));

    IF new_qual IS NOT NULL THEN
      stmt := stmt || format(' USING (%s)', new_qual);
    END IF;
    IF new_check IS NOT NULL THEN
      stmt := stmt || format(' WITH CHECK (%s)', new_check);
    END IF;

    EXECUTE stmt;
    RAISE NOTICE 'Rewrote policy % on %.%', pol.policyname, pol.schemaname, pol.tablename;
  END LOOP;
END $$;
