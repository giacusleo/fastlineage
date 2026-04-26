select
  base.record_id,
  current_timestamp as rolled_up_at
from {{ ref('int_fulfillment_warehouses_hub') }} as base
left join {{ ref('int_fulfillment_returns_hub') }} as sibling on sibling.record_id = base.record_id
left join {{ ref('stg_inventory_purchase_orders') }} as bridge_source on bridge_source.record_id = base.record_id
left join {{ ref('country_codes') }} as seed_map on 1 = 1
