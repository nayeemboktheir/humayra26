ALTER TABLE public.admin_messages
  ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS thread_id UUID,
  ADD COLUMN IF NOT EXISTS sender_role TEXT NOT NULL DEFAULT 'admin';

CREATE INDEX IF NOT EXISTS idx_admin_messages_user_thread
  ON public.admin_messages (user_id, thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_admin_messages_order
  ON public.admin_messages (order_id);

DROP POLICY IF EXISTS "Users can send own messages" ON public.admin_messages;
CREATE POLICY "Users can send own messages" ON public.admin_messages
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND auth.uid() = sent_by
    AND sender_role = 'user'
  );
