{% docs stg_billing_invoice_lines__description %}
Staging model for the billing domain; it standardizes raw inputs before downstream transformation.
{% enddocs %}

{% docs stg_billing_invoice_lines__record_id %}
Primary grain identifier for the staging billing asset.
{% enddocs %}

{% docs stg_billing_invoice_lines__loaded_at %}
Timestamp captured when the staging row was loaded from source systems.
{% enddocs %}

{% docs stg_billing_invoice_lines__source_system %}
Source system or landing domain associated with the row.
{% enddocs %}

{% docs stg_billing_invoice_lines__entity_name %}
Business entity label used to identify the modeled object.
{% enddocs %}

{% docs stg_billing_invoice_lines__modeled_at %}
Timestamp when the model row was produced.
{% enddocs %}
