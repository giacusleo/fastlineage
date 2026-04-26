select
  base.record_id,
  current_timestamp as rolled_up_at
from {{ ref('int_web_conversions_hub') }} as base
left join {{ ref('int_web_experiments_hub') }} as sibling on sibling.record_id = base.record_id
left join {{ ref('stg_loyalty_redemptions') }} as bridge_source on bridge_source.record_id = base.record_id
left join {{ ref('payment_terms') }} as seed_map on 1 = 1
