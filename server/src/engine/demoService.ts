import type {
  ArtifactContentResponse,
  ArtifactInfo,
  BoardResponse,
  BoardSettings,
  ConversationCard,
  ConversationDetail,
  HealthResponse,
  OverlayData,
  OverlayPatch,
  ReviewBatchResponse,
  SearchMatchField,
  SearchResponse,
  SearchResult,
  StepItem,
  SubagentInfo,
  SwarmDetail,
  TimelineTurn,
  TokenUsage,
} from '../../../shared/types.js';
import { APP_VERSION } from '../config.js';
import { OverlayStore } from '../db/overlayDb.js';
import { summarizeSubagents } from '../parsers/subagents.js';
import { toSwarmSummary } from '../parsers/swarm.js';
import { finalizeTokenUsage } from '../parsers/transcript.js';
import { isValidConversationId } from '../utils/pathSafety.js';
import { assembleBoardResponse, classifyConversation } from './classifier.js';
import type { IBoardService } from './types.js';

interface DemoSeedRecord {
  id: string;
  title: string;
  preview: string;
  project: string;
  projectId: string;
  workspace: string;
  workspacePath: string;
  status: string;
  notFullyIdle: boolean;
  isArchived: boolean;
  minutesAgoModified: number;
  minutesAgoUserInput: number;
  minutesAgoUserView: number | null;
  markedAsUnread: boolean;
  planExecute: boolean;
  currentFocus: string | null;
  steps: StepItem[];
  stepCount: number;
  hasError: boolean;
  lastError: string | null;
  hasPendingQuestion: boolean;
  pendingQuestionText: string | null;
  models: string[];
  tokens: TokenUsage;
  swarmDetail: SwarmDetail | null;
  subagents: SubagentInfo[];
  artifacts: Array<ArtifactInfo & { content: string }>;
  timeline: TimelineTurn[];
  sideQuestions: Array<{ id: string; title: string }>;
  initialOverlay?: OverlayPatch;
}

function isoMinutesAgo(baseMs: number, minutesAgo: number): string {
  return new Date(baseMs - minutesAgo * 60_000).toISOString();
}

