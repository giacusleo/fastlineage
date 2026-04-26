select
  'fct_marketing_spend' as relation_name,
  'fact' as relation_layer,
  base.record_id,
  current_timestamp as modeled_at
from {{ ref('int_marketing_ad_spend_rollup') }} as base
left join {{ ref('int_marketing_campaigns_rollup') }} as rel_1 on rel_1.record_id = base.record_id
left join {{ ref('dim_campaign') }} as rel_2 on rel_2.record_id = base.record_id
left join {{ ref('marketing_channels') }} as rel_3 on rel_3.record_id = base.record_id
left join {{ ref('currency_rates') }} as rel_4 on rel_4.record_id = base.record_id
