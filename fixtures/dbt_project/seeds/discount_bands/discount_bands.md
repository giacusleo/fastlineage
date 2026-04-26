{% docs discount_bands__description %}
Seed lookup table for the discount domain; it provides compact reference data for joins and labeling.
{% enddocs %}

{% docs discount_bands__record_id %}
Primary grain identifier for the seed discount asset.
{% enddocs %}

{% docs discount_bands__lookup_code %}
Normalized code used to map raw values to business categories.
{% enddocs %}

{% docs discount_bands__display_name %}
Human-readable label exposed to analysts and downstream marts.
{% enddocs %}

{% docs discount_bands__semantic_group %}
Grouping label that clusters related values for consistent semantics.
{% enddocs %}

{% docs discount_bands__is_active %}
Flag that indicates whether the row is currently active.
{% enddocs %}
