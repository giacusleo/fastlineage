select
  base.record_id,
  current_timestamp as rolled_up_at
from {{ ref('int_support_tickets_hub') }} as base
left join {{ ref('int_support_macros_hub') }} as sibling on sibling.record_id = base.record_id
left join {{ ref('stg_web_pageviews') }} as bridge_source on bridge_source.record_id = base.record_id
left join {{ ref('loyalty_thresholds') }} as seed_map on 1 = 1
