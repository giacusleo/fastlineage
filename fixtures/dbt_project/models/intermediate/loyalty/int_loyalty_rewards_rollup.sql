select
  base.record_id,
  current_timestamp as rolled_up_at
from {{ ref('int_loyalty_rewards_hub') }} as base
left join {{ ref('int_loyalty_members_hub') }} as sibling on sibling.record_id = base.record_id
left join {{ ref('stg_app_sessions') }} as bridge_source on bridge_source.record_id = base.record_id
left join {{ ref('warehouse_capacity') }} as seed_map on 1 = 1
