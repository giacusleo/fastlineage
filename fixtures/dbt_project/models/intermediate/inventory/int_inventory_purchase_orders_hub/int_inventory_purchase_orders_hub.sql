select
  base.record_id,
  base.source_system,
  base.entity_name,
  current_timestamp as transformed_at
from {{ ref('stg_inventory_purchase_orders') }} as base
left join {{ ref('stg_inventory_products') }} as source_anchor on source_anchor.record_id = base.record_id
left join {{ ref('discount_bands') }} as seed_map on 1 = 1
