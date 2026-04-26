{% docs stg_crm_contacts__description %}
Staging model for the crm domain; it standardizes raw inputs before downstream transformation.
{% enddocs %}

{% docs stg_crm_contacts__record_id %}
Primary grain identifier for the staging crm asset.
{% enddocs %}

{% docs stg_crm_contacts__loaded_at %}
Timestamp captured when the staging row was loaded from source systems.
{% enddocs %}

{% docs stg_crm_contacts__source_system %}
Source system or landing domain associated with the row.
{% enddocs %}

{% docs stg_crm_contacts__entity_name %}
Business entity label used to identify the modeled object.
{% enddocs %}

{% docs stg_crm_contacts__modeled_at %}
Timestamp when the model row was produced.
{% enddocs %}
