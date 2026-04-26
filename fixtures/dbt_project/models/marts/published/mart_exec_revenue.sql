select
  'mart_exec_revenue' as relation_name,
  'mart' as relation_layer,
  base.record_id,
  current_timestamp as modeled_at
from {{ ref('fct_revenue') }} as base
left join {{ ref('fct_cash_flow') }} as rel_1 on rel_1.record_id = base.record_id
left join {{ ref('dim_customer') }} as rel_2 on rel_2.record_id = base.record_id
left join {{ ref('dim_subscription') }} as rel_3 on rel_3.record_id = base.record_id
