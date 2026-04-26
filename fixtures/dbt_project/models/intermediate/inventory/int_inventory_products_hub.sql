select
  base.record_id,
  base.source_system,
  base.entity_name,
  current_timestamp as transformed_at
from {{ ref('stg_inventory_products') }} as base
left join {{ ref('currency_rates') }} as seed_map on 1 = 1
