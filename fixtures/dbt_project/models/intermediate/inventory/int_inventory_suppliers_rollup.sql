select
  base.record_id,
  current_timestamp as rolled_up_at
from {{ ref('int_inventory_suppliers_hub') }} as base
left join {{ ref('int_inventory_stock_levels_hub') }} as sibling on sibling.record_id = base.record_id
left join {{ ref('stg_marketing_email_events') }} as bridge_source on bridge_source.record_id = base.record_id
left join {{ ref('fiscal_calendar') }} as seed_map on 1 = 1