function buildDemoSeeds(baseMs: number): DemoSeedRecord[] {
  const swarm1Messages = [
    {
      seq: 1,
      agent: 'coordinator',
      text: '@api-migrator Migrate checkout and subscription endpoints from Stripe v1 SDK to v2 client with idempotency keys.',
      time: '2026-11-24 09:12:04',
      kind: 'brief',
    },
    {
      seq: 2,
      agent: 'coordinator',
      text: '@webhook-verifier Add signature replay protection and idempotent event ledger for invoice.paid and customer.subscription.updated.',
      time: '2026-11-24 09:12:06',
      kind: 'brief',
    },
    {
      seq: 3,
      agent: 'api-migrator',
      text: 'Migrated `src/billing/checkout.ts` and `src/billing/subscriptions.ts` to Stripe SDK v2. Running unit suite now.',
      time: '2026-11-24 09:24:18',
    },
    {
      seq: 4,
      agent: 'webhook-verifier',
      text: 'Added `webhook_events` deduplication table and 5-minute timestamp tolerance check. Replaying 18 fixture payloads.',
      time: '2026-11-24 09:28:42',
    },
    {
      seq: 5,
      agent: 'docs-writer',
      text: '@coordinator [done] Updated `docs/billing-migration.md` with rollback steps and env var checklist.',
      time: '2026-11-24 09:31:09',
    },
    {
      seq: 6,
      agent: 'api-migrator',
      text: 'All 42 billing unit tests pass; moving on to integration contract verification with @webhook-verifier.',
      time: '2026-11-24 09:34:51',
    },
  ];

  const swarm1: SwarmDetail = {
    swarmId: 'swarm-billing-v2',
    title: 'Stripe v2 Billing Migration',
    createdAt: isoMinutesAgo(baseMs, 42),
    goalTitle: 'Zero-downtime Stripe SDK v2 cutover',
    goalLine: 'Migrate checkout, subscription lifecycle, and webhook deduplication with full replay tests.',
    threads: [
      {
        id: 'thread-sdk',
        title: 'SDK & Checkout Refactor',
        goal: 'Upgrade API client and maintain backwards-compatible response shapes',
        tasks: ['api-migrator'],
      },
      {
        id: 'thread-webhooks',
        title: 'Webhook Idempotency & Docs',
        goal: 'Prevent duplicate invoice processing and document canary rollout',
        tasks: ['webhook-verifier', 'docs-writer'],
      },
    ],
    members: [
      {
        name: 'coordinator',
        conversationId: 'demo-01',
        role: 'coordinator',
        state: 'waiting',
        phase: 'RUNNING',
        desiredState: 'RUNNING',
        wakeMode: 'mentions',
        workspaceMode: 'inherit',
        model: 'claude-sonnet-4-5',
        killed: false,
        task: 'Coordinate Stripe v2 migration and merge worker branches',
        lastReadSeq: 6,
        waitSince: 6,
        isRunning: false,
      },
      {
        name: 'api-migrator',
        conversationId: 'demo-01-w1',
        role: 'worker',
        state: 'working',
        phase: 'RUNNING',
        desiredState: 'RUNNING',
        wakeMode: 'working',
        workspaceMode: 'share',
        model: 'claude-sonnet-4-5',
        killed: false,
        task: 'Migrate checkout & subscription endpoints to Stripe v2',
        lastReadSeq: 6,
        waitSince: 0,
        isRunning: true,
      },
      {
        name: 'webhook-verifier',
        conversationId: 'demo-01-w2',
        role: 'worker',
        state: 'working',
        phase: 'RUNNING',
        desiredState: 'RUNNING',
        wakeMode: 'working',
        workspaceMode: 'share',
        model: 'gemini-2.5-pro',
        killed: false,
        task: 'Verify webhook signatures and idempotency replay suite',
        lastReadSeq: 5,
        waitSince: 0,
        isRunning: true,
      },
      {
        name: 'docs-writer',
        conversationId: 'demo-01-w3',
        role: 'worker',
        state: 'waiting',
        phase: 'RUNNING',
        desiredState: 'RUNNING',
        wakeMode: 'mentions',
        workspaceMode: 'inherit',
        model: 'gemini-2.5-flash',
        killed: false,
        task: 'Update migration guide and runbook',
        lastReadSeq: 5,
        waitSince: 5,
        isRunning: false,
      },
    ],
    workingCount: 2,
    waitingCount: 2,
    killedCount: 0,
    totalMembers: 4,
    messageCount: swarm1Messages.length,
    recentMessages: swarm1Messages.slice(-6),
    tasks: {
      'api-migrator': 'Migrate checkout & subscription endpoints to Stripe v2',
      'webhook-verifier': 'Verify webhook signatures and idempotency replay suite',
      'docs-writer': 'Update migration guide and runbook',
    },
    messages: swarm1Messages,
  };

  const swarm2Messages = [
    {
      seq: 1,
      agent: 'coordinator',
      text: '@query-worker Build funnel conversion SQL aggregator with cohort date filters.',
      time: '2026-11-24 08:05:10',
      kind: 'brief',
    },
    {
      seq: 2,
      agent: 'coordinator',
      text: '@chart-ui Implement responsive SVG funnel visualization with hover drop-off tooltips.',
      time: '2026-11-24 08:05:12',
      kind: 'brief',
    },
    {
      seq: 3,
      agent: 'query-worker',
      text: '@coordinator [done] Added `/api/funnels/query` endpoint and verified sub-80ms P95 on 5M events.',
      time: '2026-11-24 08:22:31',
    },
    {
      seq: 4,
      agent: 'chart-ui',
      text: '@coordinator [done] Built `FunnelChart.tsx` with dark mode tokens, tabular percentages, and CSV export.',
      time: '2026-11-24 08:29:44',
    },
  ];

  const swarm2: SwarmDetail = {
    swarmId: 'swarm-funnel-widget',
    title: 'Real-Time Funnel Widget',
    createdAt: isoMinutesAgo(baseMs, 110),
    goalTitle: 'Ship interactive conversion funnel widget',
    goalLine: 'Deliver end-to-end funnel query API and responsive chart component.',
    threads: [
      {
        id: 'thread-funnel-api',
        title: 'Funnel Aggregation API',
        goal: 'Fast cohort funnel query builder',
        tasks: ['query-worker'],
      },
      {
        id: 'thread-funnel-ui',
        title: 'Funnel Visualization UI',
        goal: 'Accessible interactive chart with drop-off rates',
        tasks: ['chart-ui'],
      },
    ],
    members: [
      {
        name: 'coordinator',
        conversationId: 'demo-07',
        role: 'coordinator',
        state: 'waiting',
        phase: 'RUNNING',
        desiredState: 'RUNNING',
        wakeMode: 'mentions',
        workspaceMode: 'inherit',
        model: 'claude-sonnet-4-5',
        killed: false,
        task: 'Integrate API and UI and produce final walkthrough',
        lastReadSeq: 4,
        waitSince: 4,
        isRunning: false,
      },
      {
        name: 'query-worker',
        conversationId: 'demo-07-w1',
        role: 'worker',
        state: 'killed',
        phase: 'KILLED',
        desiredState: 'KILLED',
        wakeMode: 'mentions',
        workspaceMode: 'share',
        model: 'gemini-2.5-pro',
        killed: true,
        task: 'Build funnel conversion SQL aggregator',
        lastReadSeq: 4,
        waitSince: 3,
        isRunning: false,
      },
      {
        name: 'chart-ui',
        conversationId: 'demo-07-w2',
        role: 'worker',
        state: 'killed',
        phase: 'KILLED',
        desiredState: 'KILLED',
        wakeMode: 'mentions',
        workspaceMode: 'share',
        model: 'claude-sonnet-4-5',
        killed: true,
        task: 'Build responsive FunnelChart component',
        lastReadSeq: 4,
        waitSince: 4,
        isRunning: false,
      },
    ],
    workingCount: 0,
    waitingCount: 1,
    killedCount: 2,
    totalMembers: 3,
    messageCount: swarm2Messages.length,
    recentMessages: swarm2Messages,
    tasks: {
      'query-worker': 'Build funnel conversion SQL aggregator',
      'chart-ui': 'Build responsive FunnelChart component',
    },
    messages: swarm2Messages,
  };

  return [
    // ================= RUNNING (3) =================
    {
      id: 'demo-01',
      title: 'Migrate billing API to Stripe v2 & reconcile webhooks',
      preview: 'Swarm executing Stripe SDK v2 migration across checkout, subscriptions, and webhook ledger.',
      project: 'Aurora Platform',
      projectId: 'proj-aurora',
      workspace: 'aurora-cloud',
      workspacePath: '/workspace/aurora-cloud',
      status: 'CASCADE_RUN_STATUS_RUNNING',
      notFullyIdle: true,
      isArchived: false,
      minutesAgoModified: 1,
      minutesAgoUserInput: 42,
      minutesAgoUserView: 5,
      markedAsUnread: false,
      planExecute: true,
      currentFocus: 'Running end-to-end webhook replay verification',
      steps: [
        { title: 'Audit Stripe v1 endpoints & types', status: 'done' },
        { title: 'Upgrade SDK client and idempotency wrapper', status: 'done' },
        { title: 'Migrate checkout & subscription routes', status: 'done' },
        { title: 'Build webhook deduplication ledger', status: 'done' },
        { title: 'Run replay & integration test suite', status: 'in_progress' },
        { title: 'Finalize canary rollout checklist', status: 'pending' },
      ],
      stepCount: 68,
      hasError: false,
      lastError: null,
      hasPendingQuestion: false,
      pendingQuestionText: null,
      models: ['claude-sonnet-4-5', 'gemini-2.5-pro'],
      tokens: finalizeTokenUsage(184_200, 1_120_400, 31_800),
      swarmDetail: swarm1,
      subagents: [],
      artifacts: [
        {
          fileName: 'webhook_migration_spec.md',
          relativePath: 'webhook_migration_spec.md',
          summary: 'Stripe v2 webhook idempotency design, schema changes, replay metrics, and rollback triggers.',
          updatedAt: isoMinutesAgo(baseMs, 14),
          userFacing: true,
          requestFeedback: false,
          sizeBytes: 2180,
          content: [
            '# Stripe v2 Webhook Migration Spec',
            '',
            '> Migrates Aurora Platform billing ingestion to Stripe SDK v2 with replay-safe idempotency and sub-30ms webhook acks.',
            '',
            '## Rollout Checklist',
            '- [x] Create `webhook_events` deduplication table with composite primary key',
            '- [x] Enforce 300-second timestamp tolerance on `Stripe-Signature` headers',
            '- [x] Migrate `checkout.session.completed` & `invoice.paid` handlers to v2 client',
            '- [ ] Complete replay verification on remaining subscription lifecycle fixtures',
            '- [ ] Enable 10% staging canary via `BILLING_STRIPE_V2_ENABLED=true`',
            '',
            '## Verification Matrix',
            '| Event Type | Fixtures | P95 Latency | Status |',
            '| --- | ---: | ---: | --- |',
            '| `checkout.session.completed` | 6 / 6 | 19 ms | Pass |',
            '| `invoice.paid` | 7 / 7 | 24 ms | Pass |',
            '| `customer.subscription.updated` | 4 / 5 | 27 ms | Running |',
            '',
            '## Idempotent Event Ledger (SQL)',
            '```sql',
            'CREATE TABLE IF NOT EXISTS webhook_events (',
            '  event_id     TEXT PRIMARY KEY,',
            '  event_type   TEXT NOT NULL,',
            '  payload_hash TEXT NOT NULL,',
            '  received_at  TIMESTAMPTZ NOT NULL DEFAULT now()',
            ');',
            '```',
            '',
            '## Replay Guard Middleware (TypeScript)',
            '```ts',
            'export async function recordWebhookOnce(db: Pool, evt: StripeEvent): Promise<boolean> {',
            '  const res = await db.query(',
            "    'INSERT INTO webhook_events(event_id, event_type, payload_hash) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',",
            '    [evt.id, evt.type, sha256(evt.rawBody)],',
            '  );',
            '  return res.rowCount === 1;',
            '}',
            '```',
            '',
            '## Rollback Plan',
            'Set `BILLING_STRIPE_V2_ENABLED=false` to return traffic to v1 handlers immediately without reversing the additive ledger table.',
            '',
          ].join('\n'),
        },
      ],
      timeline: [
        {
          stepIndex: 1,
          source: 'USER_EXPLICIT',
          type: 'USER_INPUT',
          status: 'DONE',
          createdAt: isoMinutesAgo(baseMs, 42),
          text: 'Migrate our billing API to Stripe SDK v2 and make webhook processing idempotent. Spin up a swarm so API, webhooks, and docs run in parallel.',
          toolNames: [],
        },
        {
          stepIndex: 12,
          source: 'MODEL',
          type: 'PLANNER_RESPONSE',
          status: 'DONE',
          createdAt: isoMinutesAgo(baseMs, 36),
          text: 'Spawned 3 swarm workers (`api-migrator`, `webhook-verifier`, `docs-writer`) in isolated workspaces. Shared contract written to `webhook_migration_spec.md`.',
          toolNames: ['swarm', 'write_file', 'update_steps'],
          model: 'claude-sonnet-4-5',
        },
        {
          stepIndex: 68,
          source: 'MODEL',
          type: 'PLANNER_RESPONSE',
          status: 'RUNNING',
          createdAt: isoMinutesAgo(baseMs, 1),
          text: 'Docs worker finished. `api-migrator` and `webhook-verifier` are currently validating the 18 webhook replay fixtures.',
          toolNames: ['read_board', 'update_focus'],
          model: 'claude-sonnet-4-5',
        },
      ],
      sideQuestions: [],
      initialOverlay: {
        pinned: true,
        priority: 'p0',
        tags: ['billing', 'release'],
        notes: 'Must land before Thursday staging freeze.',
      },
    },

    {
      id: 'demo-02',
      title: 'Optimize ClickHouse rollup materialized views',
      preview: 'Profiling daily rollup tables and testing MergeTree partition pruning under 50M synthetic rows.',
      project: 'Pulse Analytics',
      projectId: 'proj-pulse',
      workspace: 'pulse-analytics',
      workspacePath: '/workspace/pulse-analytics',
      status: 'CASCADE_RUN_STATUS_RUNNING',
      notFullyIdle: true,
      isArchived: false,
      minutesAgoModified: 2,
      minutesAgoUserInput: 25,
      minutesAgoUserView: 10,
      markedAsUnread: false,
      planExecute: false,
      currentFocus: 'Profiling partition pruning query latency',
      steps: [
        { title: 'Capture slow query plans from staging', status: 'done' },
        { title: 'Design AggregatingMergeTree rollup schema', status: 'done' },
        { title: 'Write backfill migration script', status: 'done' },
        { title: 'Benchmark P95 latency on 50M rows', status: 'in_progress' },
        { title: 'Update dashboard query adapter', status: 'pending' },
      ],
      stepCount: 41,
      hasError: false,
      lastError: null,
      hasPendingQuestion: false,
      pendingQuestionText: null,
      models: ['gemini-2.5-pro'],
      tokens: finalizeTokenUsage(96_500, 540_200, 18_400),
      swarmDetail: null,
      subagents: [
        {
          conversationId: 'demo-02-sub1',
          parentConversationId: 'demo-02',
          title: 'ClickHouse Query Benchmark Runner',
          typeName: 'benchmark',
          role: 'Execute load queries and collect P50/P95/P99 latency metrics',
          state: 'alive',
          isRunning: true,
          stepCount: 14,
          lastModifiedAt: isoMinutesAgo(baseMs, 1),
          spawnStepIndex: 28,
          nestingDepth: 1,
          children: [],
        },
        {
          conversationId: 'demo-02-sub2',
          parentConversationId: 'demo-02',
          title: 'Schema Compatibility Explorer',
          typeName: 'research',
          role: 'Inspect existing query builders for column dependencies',
          state: 'idle',
          isRunning: false,
          stepCount: 9,
          lastModifiedAt: isoMinutesAgo(baseMs, 16),
          spawnStepIndex: 7,
          nestingDepth: 1,
          children: [],
        },
      ],
      artifacts: [
        {
          fileName: 'query_benchmark.md',
          relativePath: 'query_benchmark.md',
          summary: 'Preliminary ClickHouse rollup benchmark comparing raw scans vs AggregatingMergeTree.',
          updatedAt: isoMinutesAgo(baseMs, 8),
          userFacing: true,
          requestFeedback: false,
          sizeBytes: 980,
          content: `# ClickHouse Rollup Benchmark (50M Events)

| Query | Baseline P95 | Rollup MV P95 | Speedup |
| --- | ---: | ---: | ---: |
| 30-day active users | 1,840 ms | 42 ms | **43.8x** |
| Hourly error rate | 920 ms | 28 ms | **32.9x** |
| Tenant retention cohort | 3,150 ms | 115 ms | **27.4x** |

> Memory peak dropped from 2.4 GB to 190 MB per concurrent query.
`,
        },
      ],
      timeline: [
        {
          stepIndex: 1,
          source: 'USER_EXPLICIT',
          type: 'USER_INPUT',
          status: 'DONE',
          createdAt: isoMinutesAgo(baseMs, 25),
          text: 'Our 30-day retention queries are timing out in ClickHouse. Design materialized rollups and benchmark them.',
          toolNames: [],
        },
        {
          stepIndex: 41,
          source: 'MODEL',
          type: 'PLANNER_RESPONSE',
          status: 'RUNNING',
          createdAt: isoMinutesAgo(baseMs, 2),
          text: 'Dispatched `benchmark` subagent to verify P95 latency across 30-day retention and hourly error queries.',
          toolNames: ['invoke_subagent', 'update_focus'],
          model: 'gemini-2.5-pro',
        },
      ],
      sideQuestions: [],
      initialOverlay: {
        priority: 'p1',
        tags: ['perf'],
      },
    },

    {
      id: 'demo-03',
      title: 'Add interactive diff preview to nova deploy',
      preview: 'Implementing colorized terminal plan diff with collapsible resource changes before apply.',
      project: 'Nova CLI',
      projectId: 'proj-nova',
      workspace: 'nova-cli',
      workspacePath: '/workspace/nova-cli',
      status: 'CASCADE_RUN_STATUS_RUNNING',
      notFullyIdle: false,
      isArchived: false,
      minutesAgoModified: 1,
      minutesAgoUserInput: 15,
      minutesAgoUserView: 12,
      markedAsUnread: false,
      planExecute: false,
      currentFocus: 'Writing snapshot tests for ANSI diff renderer',
      steps: [
        { title: 'Define ResourceDiff model & parser', status: 'done' },
        { title: 'Build ANSI tree & side-by-side renderer', status: 'done' },
        { title: 'Add snapshot tests for narrow terminals', status: 'in_progress' },
        { title: 'Wire --yes and --no-color CLI flags', status: 'pending' },
      ],
      stepCount: 23,
      hasError: false,
      lastError: null,
      hasPendingQuestion: false,
      pendingQuestionText: null,
      models: ['claude-sonnet-4-5'],
      tokens: finalizeTokenUsage(48_300, 210_900, 12_100),
      swarmDetail: null,
      subagents: [],
      artifacts: [],
      timeline: [
        {
          stepIndex: 1,
          source: 'USER_EXPLICIT',
          type: 'USER_INPUT',
          status: 'DONE',
          createdAt: isoMinutesAgo(baseMs, 15),
          text: 'Add an interactive diff preview to `nova deploy` that clearly highlights added/changed/destroyed fields.',
          toolNames: [],
        },
        {
          stepIndex: 23,
          source: 'MODEL',
          type: 'PLANNER_RESPONSE',
          status: 'RUNNING',
          createdAt: isoMinutesAgo(baseMs, 1),
          text: 'Core diff renderer is complete. Writing snapshot tests for 80-column and no-color terminals.',
          toolNames: ['write_file', 'run_command'],
          model: 'claude-sonnet-4-5',
        },
      ],
      sideQuestions: [],
      initialOverlay: {
        tags: ['cli'],
      },
    },

    // ================= NEEDS ATTENTION (4) =================
    {
      id: 'demo-04',
      title: 'RFC: Zero-downtime PostgreSQL partition migration',
      preview: 'Implementation plan ready for your approval before running dual-write trigger migration.',
      project: 'Aurora Platform',
      projectId: 'proj-aurora',
      workspace: 'aurora-cloud',
      workspacePath: '/workspace/aurora-cloud',
      status: 'CASCADE_RUN_STATUS_IDLE',
      notFullyIdle: false,
      isArchived: false,
      minutesAgoModified: 18,
      minutesAgoUserInput: 55,
      minutesAgoUserView: 35,
      markedAsUnread: true,
      planExecute: true,
      currentFocus: 'Waiting for approval on implementation_plan.md',
      steps: [
        { title: 'Analyze audit_logs table bloat & index footprint', status: 'done' },
        { title: 'Draft dual-write partition cutover RFC', status: 'done' },
        { title: 'User approval of cutover plan', status: 'in_progress' },
        { title: 'Generate migration SQL & verification scripts', status: 'pending' },
      ],
      stepCount: 29,
      hasError: false,
      lastError: null,
      hasPendingQuestion: false,
      pendingQuestionText: null,
      models: ['claude-opus-4-5'],
      tokens: finalizeTokenUsage(112_000, 680_000, 24_500),
      swarmDetail: null,
      subagents: [],
      artifacts: [
        {
          fileName: 'implementation_plan.md',
          relativePath: 'implementation_plan.md',
          summary: 'Zero-downtime monthly range partitioning plan for audit_logs (420 GB table). Requests sign-off before execution.',
          updatedAt: isoMinutesAgo(baseMs, 18),
          userFacing: true,
          requestFeedback: true,
          sizeBytes: 2240,
          content: [
            '# Implementation Plan: Zero-Downtime Partitioning for `audit_logs`',
            '',
            '## Problem Statement',
            '`audit_logs` has reached **420 GB** (~640M rows). Autovacuum cycles now exceed 4 hours and P99 insert latency degrades during monthly retention purges.',
            '',
            '## Execution Checklist',
            '- [x] Profile table bloat, index footprint, and staging IOPS headroom',
            '- [x] Design monthly `RANGE (created_at)` shadow table and dual-write trigger',
            '- [ ] Confirm 180-day archive vs drop policy before generating migration SQL',
            '- [ ] Execute throttled 50k-row backfill and atomic table swap',
            '',
            '## Cutover Metrics & Safeguards',
            '| Metric | Current | Target | Guardrail |',
            '| --- | ---: | ---: | --- |',
            '| Table size (active) | 420 GB | 70 GB / mo | 640 GB free |',
            '| Lock window | n/a | < 400 ms | `lock_timeout = 2s` |',
            '| Backfill IOPS | n/a | < 15% | 50k chunk pause |',
            '',
            '## Atomic Swap Preview (SQL)',
            '```sql',
            "SET lock_timeout = '2s';",
            'BEGIN;',
            '  ALTER TABLE audit_logs RENAME TO audit_logs_legacy;',
            '  ALTER TABLE audit_logs_v2 RENAME TO audit_logs;',
            'COMMIT;',
            '```',
            '',
            '## Decision Requested',
            'Please confirm whether retention should drop partitions older than **180 days** or archive them to object storage first.',
            '',
          ].join('\n'),
        },
      ],
      timeline: [
        {
          stepIndex: 1,
          source: 'USER_EXPLICIT',
          type: 'USER_INPUT',
          status: 'DONE',
          createdAt: isoMinutesAgo(baseMs, 55),
          text: 'Draft a safe zero-downtime plan to partition `audit_logs` by month without locking writes.',
          toolNames: [],
        },
        {
          stepIndex: 29,
          source: 'MODEL',
          type: 'PLANNER_RESPONSE',
          status: 'DONE',
          createdAt: isoMinutesAgo(baseMs, 18),
          text: 'Drafted `implementation_plan.md` with dual-write trigger, throttled backfill, and atomic swap strategy. Ready for your review before generating SQL migrations.',
          toolNames: ['write_file', 'update_steps'],
          model: 'claude-opus-4-5',
        },
      ],
      sideQuestions: [
        { id: 'demo-04-sq1', title: 'Check RDS IOPS burst quota limits' },
      ],
      initialOverlay: {
        pinned: true,
        priority: 'p0',
        tags: ['postgres'],
        notes: 'Confirm 180-day S3 archival requirement with security lead.',
      },
    },

    {
      id: 'demo-05',
      title: 'Select OAuth2 PKCE token storage strategy',
      preview: 'Agent paused via ask_question: choose OS keychain vs encrypted config file fallback.',
      project: 'Nova CLI',
      projectId: 'proj-nova',
      workspace: 'nova-cli',
      workspacePath: '/workspace/nova-cli',
      status: 'CASCADE_RUN_STATUS_IDLE',
      notFullyIdle: false,
      isArchived: false,
      minutesAgoModified: 27,
      minutesAgoUserInput: 40,
      minutesAgoUserView: 38,
      markedAsUnread: false,
      planExecute: false,
      currentFocus: 'Awaiting token storage preference',
      steps: [
        { title: 'Implement PKCE browser loopback callback', status: 'done' },
        { title: 'Choose cross-platform token storage backend', status: 'in_progress' },
        { title: 'Add token refresh middleware', status: 'pending' },
      ],
      stepCount: 19,
      hasError: false,
      lastError: null,
      hasPendingQuestion: true,
      pendingQuestionText:
        'For headless Linux environments without a keyring daemon, should Nova CLI fall back to AES-256-GCM encrypted `~/.nova/credentials.json` or require `NOVA_TOKEN` env var?',
      models: ['claude-sonnet-4-5'],
      tokens: finalizeTokenUsage(36_400, 142_000, 9_200),
      swarmDetail: null,
      subagents: [],
      artifacts: [],
      timeline: [
        {
          stepIndex: 1,
          source: 'USER_EXPLICIT',
          type: 'USER_INPUT',
          status: 'DONE',
          createdAt: isoMinutesAgo(baseMs, 40),
          text: 'Implement `nova login` using OAuth2 PKCE with secure local credential storage.',
          toolNames: [],
        },
        {
          stepIndex: 19,
          source: 'MODEL',
          type: 'PLANNER_RESPONSE',
          status: 'DONE',
          createdAt: isoMinutesAgo(baseMs, 27),
          text: 'PKCE loopback flow is ready. Need your decision on headless Linux fallback storage.',
          toolNames: ['ask_question'],
          model: 'claude-sonnet-4-5',
        },
      ],
      sideQuestions: [],
      initialOverlay: {
        priority: 'p1',
        tags: ['auth', 'cli'],
      },
    },

    {
      id: 'demo-06',
      title: 'Fix flaky E2E checkout test on Chromium 131',
      preview: 'Playwright test runner exited with timeout waiting for payment intent redirect.',
      project: 'Aurora Platform',
      projectId: 'proj-aurora',
      workspace: 'aurora-cloud',
      workspacePath: '/workspace/aurora-cloud',
      status: 'CASCADE_RUN_STATUS_IDLE',
      notFullyIdle: false,
      isArchived: false,
      minutesAgoModified: 44,
      minutesAgoUserInput: 62,
      minutesAgoUserView: 60,
      markedAsUnread: true,
      planExecute: false,
      currentFocus: 'Diagnosing flaky checkout redirect assertion',
      steps: [
        { title: 'Reproduce flake with --repeat-each=10', status: 'done' },
        { title: 'Inspect network trace around payment intent', status: 'done' },
        { title: 'Patch race condition in checkout button lock', status: 'failed' },
      ],
      stepCount: 31,
      hasError: true,
      lastError:
        'Test command failed (exit 1): TimeoutError: locator.waitFor: Timeout 15000ms exceeded waiting for [data-testid="order-confirmed"] on Chromium 131.',
      hasPendingQuestion: false,
      pendingQuestionText: null,
      models: ['gemini-2.5-pro'],
      tokens: finalizeTokenUsage(74_900, 310_500, 14_300),
      swarmDetail: null,
      subagents: [],
      artifacts: [],
      timeline: [
        {
          stepIndex: 1,
          source: 'USER_EXPLICIT',
          type: 'USER_INPUT',
          status: 'DONE',
          createdAt: isoMinutesAgo(baseMs, 62),
          text: 'Checkout E2E test started failing intermittently after updating to Chromium 131. Find the race and fix it.',
          toolNames: [],
        },
        {
          stepIndex: 31,
          source: 'SYSTEM',
          type: 'ERROR_MESSAGE',
          status: 'ERROR',
          createdAt: isoMinutesAgo(baseMs, 44),
          text: 'TimeoutError: locator.waitFor: Timeout 15000ms exceeded waiting for [data-testid="order-confirmed"] on Chromium 131.',
          toolNames: ['run_command'],
          errorMessage:
            'Test command failed (exit 1): TimeoutError: locator.waitFor: Timeout 15000ms exceeded waiting for [data-testid="order-confirmed"] on Chromium 131.',
        },
      ],
      sideQuestions: [],
      initialOverlay: {
        priority: 'p1',
        tags: ['e2e'],
        notes: 'Check if local Stripe mock container hit port collision.',
      },
    },

    {
      id: 'demo-07',
      title: 'Design & build real-time funnel chart widget',
      preview: 'Swarm completed query API + FunnelChart component; walkthrough ready to review.',
      project: 'Pulse Analytics',
      projectId: 'proj-pulse',
      workspace: 'pulse-analytics',
      workspacePath: '/workspace/pulse-analytics',
      status: 'CASCADE_RUN_STATUS_IDLE',
      notFullyIdle: false,
      isArchived: false,
      minutesAgoModified: 32,
      minutesAgoUserInput: 112,
      minutesAgoUserView: 95,
      markedAsUnread: true,
      planExecute: false,
      currentFocus: 'All swarm tasks complete — walkthrough published',
      steps: [
        { title: 'Define funnel query request/response schema', status: 'done' },
        { title: 'Implement ClickHouse cohort funnel API', status: 'done' },
        { title: 'Build interactive SVG FunnelChart UI', status: 'done' },
        { title: 'Add CSV export & dark mode tokens', status: 'done' },
        { title: 'Verify build and write walkthrough', status: 'done' },
      ],
      stepCount: 54,
      hasError: false,
      lastError: null,
      hasPendingQuestion: false,
      pendingQuestionText: null,
      models: ['claude-sonnet-4-5', 'gemini-2.5-pro'],
      tokens: finalizeTokenUsage(141_600, 892_000, 29_400),
      swarmDetail: swarm2,
      subagents: [],
      artifacts: [
        {
          fileName: 'walkthrough.md',
          relativePath: 'walkthrough.md',
          summary: 'End-to-end summary of the funnel API, SVG visualization, and benchmark results.',
          updatedAt: isoMinutesAgo(baseMs, 32),
          userFacing: true,
          requestFeedback: false,
          sizeBytes: 1120,
          content: `# Real-Time Funnel Chart Walkthrough

## What Shipped
- **Backend (\`query-worker\`)**: Added \`POST /api/funnels/query\` with parameterized step sequences, conversion window filters, and cohort breakdowns.
- **Frontend (\`chart-ui\`)**: Built \`FunnelChart.tsx\` with crisp hairline dividers, step-to-step drop-off pills, tabular numerals, and one-click CSV export.

## Verification
- Backend unit + integration tests: **28/28 passed**
- Query P95 latency on 5M events: **64 ms**
- Frontend \`tsc --noEmit\` & \`vite build\`: **0 errors**
`,
        },
      ],
      timeline: [
        {
          stepIndex: 1,
          source: 'USER_EXPLICIT',
          type: 'USER_INPUT',
          status: 'DONE',
          createdAt: isoMinutesAgo(baseMs, 112),
          text: 'Build a real-time conversion funnel widget end-to-end using a swarm for API and UI.',
          toolNames: [],
        },
        {
          stepIndex: 54,
          source: 'MODEL',
          type: 'PLANNER_RESPONSE',
          status: 'DONE',
          createdAt: isoMinutesAgo(baseMs, 32),
          text: 'Both workers finished and were cleanly integrated. See `walkthrough.md` for benchmark numbers and verification output.',
          toolNames: ['write_file', 'update_steps'],
          model: 'claude-sonnet-4-5',
        },
      ],
      sideQuestions: [],
      initialOverlay: {
        priority: 'p2',
        tags: ['frontend'],
      },
    },

    // ================= ACTIVE / IN PROGRESS (3) =================
    {
      id: 'demo-08',
      title: 'Refactor telemetry SDK batching & exponential backoff',
      preview: 'Implemented ring-buffer queue and jittered retry policy; pending browser beacon fallback.',
      project: 'Pulse Analytics',
      projectId: 'proj-pulse',
      workspace: 'pulse-analytics',
      workspacePath: '/workspace/pulse-analytics',
      status: 'CASCADE_RUN_STATUS_IDLE',
      notFullyIdle: false,
      isArchived: false,
      minutesAgoModified: 185,
      minutesAgoUserInput: 210,
      minutesAgoUserView: 170,
      markedAsUnread: false,
      planExecute: false,
      currentFocus: 'Implementing sendBeacon flush on pagehide',
      steps: [
        { title: 'Replace array queue with bounded ring buffer', status: 'done' },
        { title: 'Add full-jitter exponential backoff', status: 'done' },
        { title: 'Add sendBeacon flush on pagehide', status: 'in_progress' },
        { title: 'Publish size-limit bundle check', status: 'pending' },
      ],
      stepCount: 34,
      hasError: false,
      lastError: null,
      hasPendingQuestion: false,
      pendingQuestionText: null,
      models: ['claude-sonnet-4-5'],
      tokens: finalizeTokenUsage(62_400, 388_000, 15_700),
      swarmDetail: null,
      subagents: [],
      artifacts: [],
      timeline: [
        {
          stepIndex: 1,
          source: 'USER_EXPLICIT',
          type: 'USER_INPUT',
          status: 'DONE',
          createdAt: isoMinutesAgo(baseMs, 210),
          text: 'Refactor the browser telemetry SDK so offline bursts never exceed 256 KB and retry cleanly.',
          toolNames: [],
        },
        {
          stepIndex: 34,
          source: 'MODEL',
          type: 'PLANNER_RESPONSE',
          status: 'DONE',
          createdAt: isoMinutesAgo(baseMs, 185),
          text: 'Ring buffer and jittered exponential backoff are tested and merged locally. Ready to add `navigator.sendBeacon` flush next.',
          toolNames: ['edit_file', 'run_command'],
          model: 'claude-sonnet-4-5',
        },
      ],
      sideQuestions: [],
      initialOverlay: {
        priority: 'p2',
        tags: ['perf'],
        notes: 'Keep gzipped bundle under 6 KB.',
      },
    },

    {
      id: 'demo-09',
      title: 'Upgrade Vite 6 & Tailwind v4 design tokens',
      preview: 'Migrated CSS theme variables to @theme blocks and verified dark mode contrast ratios.',
      project: 'Aurora Platform',
      projectId: 'proj-aurora',
      workspace: 'aurora-cloud',
      workspacePath: '/workspace/aurora-cloud',
      status: 'CASCADE_RUN_STATUS_IDLE',
      notFullyIdle: false,
      isArchived: false,
      minutesAgoModified: 360,
      minutesAgoUserInput: 410,
      minutesAgoUserView: 340,
      markedAsUnread: false,
      planExecute: false,
      currentFocus: 'Auditing Storybook component snapshots',
      steps: [
        { title: 'Upgrade Vite & plugin-react packages', status: 'done' },
        { title: 'Port tailwind.config to CSS @theme tokens', status: 'done' },
        { title: 'Fix PostCSS plugin warnings', status: 'done' },
        { title: 'Update visual regression baselines', status: 'pending' },
      ],
      stepCount: 27,
      hasError: false,
      lastError: null,
      hasPendingQuestion: false,
      pendingQuestionText: null,
      models: ['gemini-2.5-flash', 'claude-sonnet-4-5'],
      tokens: finalizeTokenUsage(51_200, 290_000, 11_400),
      swarmDetail: null,
      subagents: [],
      artifacts: [],
      timeline: [
        {
          stepIndex: 27,
          source: 'MODEL',
          type: 'PLANNER_RESPONSE',
          status: 'DONE',
          createdAt: isoMinutesAgo(baseMs, 360),
          text: 'Vite 6 production build succeeds in 3.1s (down from 6.4s). Only visual regression baseline updates remain.',
          toolNames: ['run_command', 'update_steps'],
          model: 'claude-sonnet-4-5',
        },
      ],
      sideQuestions: [],
      initialOverlay: {
        tags: ['frontend'],
      },
    },

    {
      id: 'demo-10',
      title: 'Add shell completion generator for zsh, fish, and PowerShell',
      preview: 'Added dynamic command-tree serializer for `nova completion <shell>`.',
      project: 'Nova CLI',
      projectId: 'proj-nova',
      workspace: 'nova-cli',
      workspacePath: '/workspace/nova-cli',
      status: 'CASCADE_RUN_STATUS_IDLE',
      notFullyIdle: false,
      isArchived: false,
      minutesAgoModified: 780,
      minutesAgoUserInput: 820,
      minutesAgoUserView: 760,
      markedAsUnread: false,
      planExecute: false,
      currentFocus: 'Testing PowerShell Register-ArgumentCompleter output',
      steps: [
        { title: 'Extract declarative command metadata tree', status: 'done' },
        { title: 'Implement zsh & fish templates', status: 'in_progress' },
        { title: 'Implement PowerShell completer script', status: 'pending' },
      ],
      stepCount: 16,
      hasError: false,
      lastError: null,
      hasPendingQuestion: false,
      pendingQuestionText: null,
      models: ['gemini-2.5-flash'],
      tokens: finalizeTokenUsage(24_800, 118_400, 7_900),
      swarmDetail: null,
      subagents: [],
      artifacts: [],
      timeline: [
        {
          stepIndex: 16,
          source: 'MODEL',
          type: 'PLANNER_RESPONSE',
          status: 'DONE',
          createdAt: isoMinutesAgo(baseMs, 780),
          text: 'Command metadata extractor landed cleanly. Next step is finalizing fish & PowerShell templates.',
          toolNames: ['write_file'],
          model: 'gemini-2.5-flash',
        },
      ],
      sideQuestions: [],
      initialOverlay: {
        tags: ['cli'],
      },
    },

    // ================= STALE (2) =================
    {
      id: 'demo-11',
      title: 'Draft multi-region failover runbook',
      preview: 'Documented DNS weight shifting and read-replica promotion; waiting on load test window.',
      project: 'Aurora Platform',
      projectId: 'proj-aurora',
      workspace: 'aurora-cloud',
      workspacePath: '/workspace/aurora-cloud',
      status: 'CASCADE_RUN_STATUS_IDLE',
      notFullyIdle: false,
      isArchived: false,
      minutesAgoModified: 60 * 118, // ~4.9 days ago
      minutesAgoUserInput: 60 * 120,
      minutesAgoUserView: 60 * 116,
      markedAsUnread: false,
      planExecute: false,
      currentFocus: 'Pending game-day drill schedule',
      steps: [
        { title: 'Inventory stateful services & RPO targets', status: 'done' },
        { title: 'Draft DNS + replica promotion steps', status: 'done' },
        { title: 'Automate health-check verification script', status: 'pending' },
        { title: 'Run staging failover game day', status: 'pending' },
      ],
      stepCount: 22,
      hasError: false,
      lastError: null,
      hasPendingQuestion: false,
      pendingQuestionText: null,
      models: ['claude-sonnet-4-5'],
      tokens: finalizeTokenUsage(44_100, 195_000, 10_200),
      swarmDetail: null,
      subagents: [],
      artifacts: [
        {
          fileName: 'failover_runbook.md',
          relativePath: 'failover_runbook.md',
          summary: 'Step-by-step regional failover procedure with RTO/RPO checklist.',
          updatedAt: isoMinutesAgo(baseMs, 60 * 118),
          userFacing: true,
          requestFeedback: false,
          sizeBytes: 820,
          content: `# Multi-Region Failover Runbook (Draft)

## Targets
- **RTO:** < 15 minutes
- **RPO:** < 30 seconds

## Sequence
1. Freeze deploys in primary region.
2. Promote \`eu-central-1\` PostgreSQL read replica.
3. Shift weighted DNS routing 0% -> 100% to secondary region.
4. Verify synthetic checkout probe & webhook delivery.
`,
        },
      ],
      timeline: [
        {
          stepIndex: 22,
          source: 'MODEL',
          type: 'PLANNER_RESPONSE',
          status: 'DONE',
          createdAt: isoMinutesAgo(baseMs, 60 * 118),
          text: 'Drafted `failover_runbook.md`. Ready to automate the pre-flight health check script whenever you schedule the staging drill.',
          toolNames: ['write_file'],
          model: 'claude-sonnet-4-5',
        },
      ],
      sideQuestions: [],
      initialOverlay: {
        tags: ['ops'],
        notes: 'Revisit after billing v2 release ships.',
      },
    },

    {
      id: 'demo-12',
      title: 'Investigate WebAssembly CSV parser memory spike',
      preview: 'Heap snapshot points to unfreed linear memory slices on files larger than 80 MB.',
      project: 'Pulse Analytics',
      projectId: 'proj-pulse',
      workspace: 'pulse-analytics',
      workspacePath: '/workspace/pulse-analytics',
      status: 'CASCADE_RUN_STATUS_IDLE',
      notFullyIdle: false,
      isArchived: false,
      minutesAgoModified: 60 * 148, // ~6.1 days ago
      minutesAgoUserInput: 60 * 150,
      minutesAgoUserView: 60 * 145,
      markedAsUnread: false,
      planExecute: false,
      currentFocus: 'Reproducing streaming chunk disposal in worker',
      steps: [
        { title: 'Capture Chrome heap timeline on 100 MB CSV', status: 'done' },
        { title: 'Patch WASM buffer reuse pool', status: 'pending' },
      ],
      stepCount: 14,
      hasError: false,
      lastError: null,
      hasPendingQuestion: false,
      pendingQuestionText: null,
      models: ['gemini-2.5-pro'],
      tokens: finalizeTokenUsage(29_700, 112_300, 6_400),
      swarmDetail: null,
      subagents: [],
      artifacts: [],
      timeline: [
        {
          stepIndex: 14,
          source: 'MODEL',
          type: 'PLANNER_RESPONSE',
          status: 'DONE',
          createdAt: isoMinutesAgo(baseMs, 60 * 148),
          text: 'Identified the retaining path inside the Web Worker chunk accumulator. Switching to a fixed 4 MB ring buffer will cap RSS.',
          toolNames: ['read_file'],
          model: 'gemini-2.5-pro',
        },
      ],
      sideQuestions: [],
      initialOverlay: {
        tags: ['perf'],
      },
    },

    // ================= ARCHIVED (2) =================
    {
      id: 'demo-13',
      title: 'Release v1.4.0 changelog & npm publish checklist',
      preview: 'Generated semantic changelog, tagged v1.4.0, and verified tarball contents.',
      project: 'Nova CLI',
      projectId: 'proj-nova',
      workspace: 'nova-cli',
      workspacePath: '/workspace/nova-cli',
      status: 'CASCADE_RUN_STATUS_IDLE',
      notFullyIdle: false,
      isArchived: true,
      minutesAgoModified: 60 * 210,
      minutesAgoUserInput: 60 * 215,
      minutesAgoUserView: 60 * 205,
      markedAsUnread: false,
      planExecute: false,
      currentFocus: null,
      steps: [
        { title: 'Compile PR changelog highlights', status: 'done' },
        { title: 'Run full CI matrix on Node 20 & 22', status: 'done' },
        { title: 'Verify npm pack tarball contents', status: 'done' },
        { title: 'Publish GitHub release notes', status: 'done' },
      ],
      stepCount: 18,
      hasError: false,
      lastError: null,
      hasPendingQuestion: false,
      pendingQuestionText: null,
      models: ['gemini-2.5-flash'],
      tokens: finalizeTokenUsage(19_500, 84_200, 5_100),
      swarmDetail: null,
      subagents: [],
      artifacts: [
        {
          fileName: 'release_notes.md',
          relativePath: 'release_notes.md',
          summary: 'Published v1.4.0 release highlights for Nova CLI.',
          updatedAt: isoMinutesAgo(baseMs, 60 * 210),
          userFacing: true,
          requestFeedback: false,
          sizeBytes: 540,
          content: `# Nova CLI v1.4.0

### Highlights
- Added parallel plugin preflight checks (3x faster cold start)
- Improved Windows path normalization in config resolver
- Fixed JSON output mode when stdout is piped
`,
        },
      ],
      timeline: [
        {
          stepIndex: 18,
          source: 'MODEL',
          type: 'PLANNER_RESPONSE',
          status: 'DONE',
          createdAt: isoMinutesAgo(baseMs, 60 * 210),
          text: 'Published v1.4.0 release notes and verified npm tarball integrity.',
          toolNames: ['write_file', 'run_command'],
          model: 'gemini-2.5-flash',
        },
      ],
      sideQuestions: [],
      initialOverlay: {
        tags: ['release'],
      },
    },

    {
      id: 'demo-14',
      title: 'Audit SOC2 structured log redaction filters',
      preview: 'Verified zero PII/token leakage across HTTP access, worker, and error log pipelines.',
      project: 'Aurora Platform',
      projectId: 'proj-aurora',
      workspace: 'aurora-cloud',
      workspacePath: '/workspace/aurora-cloud',
      status: 'CASCADE_RUN_STATUS_IDLE',
      notFullyIdle: false,
      isArchived: true,
      minutesAgoModified: 60 * 320,
      minutesAgoUserInput: 60 * 325,
      minutesAgoUserView: 60 * 315,
      markedAsUnread: false,
      planExecute: false,
      currentFocus: null,
      steps: [
        { title: 'Scan Pino redaction paths across all services', status: 'done' },
        { title: 'Add regression tests for bearer & cookie headers', status: 'done' },
        { title: 'Verify staging log sink scrubbing', status: 'done' },
      ],
      stepCount: 25,
      hasError: false,
      lastError: null,
      hasPendingQuestion: false,
      pendingQuestionText: null,
      models: ['claude-sonnet-4-5'],
      tokens: finalizeTokenUsage(41_000, 224_000, 9_800),
      swarmDetail: null,
      subagents: [],
      artifacts: [],
      timeline: [
        {
          stepIndex: 25,
          source: 'MODEL',
          type: 'PLANNER_RESPONSE',
          status: 'DONE',
          createdAt: isoMinutesAgo(baseMs, 60 * 320),
          text: 'Redaction audit completed with 100% pass rate on sensitive header fixtures.',
          toolNames: ['run_command'],
          model: 'claude-sonnet-4-5',
        },
      ],
      sideQuestions: [],
      initialOverlay: {
        tags: ['auth'],
      },
    },
  ];
}

