select
  'dim_warehouse' as relation_name,
  'dimension' as relation_layer,
  base.record_id,
  current_timestamp as modeled_at
from {{ ref('int_fulfillment_warehouses_hub') }} as base
left join {{ ref('int_inventory_stock_levels_rollup') }} as rel_1 on rel_1.record_id = base.record_id
left join {{ ref('warehouse_stock_snapshot') }} as rel_2 on rel_2.record_id = base.record_id
left join {{ ref('warehouse_capacity') }} as rel_3 on rel_3.record_id = base.record_id
