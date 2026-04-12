-- Klaviyo integration removed. Email revenue attribution now comes from
-- Shopify Analytics (referring_channel = 'Email') via ShopifyQL.
-- SMS revenue cannot be reliably attributed without Klaviyo, but email
-- alone is sufficient for CFO-level retention health monitoring.

DROP POLICY IF EXISTS fin_klaviyo_daily_service_role_all ON fin_klaviyo_daily;
DROP TABLE IF EXISTS fin_klaviyo_daily;
