select
  base.record_id,
  current_timestamp as rolled_up_at
from {{ ref('int_crm_opportunities_hub') }} as base
left join {{ ref('int_crm_contacts_hub') }} as sibling on sibling.record_id = base.record_id
left join {{ ref('stg_finance_tax_rates') }} as bridge_source on bridge_source.record_id = base.record_id
left join {{ ref('country_codes') }} as seed_map on 1 = 1
