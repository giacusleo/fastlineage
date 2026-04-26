select
  base.record_id,
  current_timestamp as rolled_up_at
from {{ ref('int_billing_subscriptions_hub') }} as base
left join {{ ref('int_billing_invoice_lines_hub') }} as sibling on sibling.record_id = base.record_id
left join {{ ref('stg_crm_opportunities') }} as bridge_source on bridge_source.record_id = base.record_id
left join {{ ref('order_status_map') }} as seed_map on 1 = 1
