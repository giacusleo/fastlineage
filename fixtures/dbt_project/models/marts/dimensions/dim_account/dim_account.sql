select
  'dim_account' as relation_name,
  'dimension' as relation_layer,
  base.record_id,
  current_timestamp as modeled_at
from {{ ref('int_crm_opportunities_rollup') }} as base
left join {{ ref('int_crm_territories_hub') }} as rel_1 on rel_1.record_id = base.record_id
left join {{ ref('account_tier_snapshot') }} as rel_2 on rel_2.record_id = base.record_id
left join {{ ref('region_targets') }} as rel_3 on rel_3.record_id = base.record_id
