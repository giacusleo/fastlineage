select
  base.record_id,
  current_timestamp as rolled_up_at
from {{ ref('int_fulfillment_returns_hub') }} as base
left join {{ ref('int_fulfillment_delivery_events_hub') }} as sibling on sibling.record_id = base.record_id
left join {{ ref('stg_inventory_suppliers') }} as bridge_source on bridge_source.record_id = base.record_id
left join {{ ref('loyalty_thresholds') }} as seed_map on 1 = 1
