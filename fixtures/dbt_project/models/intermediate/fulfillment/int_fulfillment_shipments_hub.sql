select
  base.record_id,
  base.source_system,
  base.entity_name,
  current_timestamp as transformed_at
from {{ ref('stg_fulfillment_shipments') }} as base
left join {{ ref('support_tiers') }} as seed_map on 1 = 1
