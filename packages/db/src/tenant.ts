import { Prisma } from "./generated/prisma/client.ts";
import { prisma, type RawPrisma } from "./client.ts";

/**
 * Tenant-scoped data access.
 *
 * `forTenant(ctx)` returns a Prisma client that can only see and write rows of `ctx.organizationId`:
 *   - every read/update/delete gets `organizationId = ctx.organizationId` ANDed into its `where`;
 *   - every create must carry the same `organizationId` (anything else throws);
 *   - foreign keys written by the caller (locationId, contactId, …) must point at rows of the same tenant;
 *   - nested relation writes (connect/create/…) are rejected, so they can't bypass the checks above;
 *   - global tables (users, sessions, Stripe events, mock Google data) are not reachable at all.
 *
 * Relation reads (`include`/`select` of relations) are safe because every row reachable from a tenant row
 * was written through the same checks.
 */

export type TenantRole = "owner" | "staff";

export interface TenantContext {
  organizationId: string;
  userId?: string | null;
  role?: TenantRole;
  /** Platform admin id when the session is an impersonation. */
  impersonatorId?: string | null;
}

export class TenantViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantViolationError";
  }
}

type ModelName = Prisma.ModelName;

interface TenantModelConfig {
  /** Column holding the tenant id. */
  key: "organizationId" | "id";
  /** Rows with a null tenant are shared defaults (readable, never writable). */
  sharedNull?: boolean;
  /** No create/delete through the tenant client. */
  noCreateDelete?: boolean;
}

export const TENANT_MODELS = {
  Organization: { key: "id", noCreateDelete: true },
  Member: { key: "organizationId" },
  Invitation: { key: "organizationId" },
  NotificationPref: { key: "organizationId" },
  Location: { key: "organizationId" },
  BaselineSnapshot: { key: "organizationId" },
  LocationDailyStat: { key: "organizationId" },
  Stand: { key: "organizationId", noCreateDelete: true }, // stands are created/assigned by platform admin
  LinkEvent: { key: "organizationId" },
  PrivateFeedback: { key: "organizationId" },
  Review: { key: "organizationId" },
  ReviewSyncState: { key: "organizationId" },
  ReplySettings: { key: "organizationId" },
  ReviewReply: { key: "organizationId" },
  ReplyRevision: { key: "organizationId" },
  ReviewClassification: { key: "organizationId" },
  ViolationReport: { key: "organizationId" },
  Contact: { key: "organizationId" },
  ConsentEvent: { key: "organizationId" },
  Suppression: { key: "organizationId" },
  MessageTemplate: { key: "organizationId", sharedNull: true },
  Campaign: { key: "organizationId" },
  ReviewRequest: { key: "organizationId" },
  Message: { key: "organizationId" },
  InboundWebhook: { key: "organizationId" },
  Competitor: { key: "organizationId" },
  CompetitorSnapshot: { key: "organizationId" },
  Subscription: { key: "organizationId", noCreateDelete: true }, // written by the Stripe webhook (system)
  StoredFile: { key: "organizationId" },
  MonthlyReport: { key: "organizationId" },
  AuditLog: { key: "organizationId" },
} as const satisfies Partial<Record<ModelName, TenantModelConfig>>;

/** Tables that are deliberately not tenant-owned. A test asserts TENANT_MODELS ∪ GLOBAL_MODELS = all models. */
export const GLOBAL_MODELS = [
  "User",
  "Session",
  "Account",
  "Verification",
  "StripeEvent",
  "MockGbpLocation",
  "MockGbpReview",
  "MockPlace",
] as const satisfies readonly ModelName[];

export type TenantModelName = keyof typeof TENANT_MODELS;

/** Scalar foreign keys that must point at a row of the same tenant. */
const FOREIGN_KEYS: Record<string, TenantModelName> = {
  locationId: "Location",
  standId: "Stand",
  contactId: "Contact",
  campaignId: "Campaign",
  reviewId: "Review",
  replyId: "ReviewReply",
  competitorId: "Competitor",
  memberId: "Member",
  reviewRequestId: "ReviewRequest",
  attributedReviewId: "Review",
  fileId: "StoredFile",
  logoFileId: "StoredFile",
  emailTemplateId: "MessageTemplate",
  smsTemplateId: "MessageTemplate",
};

const READ_MANY = new Set(["findMany", "findFirst", "findFirstOrThrow", "count", "aggregate", "groupBy"]);
const READ_UNIQUE = new Set(["findUnique", "findUniqueOrThrow"]);
const WRITE_MANY = new Set(["updateMany", "updateManyAndReturn", "deleteMany"]);
const WRITE_UNIQUE = new Set(["update", "delete"]);
const CREATE = new Set(["create", "createMany", "createManyAndReturn"]);

let relationFieldsCache: Map<string, Set<string>> | undefined;

function relationFields(raw: RawPrisma, model: string): Set<string> {
  if (!relationFieldsCache) {
    relationFieldsCache = new Map();
    // The runtime data model ships with the generated client; a unit test guards this access.
    const models = (raw as unknown as { _runtimeDataModel: { models: Record<string, { fields: { name: string; kind: string }[] }> } })
      ._runtimeDataModel.models;
    for (const [name, def] of Object.entries(models)) {
      relationFieldsCache.set(name, new Set(def.fields.filter((f) => f.kind === "object").map((f) => f.name)));
    }
  }
  return relationFieldsCache.get(model) ?? new Set();
}

function toArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function scopeFilter(cfg: TenantModelConfig, orgId: string, forWrite: boolean): Record<string, unknown> {
  if (cfg.sharedNull && !forWrite) {
    return { OR: [{ [cfg.key]: orgId }, { [cfg.key]: null }] };
  }
  return { [cfg.key]: orgId };
}