export class DemoBoardService implements IBoardService {
  public readonly mode = 'demo' as const;
  private readonly baseMs = Date.now();
  private readonly seeds: DemoSeedRecord[];
  private readonly seedById = new Map<string, DemoSeedRecord>();
  private readonly overlayStore: OverlayStore;
  private readonly startedAt = Date.now();

  constructor() {
    this.seeds = buildDemoSeeds(this.baseMs);
    this.overlayStore = new OverlayStore(':memory:');
    for (const seed of this.seeds) {
      this.seedById.set(seed.id, seed);
      if (seed.initialOverlay) {
        this.overlayStore.patchOverlay(seed.id, seed.initialOverlay);
      }
    }
  }

  private buildCard(seed: DemoSeedRecord, settings: BoardSettings): ConversationCard {
    const overlay = this.overlayStore.getOverlay(seed.id);
    const lastModifiedAt = isoMinutesAgo(this.baseMs, seed.minutesAgoModified);
    const lastUserInputAt = isoMinutesAgo(this.baseMs, seed.minutesAgoUserInput);
    const lastUserViewAt =
      seed.minutesAgoUserView !== null ? isoMinutesAgo(this.baseMs, seed.minutesAgoUserView) : null;

    const swarm = seed.swarmDetail ? toSwarmSummary(seed.swarmDetail) : null;
    const subagentStats = summarizeSubagents(seed.subagents);
    const artifacts: ArtifactInfo[] = seed.artifacts.map(({ content: _c, ...meta }) => meta);

    const classification = classifyConversation({
      status: seed.status,
      notFullyIdle: seed.notFullyIdle,
      isArchived: seed.isArchived,
      lastModifiedAt,
      lastUserInputAt,
      lastUserViewAt,
      markedAsUnread: seed.markedAsUnread,
      hasPendingQuestion: seed.hasPendingQuestion,
      hasError: seed.hasError,
      artifacts,
      activeSubagentCount: subagentStats.activeCount,
      swarm,
      overlay,
      settings,
      nowMs: this.baseMs,
    });

    const stepsCompleted = seed.steps.filter((s) => s.status === 'done').length;

    return {
      id: seed.id,
      title: seed.title,
      preview: seed.preview,
      project: seed.project,
      projectId: seed.projectId,
      workspace: seed.workspace,
      workspacePath: seed.workspacePath,
      workspaceUris: [`file://${seed.workspacePath}`],

      lane: classification.lane,
      autoLane: classification.autoLane,
      isManualLane: classification.isManualLane,
      isRunning: classification.isRunning,
      isArchived: seed.isArchived,
      status: seed.status,
      notFullyIdle: seed.notFullyIdle,
      attentionReasons: classification.attentionReasons,

      currentFocus: seed.currentFocus,
      steps: seed.steps,
      stepsCompleted,
      stepsTotal: seed.steps.length,
      stepCount: seed.stepCount,

      lastModifiedAt,
      lastUserInputAt,
      lastUserViewAt,
      markedAsUnread: seed.markedAsUnread,
      planExecute: seed.planExecute,
      hasError: seed.hasError,
      hasPendingQuestion: seed.hasPendingQuestion,
      pendingFeedbackCount: classification.pendingFeedbackCount,

      models: seed.models,
      tokens: seed.tokens,

      swarm,
      subagentCount: subagentStats.totalCount,
      activeSubagentCount: subagentStats.activeCount,
      subagentsPreview: subagentStats.preview,
      artifactCount: artifacts.length,
      sideQuestionCount: seed.sideQuestions.length,

      overlay,
    };
  }

