select
  'dim_subscription' as relation_name,
  'dimension' as relation_layer,
  base.record_id,
  current_timestamp as modeled_at
from {{ ref('int_billing_subscriptions_rollup') }} as base
left join {{ ref('subscription_state_snapshot') }} as rel_1 on rel_1.record_id = base.record_id
left join {{ ref('payment_terms') }} as rel_2 on rel_2.record_id = base.record_id
left join {{ ref('discount_bands') }} as rel_3 on rel_3.record_id = base.record_id
