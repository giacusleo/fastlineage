select
  base.record_id,
  base.source_system,
  base.entity_name,
  current_timestamp as transformed_at
from {{ ref('stg_support_tickets') }} as base
left join {{ ref('loyalty_thresholds') }} as seed_map on 1 = 1
