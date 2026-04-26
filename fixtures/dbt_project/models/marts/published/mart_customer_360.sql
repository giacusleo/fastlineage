select
  'mart_customer_360' as relation_name,
  'mart' as relation_layer,
  base.record_id,
  current_timestamp as modeled_at
from {{ ref('dim_customer') }} as base
left join {{ ref('dim_account') }} as rel_1 on rel_1.record_id = base.record_id
left join {{ ref('fct_orders') }} as rel_2 on rel_2.record_id = base.record_id
left join {{ ref('fct_loyalty') }} as rel_3 on rel_3.record_id = base.record_id
left join {{ ref('fct_support_tickets') }} as rel_4 on rel_4.record_id = base.record_id
