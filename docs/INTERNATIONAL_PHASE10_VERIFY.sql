-- Phase 10: security verification. Run in Supabase SQL editor. Every query should return what the comment says.

-- 1) RLS must be ON for all international tables (expect 4 rows, rowsecurity = true)
select tablename, rowsecurity from pg_tables
where schemaname='public' and tablename in ('shipping_zones','intl_countries','product_costs','order_shipments');

-- 2) product_costs must have NO policy and NO anon/authenticated privileges (expect 0 rows for both)
select * from pg_policies where tablename='product_costs';
select grantee, privilege_type from information_schema.role_table_grants
where table_name='product_costs' and grantee in ('anon','authenticated');

-- 3) Restrictive policies on the secret settings keys exist (expect >= 3 rows mentioning the keys)
select policyname, cmd, permissive from pg_policies where tablename='settings' and (qual ilike '%international%' or with_check ilike '%international%');

-- 4) Anon must NOT be able to read international_costs / export_details.
--    Run in a separate session as anon (or via the REST API with the anon key): expect 0 rows.
set local role anon;
select key from settings where key in ('international_costs','export_details');
reset role;

-- 5) No international order may have payment_method other than 'online' (expect 0)
select count(*) from orders where is_international and payment_method <> 'online';

-- 6) International orders must have a positive charged amount and a non-INR currency (expect 0)
select count(*) from orders where is_international and (coalesce(charge_amount_minor,0) <= 0 or charge_currency = 'INR');

-- 7) No international order should carry GST (export under LUT) (expect 0)
select count(*) from orders where is_international and coalesce(gst_amount,0) <> 0;

-- 8) No order paid twice on the same Stripe payment intent (expect 0 rows)
select stripe_payment_intent_id, count(*) from orders where stripe_payment_intent_id is not null
group by 1 having count(*) > 1;
