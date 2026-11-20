# Mapping spec: partner policy files to the target schema

| Target column | Partner A column | Partner B column | Rule |
|---|---|---|---|
| policy_id | ref | PolicyNumber | Required. Must be unique in the file, the second occurrence is rejected. |
| customer_email | mail | Email | Required. Must look like an email. Stored in lower case. |
| product | offer | Product | Copied as received. |
| start_date | start (DD/MM/YYYY) | StartDate (YYYY-MM-DD) | Required. Converted to ISO date. Impossible dates such as 31/02 are rejected. |
| premium_eur | price (comma decimals) | AnnualPremium (dot decimals) | Required. Converted to a number, must be greater than 0. |
| partner | added by the workflow | added by the workflow | A or B, set in the "Tag partner" node. |

File format differences handled by the flow:

| | Partner A | Partner B |
|---|---|---|
| Separator | ; | , |
| Date format | 31/12/2026 | 2026-12-31 |
| Decimal | 12,50 | 12.50 |

Adding a partner C means: one new read, extract and tag branch in n8n, and one new entry in `MAPPINGS` in `scripts/transform.js`. The validation rules and the database load stay the same.
