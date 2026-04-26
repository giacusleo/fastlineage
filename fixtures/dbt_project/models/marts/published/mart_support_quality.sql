select
  'mart_support_quality' as relation_name,
  'mart' as relation_layer,
  base.record_id,
  current_timestamp as modeled_at
from {{ ref('fct_support_tickets') }} as base
left join {{ ref('dim_support_agent') }} as rel_1 on rel_1.record_id = base.record_id
left join {{ ref('dim_customer') }} as rel_2 on rel_2.record_id = base.record_id
left join {{ ref('customer_status_snapshot') }} as rel_3 on rel_3.record_id = base.record_id
