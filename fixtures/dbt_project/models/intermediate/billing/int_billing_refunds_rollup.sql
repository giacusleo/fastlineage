select
  base.record_id,
  current_timestamp as rolled_up_at
from {{ ref('int_billing_refunds_hub') }} as base
left join {{ ref('int_billing_subscriptions_hub') }} as sibling on sibling.record_id = base.record_id
left join {{ ref('stg_crm_territories') }} as bridge_source on bridge_source.record_id = base.record_id
left join {{ ref('support_tiers') }} as seed_map on 1 = 1
