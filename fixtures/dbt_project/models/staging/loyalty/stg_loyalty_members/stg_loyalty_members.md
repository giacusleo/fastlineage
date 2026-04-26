{% docs stg_loyalty_members__description %}
Staging model for the loyalty domain; it standardizes raw inputs before downstream transformation.
{% enddocs %}

{% docs stg_loyalty_members__record_id %}
Primary grain identifier for the staging loyalty asset.
{% enddocs %}

{% docs stg_loyalty_members__loaded_at %}
Timestamp captured when the staging row was loaded from source systems.
{% enddocs %}

{% docs stg_loyalty_members__source_system %}
Source system or landing domain associated with the row.
{% enddocs %}

{% docs stg_loyalty_members__entity_name %}
Business entity label used to identify the modeled object.
{% enddocs %}

{% docs stg_loyalty_members__modeled_at %}
Timestamp when the model row was produced.
{% enddocs %}
