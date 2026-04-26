select
  base.record_id,
  current_timestamp as rolled_up_at
from {{ ref('int_marketing_email_events_hub') }} as base
left join {{ ref('int_marketing_leads_hub') }} as sibling on sibling.record_id = base.record_id
left join {{ ref('stg_support_agents') }} as bridge_source on bridge_source.record_id = base.record_id
left join {{ ref('region_targets') }} as seed_map on 1 = 1
