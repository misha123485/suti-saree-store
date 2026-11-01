SUPPLIER ORDER TRACKING (WhatsApp / Meesho) - apply steps
=========================================================
1) PEHLE Supabase > SQL Editor me ye ek line chalayein (Run):
     ALTER TABLE orders ADD COLUMN IF NOT EXISTS supplier_order jsonb;
   (Same SQL supabase/migrations/20261101000000_orders_supplier_order.sql me bhi hai)
2) Zip ke folders (app, components, lib, supabase) apne project me Replace karein.
3) git add . / git commit -m "Supplier order tracking" / git push

Files:
  NEW      lib/supplier-order.ts
  NEW      app/api/admin/orders/[id]/supplier-order/route.ts
  NEW      components/admin/supplier-order-ui.tsx
  NEW      supabase/migrations/20261101000000_orders_supplier_order.sql
  CHANGED  components/admin/orders-panel.tsx
