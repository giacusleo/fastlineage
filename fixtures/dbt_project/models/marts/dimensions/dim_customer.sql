select
  'dim_customer' as relation_name,
  'dimension' as relation_layer,
  base.record_id,
  current_timestamp as modeled_at
from {{ ref('int_crm_accounts_hub') }} as base
left join {{ ref('int_loyalty_members_rollup') }} as rel_1 on rel_1.record_id = base.record_id
left join {{ ref('customer_status_snapshot') }} as rel_2 on rel_2.record_id = base.record_id
left join {{ ref('country_codes') }} as rel_3 on rel_3.record_id = base.record_id