function scopedWhere(where: Record<string, unknown> | undefined, filter: Record<string, unknown>) {
  const w = where ?? {};
  return { ...w, AND: [...toArray(w.AND as Record<string, unknown> | Record<string, unknown>[] | undefined), filter] };
}

export function createTenantClient(ctx: TenantContext, raw: RawPrisma = prisma()) {
  const orgId = ctx.organizationId;
  if (!orgId) throw new TenantViolationError("Tenant context without organizationId");

  async function assertForeignKeys(data: Record<string, unknown>) {
    for (const [field, target] of Object.entries(FOREIGN_KEYS)) {
      const value = data[field];
      if (typeof value !== "string") continue;
      const cfg: TenantModelConfig = TENANT_MODELS[target];
      const delegate = (raw as unknown as Record<string, { findFirst: (a: unknown) => Promise<unknown> }>)[
        target.charAt(0).toLowerCase() + target.slice(1)
      ]!;
      const found = await delegate.findFirst({ where: { id: value, ...scopeFilter(cfg, orgId, false) }, select: { id: true } });
      if (!found) throw new TenantViolationError(`${field}=${value} does not belong to this organization`);
    }
  }

  function assertNoNestedWrites(model: string, data: Record<string, unknown>) {
    // Object values on non-relation keys are scalar ops ({ set }, { push }, { increment }) or JSON: fine.
    const rel = relationFields(raw, model);
    for (const k of Object.keys(data)) {
      if (rel.has(k)) throw new TenantViolationError(`Nested relation write on ${model}.${k} is not allowed; use scalar ids`);
    }
  }

  async function checkCreateData(model: string, cfg: TenantModelConfig, data: Record<string, unknown>) {
    if (cfg.key === "organizationId") {
      if (data.organizationId === undefined) data.organizationId = orgId;
      if (data.organizationId !== orgId) throw new TenantViolationError(`Cannot create ${model} for another organization`);
    }
    assertNoNestedWrites(model, data);
    await assertForeignKeys(data);
  }

  async function checkUpdateData(model: string, cfg: TenantModelConfig, data: Record<string, unknown>) {
    if (cfg.key in data && data[cfg.key] !== orgId) {
      throw new TenantViolationError(`Cannot move ${model} to another organization`);
    }
    assertNoNestedWrites(model, data);
    await assertForeignKeys(data);
  }

  return raw.$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const cfg = (TENANT_MODELS as Record<string, TenantModelConfig>)[model];
          if (!cfg) throw new TenantViolationError(`Model ${model} is not accessible from a tenant context`);
          const a = (args ?? {}) as Record<string, any>;

          if (READ_MANY.has(operation)) {
            a.where = scopedWhere(a.where, scopeFilter(cfg, orgId, false));
          } else if (READ_UNIQUE.has(operation)) {
            a.where = scopedWhere(a.where, scopeFilter(cfg, orgId, false));
          } else if (CREATE.has(operation)) {
            if (cfg.noCreateDelete) throw new TenantViolationError(`${model} cannot be created from a tenant context`);
            for (const d of toArray(a.data)) await checkCreateData(model, cfg, d);
          } else if (WRITE_UNIQUE.has(operation) || WRITE_MANY.has(operation)) {
            if (operation.startsWith("delete") && cfg.noCreateDelete) {
              throw new TenantViolationError(`${model} cannot be deleted from a tenant context`);
            }
            a.where = scopedWhere(a.where, scopeFilter(cfg, orgId, true));
            if (a.data) await checkUpdateData(model, cfg, a.data);
          } else if (operation === "upsert") {
            if (cfg.noCreateDelete) throw new TenantViolationError(`${model} cannot be upserted from a tenant context`);
            a.where = scopedWhere(a.where, scopeFilter(cfg, orgId, true));
            await checkCreateData(model, cfg, a.create);
            await checkUpdateData(model, cfg, a.update);
          } else {
            throw new TenantViolationError(`Operation ${operation} is not allowed in a tenant context`);
          }
          return query(a);
        },
      },
    },
    client: {
      $queryRaw: () => {
        throw new TenantViolationError("Raw SQL is not available in a tenant context; add a scoped query in @avis/db");
      },
      $executeRaw: () => {
        throw new TenantViolationError("Raw SQL is not available in a tenant context");
      },
      $queryRawUnsafe: () => {
        throw new TenantViolationError("Raw SQL is not available in a tenant context");
      },
      $executeRawUnsafe: () => {
        throw new TenantViolationError("Raw SQL is not available in a tenant context");
      },
    },
  });
}

type ExtendedClient = ReturnType<typeof createTenantClient>;
type Delegates = { [K in TenantModelName as Uncapitalize<K>]: ExtendedClient[Uncapitalize<K>] };

/** What application code sees: tenant delegates + transactions + the context. Global tables are not in the type. */
export type TenantDb = Delegates & {
  $transaction: ExtendedClient["$transaction"];
  readonly ctx: Readonly<TenantContext>;
  readonly organizationId: string;
};

export function forTenant(ctx: TenantContext, raw: RawPrisma = prisma()): TenantDb {
  const client = createTenantClient(ctx, raw);
  return new Proxy(client as unknown as TenantDb, {
    get(target, prop, receiver) {
      if (prop === "ctx") return Object.freeze({ ...ctx });
      if (prop === "organizationId") return ctx.organizationId;
      if (typeof prop === "string" && /^[a-z]/.test(prop) && !prop.startsWith("$")) {
        const model = prop.charAt(0).toUpperCase() + prop.slice(1);
        if ((GLOBAL_MODELS as readonly string[]).includes(model)) {
          throw new TenantViolationError(`Model ${model} is not accessible from a tenant context`);
        }
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}