  getHealth(): HealthResponse {
    return {
      ok: true,
      mode: 'demo',
      version: APP_VERSION,
      dataDir: '(synthetic demo dataset)',
      dataDirAccessible: true,
      dbAccessible: true,
      conversationCount: this.seeds.length,
      uptimeSec: Math.floor((Date.now() - this.startedAt) / 1000),
    };
  }

  getBoard(): BoardResponse {
    const settings = this.overlayStore.getSettings();
    const cards = this.seeds.map((s) => this.buildCard(s, settings));
    return assembleBoardResponse('demo', cards, settings);
  }

  getConversationDetail(conversationId: string): ConversationDetail | null {
    if (!isValidConversationId(conversationId)) return null;
    const seed = this.seedById.get(conversationId);
    if (!seed) return null;

    const settings = this.overlayStore.getSettings();
    const card = this.buildCard(seed, settings);
    const artifacts: ArtifactInfo[] = seed.artifacts.map(({ content: _c, ...meta }) => meta);

    return {
      ...card,
      swarmDetail: seed.swarmDetail,
      subagents: seed.subagents,
      artifacts,
      timeline: seed.timeline,
      sideQuestions: seed.sideQuestions,
      lastError: seed.lastError,
      pendingQuestionText: seed.pendingQuestionText,
    };
  }

