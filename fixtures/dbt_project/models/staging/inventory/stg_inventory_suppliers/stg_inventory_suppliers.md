{% docs stg_inventory_suppliers__description %}
Staging model for the inventory domain; it standardizes raw inputs before downstream transformation.
{% enddocs %}

{% docs stg_inventory_suppliers__record_id %}
Primary grain identifier for the staging inventory asset.
{% enddocs %}

{% docs stg_inventory_suppliers__loaded_at %}
Timestamp captured when the staging row was loaded from source systems.
{% enddocs %}

{% docs stg_inventory_suppliers__source_system %}
Source system or landing domain associated with the row.
{% enddocs %}

{% docs stg_inventory_suppliers__entity_name %}
Business entity label used to identify the modeled object.
{% enddocs %}

{% docs stg_inventory_suppliers__modeled_at %}
Timestamp when the model row was produced.
{% enddocs %}
