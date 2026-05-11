/**
 * Generates Postgres-backed Grafana dashboards (09–13) and rewrites 08-engagement.
 * Run from repo root: node grafana/scripts/build-pg-dashboards.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dashDir = path.join(__dirname, '..', 'dashboards');

const PG = { type: 'postgres', uid: 'grafana_mockcoach_pg' };
const PROM = { type: 'prometheus', uid: 'grafana_prometheus' };
const TD = { type: 'testdata', uid: 'grafana_testdata' };

const baseDash = (title, uid, tags, extra = {}) => ({
  annotations: { list: [] },
  description: extra.description || '',
  editable: true,
  fiscalYearStartMonth: 0,
  graphTooltip: 1,
  id: null,
  links: [],
  liveNow: false,
  meta: { folderName: 'MockCoach' },
  refresh: extra.refresh || '5m',
  schemaVersion: 39,
  style: 'dark',
  tags,
  templating: { list: extra.templating || [] },
  time: extra.time || { from: 'now-30d', to: 'now' },
  timepicker: {},
  timezone: 'browser',
  title,
  uid,
  version: 1,
  ...extra.top,
});

function pgPanel(id, title, description, ptype, gridPos, sql, fmt = 'table', fieldConfig = {}) {
  return {
    id,
    type: ptype,
    title,
    description,
    datasource: PG,
    gridPos,
    fieldConfig: {
      defaults: {
        unit: fieldConfig.unit,
        decimals: fieldConfig.decimals,
        thresholds: fieldConfig.thresholds,
        color: fieldConfig.color,
        custom: fieldConfig.custom,
        min: fieldConfig.min,
        max: fieldConfig.max,
      },
      overrides: fieldConfig.overrides || [],
    },
    options: fieldConfig.options || { showHeader: true, sortBy: [] },
    targets: [
      {
        datasource: PG,
        editorMode: 'code',
        format: fmt,
        rawQuery: true,
        rawSql: sql,
        refId: 'A',
      },
    ],
  };
}

function promPanel(id, title, description, ptype, gridPos, expr, fmt = 'time_series', fieldConfig = {}) {
  return {
    id,
    type: ptype,
    title,
    description,
    datasource: PROM,
    gridPos,
    fieldConfig: {
      defaults: {
        unit: fieldConfig.unit,
        thresholds: fieldConfig.thresholds,
        color: fieldConfig.color,
        custom: fieldConfig.custom,
      },
      overrides: fieldConfig.overrides || [],
    },
    options: fieldConfig.options || { legend: { displayMode: 'list', placement: 'bottom', showLegend: true }, tooltip: { mode: 'single', sort: 'none' } },
    targets: [{ datasource: PROM, editorMode: 'code', expr, format: fmt, instant: !!fieldConfig.instant, legendFormat: fieldConfig.legendFormat || '', refId: 'A' }],
  };
}

function tdPanel(id, title, description, gridPos, alias) {
  return {
    id,
    type: 'timeseries',
    title,
    description,
    datasource: TD,
    gridPos,
    fieldConfig: {
      defaults: {
        color: { mode: 'palette-classic' },
        custom: {
          drawStyle: 'line',
          fillOpacity: 10,
          lineWidth: 1,
          showPoints: 'never',
          stacking: { mode: 'none', group: 'A' },
        },
      },
      overrides: [],
    },
    options: { legend: { displayMode: 'list', placement: 'bottom', showLegend: true }, tooltip: { mode: 'single', sort: 'none' } },
    targets: [{ datasource: TD, refId: 'A', scenarioId: 'random_walk', alias }],
  };
}

const tsFill = {
  color: { mode: 'palette-classic' },
  custom: {
    drawStyle: 'line',
    fillOpacity: 10,
    lineWidth: 1,
    showPoints: 'never',
    stacking: { mode: 'none', group: 'A' },
  },
};

function dash09() {
  const d = baseDash('Active Customers & Platform Health', 'mockcoach-active-customers', ['mockcoach', 'business', 'postgres'], {
    description:
      'SQL on public.users, subscriptions tables, company_subscriptions. Requires **MockCoach Postgres** (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE on Grafana). Datasource uses sslmode **prefer**.',
    time: { from: 'now-90d', to: 'now' },
  });
  d.panels = [
    {
      id: 1,
      type: 'text',
      title: 'Notes',
      gridPos: { h: 3, w: 24, x: 0, y: 0 },
      options: {
        mode: 'markdown',
        content:
          '**Troubleshooting:** If every panel shows errors, open **Connections → Data sources → MockCoach Postgres → Save & test**. Grafana needs **PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE** on this Railway service (copy from your Production Postgres / same as API). Queries use schema **`public.`** explicitly.\n\n**Tables:** `public.users`, `public.user_subscriptions` **or** `public.subscriptions` for billing rows, `public.company_subscriptions`.',
      },
    },
    pgPanel(
      2,
      'Active users (last login ≤ 30d)',
      'Users not deleted with last_login in the last 30 days.',
      'stat',
      { h: 5, w: 6, x: 0, y: 3 },
      `SELECT COUNT(*)::numeric AS value
       FROM public.users
       WHERE deleted_at IS NULL
         AND last_login IS NOT NULL
         AND last_login >= NOW() - INTERVAL '30 days'`,
      'table',
      { options: { reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false }, colorMode: 'value', graphMode: 'none' }, unit: 'short' }
    ),
    pgPanel(
      3,
      'Users with active subscription row',
      'Users with **active** row in `user_subscriptions` or `subscriptions` (MockCoach uses both over time).',
      'stat',
      { h: 5, w: 6, x: 6, y: 3 },
      `SELECT COUNT(DISTINCT u.id)::numeric AS value
       FROM public.users u
       WHERE u.deleted_at IS NULL
         AND (
           EXISTS (
             SELECT 1 FROM public.user_subscriptions us
             WHERE us.user_id = u.id AND LOWER(TRIM(us.status)) = 'active'
           )
           OR EXISTS (
             SELECT 1 FROM public.subscriptions s
             WHERE s.user_id = u.id AND LOWER(TRIM(s.status)) = 'active'
           )
         )`,
      'table',
      { options: { reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false }, colorMode: 'value', graphMode: 'none' }, unit: 'short' }
    ),
    pgPanel(
      4,
      'Company subscriptions (active)',
      'company_subscriptions where status = active.',
      'stat',
      { h: 5, w: 6, x: 12, y: 3 },
      `SELECT COUNT(*)::numeric AS value
       FROM public.company_subscriptions
       WHERE LOWER(TRIM(status)) = 'active'`,
      'table',
      { options: { reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false }, colorMode: 'value', graphMode: 'none' }, unit: 'short' }
    ),
    pgPanel(
      9,
      'Total registered users (not deleted)',
      'COUNT(*) from users.',
      'stat',
      { h: 5, w: 6, x: 18, y: 3 },
      `SELECT COUNT(*)::numeric AS value FROM public.users WHERE deleted_at IS NULL`,
      'table',
      { options: { reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false }, colorMode: 'value', graphMode: 'none' }, unit: 'short' }
    ),
    pgPanel(
      5,
      'Users by plan_tier',
      'Non-deleted users distribution (plan_tier).',
      'piechart',
      { h: 8, w: 12, x: 0, y: 8 },
      `SELECT COALESCE(plan_tier, 'unknown') AS metric, COUNT(*)::float AS value
       FROM public.users
       WHERE deleted_at IS NULL
       GROUP BY plan_tier`,
      'table',
      {
        options: { legend: { displayMode: 'table', placement: 'right', showLegend: true, values: ['value'] }, pieType: 'donut', tooltip: { mode: 'single', sort: 'none' } },
      }
    ),
    pgPanel(
      6,
      'Company plans (plan_type)',
      'Active company_subscriptions by plan_type.',
      'barchart',
      { h: 8, w: 12, x: 12, y: 8 },
      `SELECT plan_type AS metric, COUNT(*)::float AS value
       FROM public.company_subscriptions
       WHERE LOWER(status) = 'active'
       GROUP BY plan_type`,
      'table',
      { options: { orientation: 'horizontal', showValue: 'auto', stacking: 'none', xTickLabelRotation: 0 } }
    ),
    pgPanel(
      7,
      'Daily active users (by last_login day)',
      'Count of users with last_login on each calendar day.',
      'timeseries',
      { h: 9, w: 24, x: 0, y: 16 },
      `SELECT
         date_trunc('day', last_login)::timestamp AS time,
         COUNT(*) AS value
       FROM public.users
       WHERE deleted_at IS NULL
         AND last_login IS NOT NULL
         AND $__timeFilter(last_login)
       GROUP BY 1
       ORDER BY 1`,
      'time_series',
      { custom: tsFill, options: { legend: { displayMode: 'list', placement: 'bottom', showLegend: true }, tooltip: { mode: 'single', sort: 'none' } } }
    ),
    pgPanel(
      8,
      'Recent users sample',
      'Latest non-deleted users with key billing fields.',
      'table',
      { h: 10, w: 24, x: 0, y: 25 },
      `SELECT id, email, created_at, last_login, subscription_status, subscription_type, plan_tier, is_verified
       FROM public.users
       WHERE deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT 100`,
      'table',
      { options: { showHeader: true, sortBy: [] } }
    ),
  ];
  return d;
}

function dash10() {
  const budgetVar = {
    name: 'monthly_budget',
    label: 'Monthly Budget (USD)',
    type: 'textbox',
    current: { selected: true, text: '500', value: '500' },
    hide: 0,
    options: [
      { selected: true, text: '500', value: '500' },
      { selected: false, text: '1000', value: '1000' },
    ],
  };
  const d = baseDash('OpenAI Cost Analysis', 'mockcoach-openai-cost', ['mockcoach', 'business', 'postgres'], {
    description:
      'Uses **ai_usage_log.cost_estimate_usd** (column **model_used**). Resume uploads: **resume_ai_usage**. Voice: **voice_coach_usage**. Budget % uses calendar-month sum vs **monthly_budget** variable.',
    templating: { list: [budgetVar] },
    time: { from: 'now-90d', to: 'now' },
  });
  d.panels = [
    {
      id: 1,
      type: 'text',
      title: 'Pricing reference',
      gridPos: { h: 2, w: 24, x: 0, y: 0 },
      options: {
        mode: 'markdown',
        content:
          'Spend is read from **cost_estimate_usd**. Legacy token rates (gpt-4o / gpt-4o-mini) are not recomputed here. Rewards constants for referrals elsewhere: REFERRER_XP=200, REFERRED_XP=100, REFERRER_BONUS_REQUESTS=2, REFERRED_PREMIUM_DAYS (configure in product).',
      },
    },
    pgPanel(
      2,
      'Cumulative AI spend (all time)',
      'SUM(cost_estimate_usd) from ai_usage_log.',
      'stat',
      { h: 5, w: 8, x: 0, y: 2 },
      `SELECT COALESCE(SUM(cost_estimate_usd), 0)::numeric AS value FROM public.ai_usage_log`,
      'table',
      { unit: 'currencyUSD', options: { reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false }, colorMode: 'value', graphMode: 'none' } }
    ),
    pgPanel(
      3,
      'AI cost per distinct user (all time)',
      'SUM(cost) / COUNT(DISTINCT user_id) — users with NULL user_id excluded from denominator adjustment via NULLIF.',
      'stat',
      { h: 5, w: 8, x: 8, y: 2 },
      `SELECT
         CASE WHEN COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) = 0 THEN 0
         ELSE COALESCE(SUM(cost_estimate_usd),0) / COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL)
         END::numeric AS value
       FROM public.ai_usage_log`,
      'table',
      { unit: 'currencyUSD', options: { reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false }, colorMode: 'value', graphMode: 'none' } }
    ),
    pgPanel(
      4,
      '% of monthly budget used (current month)',
      'Month-to-date SUM(cost_estimate_usd) / **monthly_budget** textbox (default 500).',
      'gauge',
      { h: 5, w: 8, x: 16, y: 2 },
      `SELECT LEAST(100, ROUND(100.0 * COALESCE(SUM(cost_estimate_usd),0) / NULLIF(CAST('\${monthly_budget}' AS NUMERIC), 0), 2))::numeric AS value
       FROM public.ai_usage_log
       WHERE created_at >= date_trunc('month', NOW())
         AND created_at < date_trunc('month', NOW()) + INTERVAL '1 month'`,
      'table',
      {
        unit: 'percent',
        min: 0,
        max: 100,
        thresholds: {
          mode: 'absolute',
          steps: [
            { color: 'green', value: null },
            { color: 'yellow', value: 70 },
            { color: 'red', value: 90 },
          ],
        },
        options: { showThresholdLabels: true, showThresholdMarkers: true, reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false } },
      }
    ),
    pgPanel(
      5,
      'Daily AI spend (USD)',
      'Grouped sum of cost_estimate_usd.',
      'timeseries',
      { h: 8, w: 12, x: 0, y: 7 },
      `SELECT date_trunc('day', created_at)::timestamp AS time,
              SUM(cost_estimate_usd)::double precision AS value
       FROM public.ai_usage_log
       WHERE $__timeFilter(created_at)
       GROUP BY 1 ORDER BY 1`,
      'time_series',
      { custom: tsFill, options: { legend: { displayMode: 'list', placement: 'bottom', showLegend: true }, tooltip: { mode: 'single', sort: 'none' } } }
    ),
    pgPanel(
      6,
      'Spend by model_used (pie)',
      'Share of estimated cost by model_used.',
      'piechart',
      { h: 8, w: 12, x: 12, y: 7 },
      `SELECT COALESCE(model_used, 'unknown') AS metric,
              SUM(cost_estimate_usd)::float AS value
       FROM public.ai_usage_log
       WHERE $__timeFilter(created_at)
       GROUP BY 1`,
      'table',
      { options: { legend: { displayMode: 'table', placement: 'right', showLegend: true, values: ['value'] }, pieType: 'donut', tooltip: { mode: 'single', sort: 'none' } } }
    ),
    pgPanel(
      7,
      'Resume AI uploads by month (resume_ai_usage)',
      'Sum of ai_resume_uploads grouped by month_year.',
      'barchart',
      { h: 8, w: 12, x: 0, y: 15 },
      `SELECT month_year AS metric,
              SUM(ai_resume_uploads)::float AS value
       FROM public.resume_ai_usage
       GROUP BY month_year
       ORDER BY month_year DESC
       LIMIT 24`,
      'table',
      { options: { orientation: 'horizontal', showValue: 'auto', stacking: 'none', xTickLabelRotation: 0 } }
    ),
    pgPanel(
      8,
      'Voice Coach sessions per day',
      'COUNT from voice_coach_usage.',
      'timeseries',
      { h: 8, w: 12, x: 12, y: 15 },
      `SELECT date_trunc('day', created_at)::timestamp AS time,
              COUNT(*)::double precision AS value
       FROM public.voice_coach_usage
       WHERE $__timeFilter(created_at)
       GROUP BY 1 ORDER BY 1`,
      'time_series',
      { custom: { ...tsFill, drawStyle: 'bars', fillOpacity: 30 }, options: { legend: { displayMode: 'list', placement: 'bottom', showLegend: true }, tooltip: { mode: 'single', sort: 'none' } } }
    ),
    pgPanel(
      9,
      'Voice Coach sessions: hour × weekday (UTC)',
      'Matrix for peak analysis (0=Sunday). Color in table; upgrade to heatmap panel + transform if desired.',
      'table',
      { h: 10, w: 24, x: 0, y: 23 },
      `SELECT
         EXTRACT(DOW FROM created_at AT TIME ZONE 'UTC')::int AS dow_utc,
         EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC')::int AS hour_utc,
         COUNT(*)::int AS sessions
       FROM public.voice_coach_usage
       WHERE $__timeFilter(created_at)
       GROUP BY 1, 2
       ORDER BY 1, 2`,
      'table',
      { options: { showHeader: true, sortBy: [{ displayName: 'sessions', desc: true }] } }
    ),
  ];
  return d;
}

function dash11() {
  const d = baseDash('ATS Public Apply & Hiring Funnel', 'mockcoach-ats-hiring-funnel', ['mockcoach', 'business', 'postgres'], {
    description:
      '**job_applications** statuses in schema: applied, reviewed, shortlisted, interviewing, offered, rejected, withdrawn. **candidate_id** is NOT NULL in baseline; guest apply may use placeholder user — adjust SQL if you add nullable guest keys. **Public apply** path `/apply/:jobId` is frontend routing.',
    time: { from: 'now-180d', to: 'now' },
  });
  d.panels = [
    {
      id: 1,
      type: 'text',
      gridPos: { h: 3, w: 24, x: 0, y: 0 },
      title: 'Funnel mapping',
      options: {
        mode: 'markdown',
        content:
          'Funnel uses actual DB statuses: **applied** (entry) → reviewed → shortlisted → interviewing → offered → **rejected** / withdrawn. There is no **hired** status in `job_applications` CHECK constraint — add a panel to **job_postings** or HR table when available.',
      },
    },
    pgPanel(
      2,
      'Applications: guest vs registered (schema-aware)',
      'If candidate_id becomes nullable, guest rows appear in guest_count.',
      'barchart',
      { h: 7, w: 16, x: 0, y: 3 },
      `SELECT
         CASE WHEN candidate_id IS NULL THEN 'guest' ELSE 'registered' END AS metric,
         COUNT(*)::float AS value
       FROM public.job_applications
       WHERE $__timeFilter(created_at)
       GROUP BY 1`,
      'table',
      { options: { orientation: 'horizontal', showValue: 'auto', stacking: 'none', xTickLabelRotation: 0 } }
    ),
    pgPanel(
      3,
      'Open job postings (active)',
      'job_postings with status = active.',
      'stat',
      { h: 7, w: 8, x: 16, y: 3 },
      `SELECT COUNT(*)::numeric AS value FROM public.job_postings WHERE LOWER(status) = 'active'`,
      'table',
      { options: { reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false }, colorMode: 'value', graphMode: 'none' } }
    ),
    pgPanel(
      4,
      'Applications per week',
      'Volume trend.',
      'timeseries',
      { h: 8, w: 24, x: 0, y: 10 },
      `SELECT date_trunc('week', created_at)::timestamp AS time,
              COUNT(*)::double precision AS value
       FROM public.job_applications
       WHERE $__timeFilter(created_at)
       GROUP BY 1 ORDER BY 1`,
      'time_series',
      { custom: tsFill, options: { legend: { displayMode: 'list', placement: 'bottom', showLegend: true }, tooltip: { mode: 'single', sort: 'none' } } }
    ),
    pgPanel(
      5,
      'Funnel counts by status',
      'Single snapshot in selected range.',
      'barchart',
      { h: 8, w: 12, x: 0, y: 18 },
      `SELECT status AS metric, COUNT(*)::float AS value
       FROM public.job_applications
       WHERE $__timeFilter(created_at)
       GROUP BY status
       ORDER BY value DESC`,
      'table',
      { options: { orientation: 'horizontal', showValue: 'auto', stacking: 'none', xTickLabelRotation: 0 } }
    ),
    pgPanel(
      6,
      'Top jobs by application volume',
      'Join to job_postings title.',
      'table',
      { h: 8, w: 12, x: 12, y: 18 },
      `SELECT jp.title, jp.id::text AS job_id, COUNT(ja.id) AS applications
       FROM public.job_applications ja
       JOIN public.job_postings jp ON jp.id = ja.job_id
       WHERE $__timeFilter(ja.created_at)
       GROUP BY jp.id, jp.title
       ORDER BY applications DESC
       LIMIT 25`,
      'table',
      { options: { showHeader: true, sortBy: [] } }
    ),
  ];
  return d;
}

function dash12() {
  const d = baseDash('User Signups & Registration Analytics', 'mockcoach-user-signups', ['mockcoach', 'business', 'postgres'], {
    description: '**users** table analytics. Weekly cohort uses last_login vs signup week.',
    time: { from: 'now-90d', to: 'now' },
  });
  d.panels = [
    pgPanel(
      1,
      'Total users (all time, not deleted)',
      'COUNT(*) WHERE deleted_at IS NULL.',
      'stat',
      { h: 5, w: 8, x: 0, y: 0 },
      `SELECT COUNT(*)::numeric AS value FROM public.users WHERE deleted_at IS NULL`,
      'table',
      { unit: 'short', options: { reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false }, colorMode: 'value', graphMode: 'none' } }
    ),
    pgPanel(
      2,
      'Verified vs unverified',
      'Gauge value = % verified among non-deleted users.',
      'gauge',
      { h: 5, w: 8, x: 8, y: 0 },
      `SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE is_verified) / NULLIF(COUNT(*), 0), 2)::numeric AS value
       FROM public.users WHERE deleted_at IS NULL`,
      'table',
      {
        unit: 'percent',
        min: 0,
        max: 100,
        thresholds: {
          mode: 'absolute',
          steps: [
            { color: 'red', value: null },
            { color: 'yellow', value: 50 },
            { color: 'green', value: 85 },
          ],
        },
        options: { showThresholdMarkers: true, reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false } },
      }
    ),
    pgPanel(
      3,
      'Unverified users stuck >48h (alert)',
      'Created >48h ago, still not verified, not deleted. Red threshold on stat if >50 (set threshold in panel).',
      'stat',
      { h: 5, w: 8, x: 16, y: 0 },
      `SELECT COUNT(*)::numeric AS value
       FROM public.users
       WHERE deleted_at IS NULL
         AND is_verified = false
         AND created_at < NOW() - INTERVAL '48 hours'`,
      'table',
      {
        unit: 'short',
        thresholds: {
          mode: 'absolute',
          steps: [
            { color: 'green', value: null },
            { color: 'yellow', value: 25 },
            { color: 'red', value: 50 },
          ],
        },
        color: { mode: 'thresholds' },
        options: { reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false }, colorMode: 'background', graphMode: 'none' },
      }
    ),
    pgPanel(
      4,
      'Daily signups (90d window)',
      'Uses $__timeFilter on created_at.',
      'timeseries',
      { h: 9, w: 16, x: 0, y: 5 },
      `SELECT date_trunc('day', created_at)::timestamp AS time,
              COUNT(*)::double precision AS value
       FROM public.users
       WHERE deleted_at IS NULL AND $__timeFilter(created_at)
       GROUP BY 1 ORDER BY 1`,
      'time_series',
      { custom: { ...tsFill, drawStyle: 'bars', fillOpacity: 25 }, options: { legend: { displayMode: 'list', placement: 'bottom', showLegend: true }, tooltip: { mode: 'single', sort: 'none' } } }
    ),
    pgPanel(
      5,
      'Signup source (auth_provider)',
      'Pie of non-deleted users created in range.',
      'piechart',
      { h: 9, w: 8, x: 16, y: 5 },
      `SELECT COALESCE(auth_provider, 'unknown') AS metric, COUNT(*)::float AS value
       FROM public.users
       WHERE deleted_at IS NULL AND $__timeFilter(created_at)
       GROUP BY 1`,
      'table',
      { options: { legend: { displayMode: 'table', placement: 'right', showLegend: true, values: ['value'] }, pieType: 'pie', tooltip: { mode: 'single', sort: 'none' } } }
    ),
    pgPanel(
      6,
      'Deleted accounts over time',
      'Count by day where deleted_at set.',
      'timeseries',
      { h: 8, w: 12, x: 0, y: 14 },
      `SELECT date_trunc('day', deleted_at)::timestamp AS time,
              COUNT(*)::double precision AS value
       FROM public.users
       WHERE deleted_at IS NOT NULL AND $__timeFilter(deleted_at)
       GROUP BY 1 ORDER BY 1`,
      'time_series',
      { custom: tsFill, options: { legend: { displayMode: 'list', placement: 'bottom', showLegend: true }, tooltip: { mode: 'single', sort: 'none' } } }
    ),
    pgPanel(
      7,
      'Weekly cohort: signups vs active in week+1',
      'signup_week cohort; active_w1 = users with last_login in the 7 days after their signup week ended.',
      'table',
      { h: 10, w: 12, x: 12, y: 14 },
      `WITH base AS (
         SELECT id,
                date_trunc('week', created_at) AS signup_week,
                created_at,
                last_login
         FROM public.users
         WHERE deleted_at IS NULL
           AND created_at >= NOW() - INTERVAL '365 days'
       )
       SELECT signup_week::date AS cohort_week,
              COUNT(*) AS signups,
              COUNT(*) FILTER (
                WHERE last_login IS NOT NULL
                  AND last_login >= signup_week + INTERVAL '7 days'
                  AND last_login < signup_week + INTERVAL '14 days'
              ) AS active_week_after_signup
       FROM base
       GROUP BY signup_week
       ORDER BY signup_week DESC
       LIMIT 26`,
      'table',
      { options: { showHeader: true, sortBy: [] } }
    ),
  ];
  return d;
}

function dash13() {
  const d = baseDash('Email & Notification Delivery', 'mockcoach-email-notifications', ['mockcoach', 'business', 'postgres', 'prometheus'], {
    description:
      '**notifications** table for in-app/email volume. Prometheus for BullMQ **email-sending** queue metrics.',
    time: { from: 'now-30d', to: 'now' },
  });
  d.panels = [
    pgPanel(
      1,
      'Total email-capable notifications (range)',
      'channel in (email, both), time filtered.',
      'stat',
      { h: 4, w: 6, x: 0, y: 0 },
      `SELECT COUNT(*)::numeric AS value
       FROM public.notifications
       WHERE $__timeFilter(created_at)
         AND channel IN ('email', 'both')`,
      'table',
      { options: { reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false }, colorMode: 'value', graphMode: 'none' } }
    ),
    pgPanel(
      2,
      'Unread rate % (range)',
      'Among rows in time range.',
      'gauge',
      { h: 4, w: 6, x: 6, y: 0 },
      `SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE NOT is_read) / NULLIF(COUNT(*),0), 2)::numeric AS value
       FROM public.notifications
       WHERE $__timeFilter(created_at)`,
      'table',
      {
        unit: 'percent',
        min: 0,
        max: 100,
        thresholds: {
          mode: 'absolute',
          steps: [
            { color: 'green', value: null },
            { color: 'yellow', value: 20 },
            { color: 'red', value: 40 },
          ],
        },
        options: { showThresholdMarkers: true, reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false } },
      }
    ),
    promPanel(
      3,
      'Email queue depth (Prometheus)',
      'mockcoach_worker_queue_depth{queue="email-sending"}.',
      'timeseries',
      { h: 5, w: 6, x: 12, y: 0 },
      `mockcoach_worker_queue_depth{queue="email-sending"}`
    ),
    promPanel(
      4,
      'email-sending job failures (instant)',
      'mockcoach_worker_jobs_failed gauge.',
      'stat',
      { h: 5, w: 6, x: 18, y: 0 },
      `mockcoach_worker_jobs_failed{queue="email-sending"}`,
      'table',
      { instant: true, options: { reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false }, colorMode: 'value', graphMode: 'none' } }
    ),
    pgPanel(
      5,
      'Email volume by notification type (top 10)',
      'channel in (email, both).',
      'barchart',
      { h: 8, w: 12, x: 0, y: 5 },
      `SELECT type AS metric, COUNT(*)::float AS value
       FROM public.notifications
       WHERE $__timeFilter(created_at)
         AND channel IN ('email', 'both')
       GROUP BY type
       ORDER BY value DESC
       LIMIT 10`,
      'table',
      { options: { orientation: 'horizontal', showValue: 'auto', stacking: 'none', xTickLabelRotation: 0 } }
    ),
    pgPanel(
      6,
      'Daily email notification volume',
      'channel email or both.',
      'timeseries',
      { h: 8, w: 12, x: 12, y: 5 },
      `SELECT date_trunc('day', created_at)::timestamp AS time,
              COUNT(*)::double precision AS value
       FROM public.notifications
       WHERE $__timeFilter(created_at)
         AND channel IN ('email', 'both')
       GROUP BY 1 ORDER BY 1`,
      'time_series',
      { custom: { ...tsFill, drawStyle: 'bars', fillOpacity: 25 }, options: { legend: { displayMode: 'list', placement: 'bottom', showLegend: true }, tooltip: { mode: 'single', sort: 'none' } } }
    ),
    pgPanel(
      7,
      'ATS / apply-related emails (heuristic)',
      'Filters type/title/body for ats, apply, job. Tune patterns for your notification type strings.',
      'timeseries',
      { h: 8, w: 24, x: 0, y: 13 },
      `SELECT date_trunc('day', created_at)::timestamp AS time,
              COUNT(*)::double precision AS value
       FROM public.notifications
       WHERE $__timeFilter(created_at)
         AND channel IN ('email', 'both')
         AND (
           LOWER(type) LIKE '%ats%'
           OR LOWER(title) LIKE '%apply%'
           OR LOWER(title) LIKE '%application%'
           OR LOWER(body) LIKE '%apply%'
         )
       GROUP BY 1 ORDER BY 1`,
      'time_series',
      { custom: tsFill, options: { legend: { displayMode: 'list', placement: 'bottom', showLegend: true }, tooltip: { mode: 'single', sort: 'none' } } }
    ),
    promPanel(
      8,
      'Worker jobs email-sending (rate by status)',
      'rate(mockcoach_worker_jobs_total{job_type="email-sending"}[5m]) — adjust job_type label if your worker uses a different job_type string.',
      'timeseries',
      { h: 8, w: 12, x: 0, y: 21 },
      `sum by (status) (rate(mockcoach_worker_jobs_total{job_type="email-sending"}[5m]))`,
      'time_series',
      { legendFormat: '{{status}}', options: { legend: { displayMode: 'table', placement: 'bottom', showLegend: true }, tooltip: { mode: 'multi', sort: 'desc' } } }
    ),
    promPanel(
      9,
      'Worker jobs email-sending (fallback: any job_type matching email)',
      'If job_type label differs, use this broader regex.',
      'timeseries',
      { h: 8, w: 12, x: 12, y: 21 },
      `sum by (status, job_type) (rate(mockcoach_worker_jobs_total{job_type=~".*email.*"}[5m]))`,
      'time_series',
      { options: { legend: { displayMode: 'table', placement: 'bottom', showLegend: true }, tooltip: { mode: 'multi', sort: 'desc' } } }
    ),
  ];
  return d;
}

function dash08() {
  const d = baseDash('Engagement & Gamification', 'mockcoach-engagement', ['mockcoach', 'business', 'postgres'], {
    description:
      'Referral lifecycle from **referrals** (Postgres). XP / learning panels remain TestData until instrumented in SQL. Reward constants: REFERRER_XP=200, REFERRED_XP=100, REFERRER_BONUS_REQUESTS=2, REFERRED_PREMIUM_DAYS (document in product).',
    time: { from: 'now-90d', to: 'now' },
  });
  let id = 0;
  const nid = () => ++id;
  d.panels = [
    {
      id: nid(),
      type: 'text',
      title: 'Referral rewards (product constants)',
      gridPos: { h: 3, w: 24, x: 0, y: 0 },
      options: {
        mode: 'markdown',
        content:
          '| Constant | Value |\n|----------|-------|\n| REFERRER_XP | 200 |\n| REFERRED_XP | 100 |\n| REFERRER_BONUS_REQUESTS | 2 |\n| REFERRED_PREMIUM_DAYS | (set in app config) |\n\nStatuses in DB: pending, signed_up, verified, activated, rewarded, completed, expired.',
      },
    },
    pgPanel(
      nid(),
      'Referral lifecycle funnel (counts in range)',
      'Ordered statuses from referrals.status.',
      'barchart',
      { h: 8, w: 12, x: 0, y: 3 },
      `SELECT status AS metric, COUNT(*)::float AS value
       FROM public.referrals
       WHERE $__timeFilter(created_at)
       GROUP BY status`,
      'table',
      { options: { orientation: 'horizontal', showValue: 'auto', stacking: 'none', xTickLabelRotation: 0 } }
    ),
    pgPanel(
      nid(),
      'Referral conversion % (rewarded / pending baseline)',
      'rewarded / NULLIF(all referrals in range,0). Adjust definition as needed.',
      'stat',
      { h: 5, w: 6, x: 12, y: 3 },
      `SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'rewarded') / NULLIF(COUNT(*), 0), 2)::numeric AS value
       FROM public.referrals
       WHERE $__timeFilter(created_at)`,
      'table',
      {
        unit: 'percent',
        thresholds: {
          mode: 'absolute',
          steps: [
            { color: 'red', value: null },
            { color: 'yellow', value: 5 },
            { color: 'green', value: 15 },
          ],
        },
        options: { reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false }, colorMode: 'background', graphMode: 'none' },
      }
    ),
    pgPanel(
      nid(),
      'Expired referrals (range)',
      'status = expired within $__timeFilter(created_at).',
      'stat',
      { h: 5, w: 6, x: 18, y: 3 },
      `SELECT COUNT(*)::numeric AS value
       FROM public.referrals
       WHERE $__timeFilter(created_at)
         AND status = 'expired'`,
      'table',
      { options: { reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false }, colorMode: 'value', graphMode: 'none' } }
    ),
    pgPanel(
      nid(),
      'Top referrers',
      'By count of referrals created in range.',
      'table',
      { h: 9, w: 12, x: 0, y: 11 },
      `SELECT referrer_id::text, COUNT(*) AS referral_count
       FROM public.referrals
       WHERE $__timeFilter(created_at)
       GROUP BY referrer_id
       ORDER BY referral_count DESC
       LIMIT 30`,
      'table',
      { options: { showHeader: true, sortBy: [{ displayName: 'referral_count', desc: true }] } }
    ),
    pgPanel(
      nid(),
      'Referrals per day',
      'Time series volume.',
      'timeseries',
      { h: 9, w: 12, x: 12, y: 11 },
      `SELECT date_trunc('day', created_at)::timestamp AS time,
              COUNT(*)::double precision AS value
       FROM public.referrals
       WHERE $__timeFilter(created_at)
       GROUP BY 1 ORDER BY 1`,
      'time_series',
      { custom: tsFill, options: { legend: { displayMode: 'list', placement: 'bottom', showLegend: true }, tooltip: { mode: 'single', sort: 'none' } } }
    ),
    tdPanel(nid(), 'Badges Earned per Day (placeholder)', 'Wire badge_events table when available.', { h: 7, w: 12, x: 0, y: 20 }, 'badges'),
    tdPanel(nid(), 'XP Events per Day (placeholder)', 'Wire xp ledger when available.', { h: 7, w: 12, x: 12, y: 20 }, 'xp'),
    tdPanel(nid(), 'Learning clicks (placeholder)', 'Use learning_resource analytics table if added.', { h: 7, w: 12, x: 0, y: 27 }, 'learning'),
    tdPanel(nid(), 'Connection activity (placeholder)', 'Use marketplace connection tables when wired.', { h: 7, w: 12, x: 12, y: 27 }, 'connections'),
  ];
  return d;
}

function assignIds(doc) {
  let pid = 1;
  for (const p of doc.panels) {
    p.id = pid++;
  }
}

const out = [
  ['09-active-customers.json', dash09],
  ['10-openai-cost.json', dash10],
  ['11-ats-hiring-funnel.json', dash11],
  ['12-user-signups.json', dash12],
  ['13-email-notifications.json', dash13],
  ['08-engagement.json', dash08],
];

for (const [name, fn] of out) {
  const doc = fn();
  assignIds(doc);
  fs.writeFileSync(path.join(dashDir, name), JSON.stringify(doc, null, 2));
  console.log('wrote', name);
}
