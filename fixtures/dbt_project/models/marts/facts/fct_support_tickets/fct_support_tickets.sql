select
  'fct_support_tickets' as relation_name,
  'fact' as relation_layer,
  base.record_id,
  current_timestamp as modeled_at
from {{ ref('int_support_tickets_rollup') }} as base
left join {{ ref('int_support_ticket_events_rollup') }} as rel_1 on rel_1.record_id = base.record_id
left join {{ ref('dim_support_agent') }} as rel_2 on rel_2.record_id = base.record_id
left join {{ ref('support_tiers') }} as rel_3 on rel_3.record_id = base.record_id
left join {{ ref('dim_customer') }} as rel_4 on rel_4.record_id = base.record_id
