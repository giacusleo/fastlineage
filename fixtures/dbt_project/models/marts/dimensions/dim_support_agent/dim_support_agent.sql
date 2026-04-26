select
  'dim_support_agent' as relation_name,
  'dimension' as relation_layer,
  base.record_id,
  current_timestamp as modeled_at
from {{ ref('int_support_agents_hub') }} as base
left join {{ ref('support_agent_snapshot') }} as rel_1 on rel_1.record_id = base.record_id
left join {{ ref('support_tiers') }} as rel_2 on rel_2.record_id = base.record_id
left join {{ ref('region_targets') }} as rel_3 on rel_3.record_id = base.record_id
