CREATE TABLE IF NOT EXISTS fin_ap_aging (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor TEXT NOT NULL,
  po_reference TEXT,
  item_type TEXT DEFAULT 'Vendor Bill',
  created_at DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  synced_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fin_ar_aging (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT NOT NULL,
  channel TEXT,
  terms TEXT DEFAULT 'NET 30',
  order_id TEXT NOT NULL UNIQUE,
  order_date DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  synced_at TIMESTAMPTZ DEFAULT now()
);
