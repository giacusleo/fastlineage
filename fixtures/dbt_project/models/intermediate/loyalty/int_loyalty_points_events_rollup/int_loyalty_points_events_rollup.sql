select
  base.record_id,
  current_timestamp as rolled_up_at
from {{ ref('int_loyalty_points_events_hub') }} as base
left join {{ ref('int_loyalty_redemptions_hub') }} as sibling on sibling.record_id = base.record_id
left join {{ ref('stg_app_feature_flags') }} as bridge_source on bridge_source.record_id = base.record_id
left join {{ ref('country_codes') }} as seed_map on 1 = 1
