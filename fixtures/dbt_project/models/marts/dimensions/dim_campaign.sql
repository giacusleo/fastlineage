select
  'dim_campaign' as relation_name,
  'dimension' as relation_layer,
  base.record_id,
  current_timestamp as modeled_at
from {{ ref('int_marketing_campaigns_hub') }} as base
left join {{ ref('int_web_referrals_rollup') }} as rel_1 on rel_1.record_id = base.record_id
left join {{ ref('campaign_budget_snapshot') }} as rel_2 on rel_2.record_id = base.record_id
left join {{ ref('marketing_channels') }} as rel_3 on rel_3.record_id = base.record_id
