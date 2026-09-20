# Fix customer order status updates

## Confirmed issue

The database currently has **205 orders with duplicate shipment records** and **275 extra shipment rows**. Some duplicates contain different stages for the same order. Both the admin page and customer order page currently reduce those rows into one status without explicitly choosing the newest row, so an older shipment can overwrite the latest status on screen.

The existing staff permissions already allow admins, moderators, and employees to update orders and shipments, so permissions are not the current blocker.

## Changes

1. **Clean the existing shipment data**
   - Keep one canonical shipment per order, choosing the most recently updated row.
   - Preserve useful tracking details from duplicate rows when the canonical row is missing them.
   - Remove only the redundant shipment rows; shipment rows not linked to an order remain untouched.

2. **Prevent duplicates from returning**
   - Add a database uniqueness rule allowing only one shipment row per linked order.
   - Keep unlinked/manual shipment records supported.

3. **Make status updates deterministic and reliable**
   - Change shipment-stage updates to target the shipment by order, rather than creating another row from stale page state.
   - Use an upsert-style flow so concurrent or repeated clicks cannot create duplicates.
   - Treat the shipment-stage save and matching order-status save as one backend operation, preventing them from drifting apart.
   - Return a clear error instead of showing success when no row was actually changed.

4. **Show the correct customer status**
   - Load only the canonical/current shipment status for each customer order.
   - Keep the seven standard stages and the existing customer category mapping unchanged.
   - Refresh the admin view after a successful change so both screens use the persisted value.

5. **Verify the fix**
   - Test a stage change from the admin order timeline and bulk status control.
   - Confirm the saved database stage and matching order status.
   - Sign in as the affected customer and confirm the new stage and category appear after refresh.
   - Check that repeated updates still leave exactly one shipment row for the order.

## Technical notes

- Add a partial unique index on `shipments(order_id)` where `order_id IS NOT NULL` after deduplication.
- Add a staff-only database function that atomically upserts the shipment stage and synchronizes `orders.status` (`Ordered` → `pending`, `Delivered` → `delivered`, intermediate stages → `processing`).
- Update the admin timeline and bulk action to call that function.
- Add deterministic newest-row handling in customer/admin reads as defense in depth.
