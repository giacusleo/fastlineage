select
  base.record_id,
  base.source_system,
  base.entity_name,
  current_timestamp as transformed_at
from {{ ref('stg_billing_subscriptions') }} as base
left join {{ ref('stg_billing_invoices') }} as source_anchor on source_anchor.record_id = base.record_id
left join {{ ref('order_status_map') }} as seed_map on 1 = 1
