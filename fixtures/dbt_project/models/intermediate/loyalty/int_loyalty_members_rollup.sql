select
  base.record_id,
  current_timestamp as rolled_up_at
from {{ ref('int_loyalty_members_hub') }} as base
left join {{ ref('int_loyalty_tiers_hub') }} as sibling on sibling.record_id = base.record_id
left join {{ ref('stg_app_users') }} as bridge_source on bridge_source.record_id = base.record_id
left join {{ ref('region_targets') }} as seed_map on 1 = 1
