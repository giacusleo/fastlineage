select
  'mart_growth_control_tower' as relation_name,
  'mart' as relation_layer,
  base.record_id,
  current_timestamp as modeled_at
from {{ ref('fct_growth_funnel') }} as base
left join {{ ref('fct_marketing_spend') }} as rel_1 on rel_1.record_id = base.record_id
left join {{ ref('fct_feature_adoption') }} as rel_2 on rel_2.record_id = base.record_id
left join {{ ref('dim_campaign') }} as rel_3 on rel_3.record_id = base.record_id
