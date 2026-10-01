// Context sent as `company` in every request. Edit this to describe your own
// product and plans; the lead questions judge deal size and fit against it.
export const company = {
  name: "Lumen Metrics",
  product:
    "Hosted product analytics for web and mobile apps: event tracking, funnels, retention cohorts, dashboards, and a SQL explorer. Integrates with Segment, Snowflake, and BigQuery. Does not do ad attribution, CRM, or session video replay.",
  plans: {
    Starter: "$49/month, up to 3 seats and 1 million events per month.",
    Team: "$499/month, up to 25 seats and 50 million events per month.",
    Enterprise: "From $25,000/year: unlimited seats, SSO, audit logs, a data residency choice, and a dedicated support manager.",
  },
} as const;
