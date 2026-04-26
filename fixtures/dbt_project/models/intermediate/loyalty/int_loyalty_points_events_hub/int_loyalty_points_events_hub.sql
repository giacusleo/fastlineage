select
  base.record_id,
  base.source_system,
  base.entity_name,
  current_timestamp as transformed_at
from {{ ref('stg_loyalty_points_events') }} as base
left join {{ ref('stg_loyalty_members') }} as source_anchor on source_anchor.record_id = base.record_id
left join {{ ref('country_codes') }} as seed_map on 1 = 1