  readArtifact(conversationId: string, relativeFilePath: string): ArtifactContentResponse | null {
    if (!isValidConversationId(conversationId)) return null;
    const cleaned = relativeFilePath.replace(/\\/g, '/').trim();
    if (!cleaned || cleaned.includes('..') || cleaned.startsWith('/') || cleaned.includes('\0')) {
      return null;
    }

    const seed = this.seedById.get(conversationId);
    if (!seed) return null;

    const found = seed.artifacts.find((a) => a.relativePath === cleaned || a.fileName === cleaned);
    if (!found) return null;

    const { content, ...meta } = found;
    return {
      conversationId,
      fileName: found.fileName,
      relativePath: found.relativePath,
      content,
      truncated: false,
      sizeBytes: Buffer.byteLength(content, 'utf8'),
      metadata: meta,
    };
  }

  patchOverlay(
    conversationId: string,
    patch: OverlayPatch,
  ): { overlay: OverlayData; card: ConversationCard | null } {
    const overlay = this.overlayStore.patchOverlay(conversationId, patch);
    const seed = this.seedById.get(conversationId);
    const settings = this.overlayStore.getSettings();
    return {
      overlay,
      card: seed ? this.buildCard(seed, settings) : null,
    };
  }

  markReviewed(conversationId: string): { overlay: OverlayData; card: ConversationCard | null } {
    const overlay = this.overlayStore.markReviewed(conversationId);
    const seed = this.seedById.get(conversationId);
    const settings = this.overlayStore.getSettings();
    return {
      overlay,
      card: seed ? this.buildCard(seed, settings) : null,
    };
  }

