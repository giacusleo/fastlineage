select
  base.record_id,
  base.source_system,
  base.entity_name,
  current_timestamp as transformed_at
from {{ ref('stg_fulfillment_warehouses') }} as base
left join {{ ref('stg_fulfillment_shipments') }} as source_anchor on source_anchor.record_id = base.record_id
left join {{ ref('country_codes') }} as seed_map on 1 = 1
