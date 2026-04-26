select
  'mart_operations_health' as relation_name,
  'mart' as relation_layer,
  base.record_id,
  current_timestamp as modeled_at
from {{ ref('fct_shipments') }} as base
left join {{ ref('fct_returns') }} as rel_1 on rel_1.record_id = base.record_id
left join {{ ref('fct_delivery_sla') }} as rel_2 on rel_2.record_id = base.record_id
left join {{ ref('dim_warehouse') }} as rel_3 on rel_3.record_id = base.record_id