  markReviewedBatch(ids: string[], reviewedAt?: string | null): ReviewBatchResponse {
    const uniqueIds = Array.from(new Set(ids));
    const appliedReviewedAt =
      reviewedAt === undefined ? new Date().toISOString() : reviewedAt;
    this.overlayStore.markReviewedBatch(uniqueIds, appliedReviewedAt);
    const settings = this.overlayStore.getSettings();
    const cards: ConversationCard[] = [];
    for (const id of uniqueIds) {
      const seed = this.seedById.get(id);
      if (seed) {
        cards.push(this.buildCard(seed, settings));
      }
    }
    return {
      updatedCount: uniqueIds.length,
      reviewedAt: appliedReviewedAt,
      cards,
    };
  }

  search(rawQuery: string): SearchResponse {
    const query = rawQuery.trim();
    if (!query) return { query: '', total: 0, results: [] };

    const lower = query.toLowerCase();
    const board = this.getBoard();
    const results: SearchResult[] = [];

    for (const card of board.conversations) {
      const seed = this.seedById.get(card.id);
      const matchedIn: SearchMatchField[] = [];
      let snippet = '';

      if (card.title.toLowerCase().includes(lower)) {
        matchedIn.push('title');
        snippet = card.title;
      }
      if (card.preview.toLowerCase().includes(lower)) {
        matchedIn.push('preview');
        if (!snippet) snippet = card.preview;
      }
      if (card.overlay.notes.toLowerCase().includes(lower)) {
        matchedIn.push('notes');
        if (!snippet) snippet = card.overlay.notes;
      }
      if (card.overlay.tags.some((t) => t.toLowerCase().includes(lower))) {
        matchedIn.push('tags');
        if (!snippet) snippet = card.overlay.tags.join(', ');
      }
      if (card.workspace.toLowerCase().includes(lower)) {
        matchedIn.push('workspace');
      }
      if (card.project.toLowerCase().includes(lower)) {
        matchedIn.push('project');
      }
      if (seed) {
        const turnHit = seed.timeline.find((t) => t.text.toLowerCase().includes(lower));
        if (turnHit) {
          matchedIn.push('transcript');
          if (!snippet) snippet = turnHit.text.slice(0, 180);
        }
      }

      if (matchedIn.length > 0) {
        results.push({
          conversationId: card.id,
          matchedIn,
          snippet: snippet || card.preview,
          card,
        });
      }
    }

    return {
      query,
      total: results.length,
      results,
    };
  }

  getSettings(): BoardSettings {
    return this.overlayStore.getSettings();
  }

  patchSettings(patch: Partial<BoardSettings>): BoardSettings {
    return this.overlayStore.patchSettings(patch);
  }

  close(): void {
    this.overlayStore.close();
  }
}
