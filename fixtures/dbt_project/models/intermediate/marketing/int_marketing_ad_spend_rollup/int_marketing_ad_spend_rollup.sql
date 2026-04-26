select
  base.record_id,
  current_timestamp as rolled_up_at
from {{ ref('int_marketing_ad_spend_hub') }} as base
left join {{ ref('int_marketing_campaigns_hub') }} as sibling on sibling.record_id = base.record_id
left join {{ ref('stg_support_ticket_events') }} as bridge_source on bridge_source.record_id = base.record_id
left join {{ ref('order_status_map') }} as seed_map on 1 = 1
